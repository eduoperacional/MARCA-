import { and, asc, desc, eq } from "drizzle-orm"

import * as schema from "@/lib/db/schema"
import type { PlanRow, SubscriptionRow } from "@/lib/db/schema"
import { DEFAULT_TRIAL_DAYS } from "@/lib/billing/access"
import { ASAAS, parseAsaasDate, reprocessFailedEvents, type BillingDb } from "@/lib/billing/process-asaas-event"
import {
  attachGatewaySubscription,
  cancelSubscriptionLocal,
  changePlanLocal,
  createLocalSubscription,
  discardLocalSubscription,
  getCurrentSubscription,
  getGatewayCustomerId,
  hasHadSubscription,
  revertScheduledCancel,
  type Actor,
} from "@/lib/billing/subscriptions"

const { billingTransactions, plans } = schema

const DAY = 86_400_000

export type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD"

/** Operações do Asaas usadas aqui; injetadas para permitir testes sem rede. */
export type CheckoutGateway = {
  findCustomerByReference(externalReference: string): Promise<{ id: string } | null>
  createCustomer(input: {
    name: string
    cpfCnpj: string
    email?: string | null
    mobilePhone?: string | null
    externalReference: string
  }): Promise<{ id: string }>
  updateCustomer(id: string, input: { cpfCnpj: string }): Promise<{ id: string }>
  createSubscription(input: {
    customer: string
    value: number
    nextDueDate: string
    cycle: "MONTHLY" | "YEARLY"
    description: string
    externalReference: string
    billingType?: BillingType
  }): Promise<{ id: string }>
  updateSubscription(
    id: string,
    input: { value: number; cycle: "MONTHLY" | "YEARLY"; description: string; billingType?: BillingType }
  ): Promise<unknown>
  cancelSubscription(id: string): Promise<unknown>
  listSubscriptionPayments(id: string): Promise<
    { id: string; status: string; dueDate: string; value: number; invoiceUrl: string | null; bankSlipUrl?: string | null; billingType?: string }[]
  >
}

export class BillingRuleError extends Error {}

const cycle = (interval: "month" | "year") => (interval === "year" ? "YEARLY" : "MONTHLY")
const planDescription = (plan: PlanRow) => `MARCAÍ - Plano ${plan.name} (${plan.billingInterval === "year" ? "anual" : "mensal"})`

/** Data no fuso de Brasília no formato que o Asaas espera (AAAA-MM-DD). */
export function brazilDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date)
}

export function normalizeDocument(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "")
  return isValidCpf(digits) || isValidCnpj(digits) ? digits : null
}

function isValidCpf(d: string) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

function isValidCnpj(d: string) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export async function listPublicPlans(db: BillingDb) {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder), asc(plans.priceCents))
}

export async function getActivePlan(db: BillingDb, planId: string) {
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.isActive, true))).limit(1)
  return plan ?? null
}

/**
 * Registra como "pendente" as cobranças em aberto da assinatura para exibir o link de pagamento.
 * Nunca aprova: confirmação de pagamento chega somente pelo webhook autenticado.
 */
export async function syncPendingPayments(db: BillingDb, gateway: CheckoutGateway, sub: SubscriptionRow) {
  if (!sub.gatewaySubscriptionId) return []
  const payments = await gateway.listSubscriptionPayments(sub.gatewaySubscriptionId)
  const open = payments.filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
  for (const p of open) {
    const links = { invoiceUrl: p.invoiceUrl ?? null, bankSlipUrl: p.bankSlipUrl ?? null, dueDate: parseAsaasDate(p.dueDate) }
    await db
      .insert(billingTransactions)
      .values({
        businessId: sub.businessId,
        subscriptionId: sub.id,
        planId: sub.planId,
        amountCents: Math.round(p.value * 100),
        status: "pending",
        gateway: ASAAS,
        gatewayTransactionId: p.id,
        description: `Assinatura MARCAÍ`,
        ...links,
      })
      .onConflictDoUpdate({
        target: [billingTransactions.gateway, billingTransactions.gatewayTransactionId],
        set: { ...links, updatedAt: new Date() },
      })
  }
  const rows = await db
    .select({ id: billingTransactions.id, status: billingTransactions.status, gatewayTransactionId: billingTransactions.gatewayTransactionId, dueDate: billingTransactions.dueDate })
    .from(billingTransactions)
    .where(and(eq(billingTransactions.subscriptionId, sub.id), eq(billingTransactions.status, "pending")))
    .orderBy(asc(billingTransactions.dueDate))
  return rows
}

export async function startCheckout(
  db: BillingDb,
  gateway: CheckoutGateway,
  input: {
    business: { id: string; name: string; displayName: string | null; phone: string | null; createdAt: Date }
    user: { id: string; email: string }
    planId: string
    billingType: BillingType
    cpfCnpj: string
    now?: Date
  }
) {
  const now = input.now ?? new Date()
  const plan = await getActivePlan(db, input.planId)
  if (!plan) throw new BillingRuleError("Plano indisponível.")

  const current = await getCurrentSubscription(db, input.business.id)
  if (current?.gatewaySubscriptionId) {
    throw new BillingRuleError("Você já possui uma assinatura em andamento. Use a opção de mudar de plano.")
  }

  let customerId =
    (await getGatewayCustomerId(db, input.business.id)) ??
    (await gateway.findCustomerByReference(input.business.id))?.id ??
    null
  if (customerId) {
    await gateway.updateCustomer(customerId, { cpfCnpj: input.cpfCnpj })
  } else {
    const phone = input.business.phone?.replace(/\D/g, "") || null
    customerId = (
      await gateway.createCustomer({
        name: input.business.displayName || input.business.name,
        cpfCnpj: input.cpfCnpj,
        email: input.user.email,
        mobilePhone: phone,
        externalReference: input.business.id,
      })
    ).id
  }

  // Trial é do estabelecimento (desde o cadastro), não do plano: contratar não reinicia o teste.
  const trialEnd = new Date(input.business.createdAt.getTime() + DEFAULT_TRIAL_DAYS * DAY)
  const inTrial = !(await hasHadSubscription(db, input.business.id)) && trialEnd > now
  const trialDays = inTrial ? Math.max(1, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY)) : 0

  let sub: SubscriptionRow
  try {
    sub = await createLocalSubscription(db, {
      businessId: input.business.id,
      plan,
      trialDays,
      gatewayCustomerId: customerId,
      now,
    })
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
    if (code === "23505") throw new BillingRuleError("Já existe uma contratação em andamento. Atualize a página.")
    throw error
  }

  let gatewaySub: { id: string }
  try {
    gatewaySub = await gateway.createSubscription({
      customer: customerId,
      value: plan.priceCents / 100,
      nextDueDate: brazilDate(sub.trialEndsAt ?? now),
      cycle: cycle(plan.billingInterval),
      description: planDescription(plan),
      externalReference: sub.id,
      billingType: input.billingType,
    })
  } catch (error) {
    await discardLocalSubscription(db, sub.id)
    throw error
  }

  await attachGatewaySubscription(db, sub, gatewaySub.id)
  await reprocessFailedEvents(db, gatewaySub.id)
  const linked = { ...sub, gatewaySubscriptionId: gatewaySub.id }
  const pending = await syncPendingPayments(db, gateway, linked).catch((error) => {
    console.error("[billing] falha ao listar cobranças", error)
    return []
  })
  return { subscription: linked, plan, pendingTransactionId: pending[0]?.id ?? null }
}

export async function changeOwnPlan(db: BillingDb, gateway: CheckoutGateway, sub: SubscriptionRow, planId: string, actor: Actor) {
  if (!sub.gatewaySubscriptionId) throw new BillingRuleError("Contrate um plano antes de alterá-lo.")
  if (sub.status === "past_due" || sub.status === "suspended") {
    throw new BillingRuleError("Regularize a cobrança em aberto antes de mudar de plano.")
  }
  if (sub.cancelAtPeriodEnd) throw new BillingRuleError("A assinatura tem cancelamento agendado.")
  const plan = await getActivePlan(db, planId)
  if (!plan) throw new BillingRuleError("Plano indisponível.")
  if (plan.id === sub.planId) throw new BillingRuleError("Este já é o seu plano atual.")

  await gateway.updateSubscription(sub.gatewaySubscriptionId, {
    value: plan.priceCents / 100,
    cycle: cycle(plan.billingInterval),
    description: planDescription(plan),
  })
  await changePlanLocal(db, sub, plan, actor, "Alterado pelo proprietário")
  return plan
}

export async function cancelOwnSubscription(
  db: BillingDb,
  gateway: CheckoutGateway,
  sub: SubscriptionRow,
  mode: "now" | "period_end",
  actor: Actor,
  reason: string | null
) {
  const paidFuture = Boolean(sub.currentPeriodEnd && sub.currentPeriodEnd > new Date())
  if (mode === "period_end" && paidFuture && sub.gatewaySubscriptionId) {
    // Agenda localmente ANTES de cancelar no Asaas: o webhook SUBSCRIPTION_DELETED pode chegar
    // antes desta função terminar e, sem a marcação, encerraria o acesso já pago na hora.
    const result = await cancelSubscriptionLocal(db, sub, mode, actor, reason)
    try {
      await gateway.cancelSubscription(sub.gatewaySubscriptionId)
    } catch (error) {
      await revertScheduledCancel(db, sub, actor)
      throw error
    }
    return result
  }
  // Cancelamento imediato: interrompe as cobranças no Asaas antes de alterar o registro local.
  if (sub.gatewaySubscriptionId) await gateway.cancelSubscription(sub.gatewaySubscriptionId)
  return cancelSubscriptionLocal(db, sub, mode, actor, reason)
}

export async function getBillingOverview(db: BillingDb, businessId: string) {
  const sub = await getCurrentSubscription(db, businessId)
  const [plan] = sub ? await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1) : []
  const transactions = await db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.businessId, businessId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(36)
  const pending = transactions
    .filter((t) => t.status === "pending" && t.subscriptionId === sub?.id)
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
  return { subscription: sub, plan: plan ?? null, transactions, pending }
}

export async function getOwnTransaction(db: BillingDb, businessId: string, transactionId: string) {
  const [row] = await db
    .select()
    .from(billingTransactions)
    .where(and(eq(billingTransactions.id, transactionId), eq(billingTransactions.businessId, businessId)))
    .limit(1)
  return row ?? null
}

/** Limites do plano vigente. Sem assinatura (trial do cadastro) não há limite. */
export async function getPlanLimit(db: BillingDb, businessId: string, key: "professionals" | "services" | "members") {
  const sub = await getCurrentSubscription(db, businessId)
  const limit = sub?.limits?.[key]
  return typeof limit === "number" && limit > 0 ? limit : null
}
