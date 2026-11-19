import { and, asc, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm"

import * as schema from "@/lib/db/schema"
import type { BillingInterval, PromoRedemptionRow, SubscriptionRow } from "@/lib/db/schema"
import { businessTrialEnd } from "@/lib/billing/access"
import {
  PROMO_HOLD_MS,
  discountedCents,
  extendPromoHold,
  gatewayPriceCents,
  processPromoPriceSync,
  releaseAbandonedPromoReservations,
  reservePromoSlot,
} from "@/lib/billing/launch-promo"
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
  isContracted,
  revertScheduledCancel,
  runBillingMaintenance,
  type Actor,
} from "@/lib/billing/subscriptions"
import { isPlanAvailableTo } from "@/lib/billing/test-plan"

const { billingTransactions, businesses, plans, subscriptionEvents, subscriptions } = schema

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
    maxPayments?: number
  }): Promise<{ id: string }>
  /** Assinatura já criada no Asaas para este externalReference (recupera uma criação interrompida). */
  findSubscriptionByReference(externalReference: string): Promise<{ id: string } | null>
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
const planDescription = (plan: { name: string }, interval: BillingInterval) =>
  `MARCAÍ - Plano ${plan.name} (${interval === "year" ? "anual" : "mensal"})`

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

/** Planos do autoatendimento (Start, Pro e Elite). Planos ocultos e de teste nunca aparecem. */
export async function listPublicPlans(db: BillingDb) {
  const rows = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder), asc(plans.priceCents))
  return rows.filter((plan) => isPlanAvailableTo(plan))
}

/** Plano ativo e disponível no autoatendimento; a mesma regra da listagem vale no servidor. */
export async function getActivePlan(db: BillingDb, planId: string) {
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.isActive, true))).limit(1)
  return plan && isPlanAvailableTo(plan) ? plan : null
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
  const [business] = await db.select({ billingExempt: businesses.billingExempt }).from(businesses).where(eq(businesses.id, input.business.id)).limit(1)
  if (business?.billingExempt) throw new BillingRuleError("Este estabelecimento está isento de cobrança.")

  const plan = await getActivePlan(db, input.planId)
  if (!plan) throw new BillingRuleError("Plano indisponível.")

  const current = await getCurrentSubscription(db, input.business.id)
  if (current && isContracted(current)) {
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

  // Trial é do estabelecimento (7 dias desde o cadastro), não do plano: contratar, cancelar ou
  // recontratar não reinicia o prazo.
  const trialEnd = businessTrialEnd(input.business)
  const inTrial = !(await hasHadSubscription(db, input.business.id)) && trialEnd > now

  // A vaga da promoção é reservada na mesma transação da assinatura e segura até alguns dias após
  // a primeira cobrança (fim do trial ou agora). Sem pagamento nesse prazo, a vaga volta.
  const firstChargeAt = inTrial ? trialEnd : now
  let promo: PromoRedemptionRow | null = null
  let sub: SubscriptionRow
  try {
    sub = await createLocalSubscription(db, {
      businessId: input.business.id,
      plan,
      trialEndsAt: inTrial ? trialEnd : null,
      gatewayCustomerId: customerId,
      billingType: input.billingType,
      deferGateway: inTrial,
      now,
      afterInsert: async (tx, created) => {
        promo = await reservePromoSlot(tx, {
          sub: created,
          plan,
          now,
          holdUntil: new Date(firstChargeAt.getTime() + PROMO_HOLD_MS),
        })
      },
    })
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
    if (code === "23505") throw new BillingRuleError("Já existe uma contratação em andamento. Atualize a página.")
    throw error
  }

  // Durante o trial nada é criado no Asaas: criar a assinatura gera a primeira cobrança (e o
  // QR Code Pix) na hora, mesmo com vencimento futuro. O cron a cria ao fim do trial.
  const reserved = promo as PromoRedemptionRow | null
  if (sub.gatewayActivationStatus === "pending") {
    return { subscription: sub, plan, promo: reserved, pendingTransactionId: null }
  }

  const valueCents = reserved ? discountedCents(plan.priceCents, reserved.discountPercent) : plan.priceCents
  let gatewaySub: { id: string }
  try {
    gatewaySub = await gateway.createSubscription({
      customer: customerId,
      value: valueCents / 100,
      nextDueDate: brazilDate(now),
      cycle: cycle(plan.billingInterval),
      description: planDescription(plan, plan.billingInterval),
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
  return { subscription: linked, plan, promo: reserved, pendingTransactionId: pending[0]?.id ?? null }
}

export async function changeOwnPlan(db: BillingDb, gateway: CheckoutGateway, sub: SubscriptionRow, planId: string, actor: Actor) {
  const [business] = await db.select({ billingExempt: businesses.billingExempt }).from(businesses).where(eq(businesses.id, sub.businessId)).limit(1)
  if (business?.billingExempt) throw new BillingRuleError("Este estabelecimento está isento de cobrança.")
  if (!isContracted(sub)) throw new BillingRuleError("Contrate um plano antes de alterá-lo.")
  if (sub.status === "past_due" || sub.status === "suspended") {
    throw new BillingRuleError("Regularize a cobrança em aberto antes de mudar de plano.")
  }
  if (sub.cancelAtPeriodEnd) throw new BillingRuleError("A assinatura tem cancelamento agendado.")
  // Planos ocultos e de teste nunca são destino de troca: o teste só entra por contratação nova.
  const plan = await getActivePlan(db, planId)
  if (!plan || plan.isTest) throw new BillingRuleError("Plano indisponível.")
  if (plan.id === sub.planId) throw new BillingRuleError("Este já é o seu plano atual.")

  // No trial ainda não há assinatura no Asaas: a troca só muda o plano que o cron vai contratar.
  // Durante a promoção, o novo plano também recebe o desconto nos ciclos restantes (se for elegível).
  if (sub.gatewaySubscriptionId) {
    await gateway.updateSubscription(sub.gatewaySubscriptionId, {
      value: (await gatewayPriceCents(db, sub.id, plan)) / 100,
      cycle: cycle(plan.billingInterval),
      description: planDescription(plan, plan.billingInterval),
    })
  }
  await changePlanLocal(db, sub, plan, actor, "Alterado pelo proprietário")
  return plan
}

export const GATEWAY_ACTIVATION_LEASE_MS = 10 * 60_000
const GATEWAY_ACTIVATION_BATCH = 100
const RETRIES_PER_RUN = 3

/** Falhas de rede, timeout, 429 e 5xx podem passar sozinhas; erros de validação (4xx) não. */
function isTransient(error: unknown) {
  const status = (error as { status?: unknown })?.status
  return typeof status !== "number" || status === 429 || status >= 500
}

async function withRetry<T>(fn: () => Promise<T>, delayMs: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= RETRIES_PER_RUN || !isTransient(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
    }
  }
}

export type GatewayActivationSummary = {
  /** Assinaturas criadas no Asaas nesta execução. */
  activated: number
  /** Ativações que falharam nesta execução e serão repetidas. */
  failedAttempts: number
  /** Trials encerrados ainda aguardando a criação da assinatura no Asaas. */
  pending: number
}

/**
 * Cria no Asaas a assinatura dos trials encerrados, com o plano, o valor e a forma de pagamento
 * escolhidos. Idempotente:
 * - cada item é reservado com UPDATE condicional (execuções simultâneas não processam o mesmo item);
 * - antes de criar, procura no Asaas uma assinatura com o mesmo externalReference, recuperando uma
 *   criação que deu certo no Asaas mas não foi registrada aqui (timeout, queda da função);
 * - o vínculo só é gravado se ainda não houver gatewaySubscriptionId (índice único no banco).
 * Em falha, o item continua 'pending' e o cliente mantém o acesso até a próxima tentativa.
 */
export async function processGatewayActivations(
  db: BillingDb,
  gateway: CheckoutGateway,
  now = new Date(),
  opts: { retryDelayMs?: number } = {}
) {
  const retryDelayMs = opts.retryDelayMs ?? 1_000
  let activated = 0
  let failedAttempts = 0
  const leaseLimit = new Date(now.getTime() - GATEWAY_ACTIVATION_LEASE_MS)
  const due = and(
    eq(subscriptions.gatewayActivationStatus, "pending"),
    eq(subscriptions.status, "trialing"),
    isNull(subscriptions.gatewaySubscriptionId),
    lte(subscriptions.trialEndsAt, now),
    sql`NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = ${subscriptions.businessId} AND b.billing_exempt = true)`
  )
  const claimable = and(
    due,
    or(isNull(subscriptions.gatewayActivationLastAttemptAt), lt(subscriptions.gatewayActivationLastAttemptAt, leaseLimit))
  )

  const candidates = await db.select({ id: subscriptions.id }).from(subscriptions).where(claimable).limit(GATEWAY_ACTIVATION_BATCH)
  for (const { id } of candidates) {
    const [claimed] = await db
      .update(subscriptions)
      .set({
        gatewayActivationAttempts: sql`${subscriptions.gatewayActivationAttempts} + 1`,
        gatewayActivationLastAttemptAt: now,
        updatedAt: now,
      })
      .where(and(eq(subscriptions.id, id), claimable))
      .returning()
    if (!claimed) continue

    try {
      const gatewaySubscriptionId = await activateOne(db, gateway, claimed, now, retryDelayMs)
      if (gatewaySubscriptionId) activated++
    } catch (error) {
      failedAttempts++
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
      console.error("[billing] falha ao criar assinatura no Asaas", claimed.id, `tentativa ${claimed.gatewayActivationAttempts}`, message)
      await db
        .update(subscriptions)
        .set({ gatewayActivationLastError: message, updatedAt: now })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.gatewayActivationStatus, "pending")))
      await db.insert(subscriptionEvents).values({
        subscriptionId: claimed.id,
        businessId: claimed.businessId,
        type: "gateway_activation_failed",
        fromStatus: claimed.status,
        toStatus: claimed.status,
        source: "system",
        details: { attempt: claimed.gatewayActivationAttempts, error: message, willRetry: true },
      })
    }
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(due)
  return { activated, failedAttempts, pending: count } satisfies GatewayActivationSummary
}

async function activateOne(db: BillingDb, gateway: CheckoutGateway, claimed: SubscriptionRow, now: Date, retryDelayMs: number) {
  const [business] = await db.select({ billingExempt: businesses.billingExempt }).from(businesses).where(eq(businesses.id, claimed.businessId)).limit(1)
  if (business?.billingExempt) return null
  if (!claimed.gatewayCustomerId) throw new Error("Assinatura sem cliente no Asaas.")
  const customer = claimed.gatewayCustomerId
  const [plan] = await db.select().from(plans).where(eq(plans.id, claimed.planId)).limit(1)
  const name = plan?.name ?? "MARCAÍ"
  const priceFor = async (row: SubscriptionRow) => {
    const [p] = await db.select().from(plans).where(eq(plans.id, row.planId)).limit(1)
    if (!p) return row.priceCents
    return gatewayPriceCents(db, row.id, { ...p, priceCents: row.priceCents, billingInterval: row.billingInterval })
  }
  const valueCents = await priceFor(claimed)

  const gatewaySubscriptionId = await withRetry(async () => {
    const existing = await gateway.findSubscriptionByReference(claimed.id)
    if (existing) return existing.id
    const created = await gateway.createSubscription({
      customer,
      value: valueCents / 100,
      // O trial acabou: a primeira cobrança vence hoje (o Asaas não aceita vencimento no passado).
      nextDueDate: brazilDate(claimed.trialEndsAt && claimed.trialEndsAt > now ? claimed.trialEndsAt : now),
      cycle: cycle(claimed.billingInterval),
      description: planDescription({ name }, claimed.billingInterval),
      externalReference: claimed.id,
      billingType: claimed.gatewayBillingType ?? undefined,
    })
    return created.id
  }, retryDelayMs)

  const attached = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(subscriptions)
      .set({
        gatewaySubscriptionId,
        gatewayActivationStatus: "done",
        gatewayActivatedAt: now,
        gatewayActivationLastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(subscriptions.id, claimed.id),
          eq(subscriptions.status, "trialing"),
          eq(subscriptions.gatewayActivationStatus, "pending"),
          isNull(subscriptions.gatewaySubscriptionId)
        )
      )
      .returning()
    if (row) {
      await extendPromoHold(tx, row.id, now)
      await tx.insert(subscriptionEvents).values({
        subscriptionId: row.id,
        businessId: row.businessId,
        type: "created",
        fromStatus: claimed.status,
        toStatus: row.status,
        source: "system",
        details: {
          gatewaySubscriptionId,
          planId: row.planId,
          priceCents: row.priceCents,
          billingInterval: row.billingInterval,
          billingType: row.gatewayBillingType,
          afterTrial: true,
        },
      })
    }
    return row ?? null
  })

  if (!attached) {
    // Cancelada pelo cliente enquanto a assinatura era criada: interrompe a cobrança no Asaas.
    try {
      await gateway.cancelSubscription(gatewaySubscriptionId)
    } catch (error) {
      console.error("[billing] assinatura criada após cancelamento; enfileirada para cancelar", gatewaySubscriptionId, error)
      await db
        .update(subscriptions)
        .set({ gatewaySubscriptionId, gatewayCancelStatus: "pending", updatedAt: new Date() })
        .where(and(eq(subscriptions.id, claimed.id), isNull(subscriptions.gatewaySubscriptionId)))
    }
    return null
  }

  // Troca de plano durante a criação: aplica o valor vigente à assinatura recém-criada.
  if (attached.priceCents !== claimed.priceCents || attached.billingInterval !== claimed.billingInterval) {
    const [current] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, attached.planId)).limit(1)
    await gateway
      .updateSubscription(gatewaySubscriptionId, {
        value: (await priceFor(attached)) / 100,
        cycle: cycle(attached.billingInterval),
        description: planDescription({ name: current?.name ?? name }, attached.billingInterval),
      })
      .catch((error) => console.error("[billing] falha ao ajustar plano após ativação", gatewaySubscriptionId, error))
  }

  await reprocessFailedEvents(db, gatewaySubscriptionId)
  await syncPendingPayments(db, gateway, attached).catch((error) => console.error("[billing] falha ao listar cobranças", error))
  return gatewaySubscriptionId
}

/** Rotina diária completa: cria as assinaturas dos trials encerrados e aplica a manutenção existente. */
export async function runBillingCron(db: BillingDb, now = new Date(), gateway?: CheckoutGateway) {
  const activation = gateway ? await processGatewayActivations(db, gateway, now) : null
  const maintenance = await runBillingMaintenance(db, now, gateway)
  // Depois da manutenção: trials expirados nesta execução também devolvem a vaga.
  const promoReleased = await releaseAbandonedPromoReservations(db, now)
  const promoPriceSync = gateway ? await processPromoPriceSync(db, gateway, now) : null
  return { activation, ...maintenance, promo: { released: promoReleased, priceSync: promoPriceSync } }
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
