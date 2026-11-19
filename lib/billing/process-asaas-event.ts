import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"

import * as schema from "@/lib/db/schema"
import type { SubscriptionRow, SubscriptionStatus, TransactionStatus } from "@/lib/db/schema"
import { registerPromoPayment } from "@/lib/billing/launch-promo"

const { billingTransactions, billingWebhookEvents, businesses, plans, subscriptionEvents, subscriptions } = schema

export type BillingDb = PgDatabase<PgQueryResultHKT, typeof schema>
type Tx = Parameters<Parameters<BillingDb["transaction"]>[0]>[0]

async function isTestPlan(tx: Tx, planId: string) {
  const [plan] = await tx.select({ isTest: plans.isTest }).from(plans).where(eq(plans.id, planId)).limit(1)
  return Boolean(plan?.isTest)
}

export const ASAAS = "asaas"

export type AsaasPayment = {
  id: string
  customer?: string
  subscription?: string | null
  value: number
  status?: string
  billingType?: string
  dueDate?: string
  paymentDate?: string | null
  confirmedDate?: string | null
  clientPaymentDate?: string | null
  externalReference?: string | null
  description?: string | null
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  refunds?: { value?: number; status?: string }[] | null
}

export type AsaasEvent = {
  id: string
  event: string
  dateCreated?: string
  payment?: AsaasPayment
  subscription?: { id: string; externalReference?: string | null; status?: string }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Status da transação local resultante de cada evento de cobrança do Asaas. */
const PAYMENT_EVENT_STATUS: Record<string, TransactionStatus> = {
  PAYMENT_CREATED: "pending",
  PAYMENT_UPDATED: "pending",
  PAYMENT_RESTORED: "pending",
  PAYMENT_OVERDUE: "pending",
  PAYMENT_AWAITING_RISK_ANALYSIS: "pending",
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: "pending",
  PAYMENT_AUTHORIZED: "pending",
  PAYMENT_RECEIVED_IN_CASH_UNDONE: "pending",
  PAYMENT_CONFIRMED: "approved",
  PAYMENT_RECEIVED: "approved",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_PARTIALLY_REFUNDED: "refunded",
  PAYMENT_CHARGEBACK_REQUESTED: "charged_back",
  PAYMENT_CHARGEBACK_DISPUTE: "charged_back",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "charged_back",
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: "declined",
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: "declined",
  PAYMENT_DELETED: "declined",
}

/**
 * Transições aceitas para uma transação já registrada. Os webhooks podem chegar fora de ordem:
 * um "vencida" atrasado nunca rebaixa um pagamento aprovado.
 */
const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  pending: ["approved", "declined", "refunded", "charged_back"],
  declined: ["pending", "approved"],
  approved: ["refunded", "charged_back"],
  charged_back: ["approved", "refunded"],
  refunded: [],
}

const BILLING_TYPE: Record<string, string> = {
  CREDIT_CARD: "credit_card",
  DEBIT_CARD: "debit_card",
  PIX: "pix",
  BOLETO: "boleto",
}

/** Datas do Asaas chegam sem fuso ("2026-11-14" ou "2026-11-14 10:00:00"): horário de Brasília. */
export function parseAsaasDate(value: string | null | undefined) {
  if (!value) return null
  const iso = value.length === 10 ? `${value}T12:00:00-03:00` : `${value.replace(" ", "T")}-03:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function addInterval(date: Date, interval: "month" | "year") {
  const next = new Date(date)
  if (interval === "year") next.setFullYear(next.getFullYear() + 1)
  else next.setMonth(next.getMonth() + 1)
  return next
}

const toCents = (value: number | undefined | null) => Math.round(Number(value ?? 0) * 100)

/** Persiste o evento antes de qualquer regra de negócio. Retorna null quando já existia. */
export async function recordAsaasEvent(db: BillingDb, event: AsaasEvent) {
  const [row] = await db
    .insert(billingWebhookEvents)
    .values({ gateway: ASAAS, eventId: event.id, eventType: event.event, payload: event })
    .onConflictDoNothing({ target: [billingWebhookEvents.gateway, billingWebhookEvents.eventId] })
    .returning({ id: billingWebhookEvents.id })
  if (row) return { id: row.id, duplicate: false }

  const [existing] = await db
    .select({ id: billingWebhookEvents.id, status: billingWebhookEvents.status })
    .from(billingWebhookEvents)
    .where(and(eq(billingWebhookEvents.gateway, ASAAS), eq(billingWebhookEvents.eventId, event.id)))
    .limit(1)
  return existing ? { id: existing.id, duplicate: true, status: existing.status } : null
}

async function findSubscription(tx: Tx, gatewaySubscriptionId?: string | null, externalReference?: string | null) {
  if (gatewaySubscriptionId) {
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.gateway, ASAAS), eq(subscriptions.gatewaySubscriptionId, gatewaySubscriptionId)))
      .for("update")
      .limit(1)
    if (row) return row
  }
  if (externalReference && UUID_RE.test(externalReference)) {
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.id, externalReference)).for("update").limit(1)
    if (row) return row
  }
  return null
}

async function setSubscriptionStatus(
  tx: Tx,
  sub: SubscriptionRow,
  patch: Partial<typeof subscriptions.$inferInsert>,
  event: { type: string; details: Record<string, unknown> }
) {
  const toStatus = (patch.status ?? sub.status) as SubscriptionStatus
  await tx
    .update(subscriptions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id))
  await tx.insert(subscriptionEvents).values({
    subscriptionId: sub.id,
    businessId: sub.businessId,
    type: event.type,
    fromStatus: sub.status,
    toStatus,
    source: "gateway",
    details: event.details,
  })
}

const CLOSED: SubscriptionStatus[] = ["canceled", "expired", "suspended"]

async function handlePayment(tx: Tx, event: AsaasEvent, payment: AsaasPayment) {
  const nextStatus = PAYMENT_EVENT_STATUS[event.event]
  if (!nextStatus) return "ignored" as const

  // Cobrança avulsa da conta Asaas, sem relação com assinaturas da MARCAÍ.
  if (!payment.subscription && !(payment.externalReference && UUID_RE.test(payment.externalReference))) {
    return "ignored" as const
  }
  const sub = await findSubscription(tx, payment.subscription, payment.externalReference)
  if (!sub) throw new Error(`Assinatura não encontrada para a cobrança ${payment.id} (${payment.subscription ?? "sem assinatura"})`)

  const amountCents = toCents(payment.value)
  const paidAt =
    nextStatus === "approved"
      ? (parseAsaasDate(payment.confirmedDate) ??
        parseAsaasDate(payment.paymentDate) ??
        parseAsaasDate(payment.clientPaymentDate) ??
        parseAsaasDate(event.dateCreated) ??
        new Date())
      : null
  const refundedCents =
    event.event === "PAYMENT_REFUNDED"
      ? amountCents
      : event.event === "PAYMENT_PARTIALLY_REFUNDED"
        ? Math.min(amountCents, (payment.refunds ?? []).reduce((sum, r) => sum + toCents(r.value), 0))
        : undefined
  const paymentMethod = payment.billingType ? (BILLING_TYPE[payment.billingType] ?? payment.billingType.toLowerCase()) : null

  const dueDate = parseAsaasDate(payment.dueDate)
  const links = {
    ...(payment.invoiceUrl ? { invoiceUrl: payment.invoiceUrl } : {}),
    ...(payment.bankSlipUrl ? { bankSlipUrl: payment.bankSlipUrl } : {}),
  }

  const selectExisting = async () => {
    const [row] = await tx
      .select()
      .from(billingTransactions)
      .where(and(eq(billingTransactions.gateway, ASAAS), eq(billingTransactions.gatewayTransactionId, payment.id)))
      .for("update")
      .limit(1)
    return row ?? null
  }

  let existing = await selectExisting()
  let becameApproved = false
  if (!existing) {
    // ON CONFLICT: o checkout pode ter registrado a cobrança pendente ao mesmo tempo.
    const inserted = await tx
      .insert(billingTransactions)
      .values({
        businessId: sub.businessId,
        subscriptionId: sub.id,
        planId: sub.planId,
        amountCents,
        refundedCents: refundedCents ?? 0,
        status: nextStatus,
        paymentMethod,
        gateway: ASAAS,
        gatewayTransactionId: payment.id,
        description: payment.description ?? null,
        dueDate,
        ...links,
        paidAt,
      })
      .onConflictDoNothing({ target: [billingTransactions.gateway, billingTransactions.gatewayTransactionId] })
      .returning({ id: billingTransactions.id })
    if (inserted.length) becameApproved = nextStatus === "approved"
    else existing = await selectExisting()
  }
  if (existing) {
    const transition = existing.status !== nextStatus && ALLOWED_TRANSITIONS[existing.status].includes(nextStatus)
    await tx
      .update(billingTransactions)
      .set({
        status: transition ? nextStatus : existing.status,
        amountCents: existing.status === "pending" ? amountCents : existing.amountCents,
        refundedCents: refundedCents ?? existing.refundedCents,
        paymentMethod: paymentMethod ?? existing.paymentMethod,
        dueDate: dueDate ?? existing.dueDate,
        ...links,
        paidAt: existing.paidAt ?? paidAt,
        updatedAt: new Date(),
      })
      .where(eq(billingTransactions.id, existing.id))
    becameApproved = transition && nextStatus === "approved"
  }

  const [business] = await tx
    .select({ billingExempt: businesses.billingExempt })
    .from(businesses)
    .where(eq(businesses.id, sub.businessId))
    .limit(1)
  if (business?.billingExempt) return "processed" as const

  const details = { eventId: event.id, event: event.event, paymentId: payment.id, amountCents }
  // Trial expirado que foi pago depois (ex.: boleto compensado com atraso): reabre a assinatura,
  // desde que o estabelecimento não tenha contratado outra nesse meio-tempo.
  let reopen = false
  if (sub.status === "expired" && becameApproved) {
    const [other] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.businessId, sub.businessId),
          ne(subscriptions.id, sub.id),
          notInArray(subscriptions.status, ["canceled", "expired"])
        )
      )
      .limit(1)
    reopen = !other
  }
  if (CLOSED.includes(sub.status) && !reopen) return "processed" as const

  if (becameApproved) {
    const [previous] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(billingTransactions)
      .where(
        and(
          eq(billingTransactions.subscriptionId, sub.id),
          inArray(billingTransactions.status, ["approved", "refunded"]),
          ne(billingTransactions.gatewayTransactionId, payment.id)
        )
      )
    const periodStart = parseAsaasDate(payment.dueDate) ?? paidAt ?? new Date()
    const periodEnd = addInterval(periodStart, sub.billingInterval)
    const keepLaterPeriod = sub.currentPeriodEnd && sub.currentPeriodEnd > periodEnd
    // Plano de teste (maxPayments: 1): a cobrança única cobre um período e o acesso termina
    // no fim dele pela rotina diária, independentemente de eventos de encerramento do Asaas.
    const singleCharge = await isTestPlan(tx, sub.planId)
    // becameApproved só é verdadeiro uma vez por transição; o registro da promoção ainda marca a cobrança
    // (promo_cycle) para nunca contar o mesmo ciclo duas vezes.
    await registerPromoPayment(tx, sub, { gatewayTransactionId: payment.id, amountCents }, paidAt ?? new Date())
    await setSubscriptionStatus(
      tx,
      sub,
      {
        status: "active",
        paymentMethod: paymentMethod ?? sub.paymentMethod,
        currentPeriodStart: keepLaterPeriod ? sub.currentPeriodStart : periodStart,
        currentPeriodEnd: keepLaterPeriod ? sub.currentPeriodEnd : periodEnd,
        // Reativada: o cancelamento no Asaas que ainda não aconteceu deixa de ser devido.
        ...(reopen ? { endedAt: null } : {}),
        ...(reopen && sub.gatewayCancelStatus !== "done" ? { gatewayCancelStatus: null } : {}),
        ...(singleCharge ? { cancelAtPeriodEnd: true, cancelRequestedAt: sub.cancelRequestedAt ?? new Date() } : {}),
      },
      {
        type: reopen ? "reactivated" : previous.count > 0 ? "renewed" : "activated",
        details: reopen ? { ...details, gatewayCancelStatus: sub.gatewayCancelStatus } : details,
      }
    )
    return "processed" as const
  }

  if (event.event === "PAYMENT_OVERDUE" && existing?.status !== "approved") {
    if (["active", "trialing", "awaiting_payment", "payment_pending"].includes(sub.status)) {
      await setSubscriptionStatus(tx, sub, { status: "past_due" }, { type: "payment_overdue", details })
    }
    return "processed" as const
  }

  if (nextStatus === "declined" && event.event !== "PAYMENT_DELETED") {
    if (["active", "awaiting_payment"].includes(sub.status)) {
      await setSubscriptionStatus(tx, sub, { status: "payment_pending" }, { type: "payment_declined", details })
    }
    return "processed" as const
  }

  if (nextStatus === "charged_back" && event.event === "PAYMENT_CHARGEBACK_REQUESTED") {
    await setSubscriptionStatus(tx, sub, { status: "past_due" }, { type: "chargeback", details })
    return "processed" as const
  }

  if (nextStatus === "refunded") {
    await setSubscriptionStatus(tx, sub, {}, { type: "refund", details })
  }
  return "processed" as const
}

async function handleSubscription(tx: Tx, event: AsaasEvent) {
  if (event.event !== "SUBSCRIPTION_DELETED" && event.event !== "SUBSCRIPTION_INACTIVATED") return "ignored" as const
  const payload = event.subscription
  if (!payload) return "ignored" as const
  const sub = await findSubscription(tx, payload.id, payload.externalReference)
  if (!sub || sub.status === "canceled" || sub.status === "expired") return "ignored" as const

  const now = new Date()
  const details = { eventId: event.id, event: event.event }
  // Cancelamento agendado: o cliente usa até o fim do período pago; o cron encerra depois.
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
    await setSubscriptionStatus(tx, sub, { canceledAt: sub.canceledAt ?? now }, { type: "gateway_canceled", details })
    return "processed" as const
  }
  // Com maxPayments: 1 o Asaas pode inativar a assinatura logo após gerar a cobrança única,
  // antes do pagamento. Não encerra: a cobrança continua pagável e o acesso segue as regras locais.
  if (event.event === "SUBSCRIPTION_INACTIVATED" && (await isTestPlan(tx, sub.planId))) {
    await setSubscriptionStatus(tx, sub, {}, { type: "gateway_inactivated", details })
    return "processed" as const
  }
  await setSubscriptionStatus(
    tx,
    sub,
    { status: "canceled", canceledAt: sub.canceledAt ?? now, endedAt: now },
    { type: "canceled", details }
  )
  return "processed" as const
}

/** Processa um evento persistido. Idempotente: eventos já processados são ignorados. */
export async function processAsaasEvent(db: BillingDb, rowId: string) {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: billingWebhookEvents.status, payload: billingWebhookEvents.payload })
        .from(billingWebhookEvents)
        .where(eq(billingWebhookEvents.id, rowId))
        .for("update")
        .limit(1)
      if (!row) return "ignored" as const
      if (row.status === "processed" || row.status === "ignored") return row.status

      const event = row.payload as AsaasEvent
      const result = event.payment
        ? await handlePayment(tx, event, event.payment)
        : event.event.startsWith("SUBSCRIPTION_")
          ? await handleSubscription(tx, event)
          : ("ignored" as const)

      await tx
        .update(billingWebhookEvents)
        .set({ status: result, error: null, processedAt: new Date() })
        .where(eq(billingWebhookEvents.id, rowId))
      return result
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(billingWebhookEvents)
      .set({ status: "failed", error: message.slice(0, 1000) })
      .where(eq(billingWebhookEvents.id, rowId))
    return "failed" as const
  }
}

/** Reprocessa eventos que falharam (ex.: webhook chegou antes de a assinatura ser vinculada). */
export async function reprocessFailedEvents(db: BillingDb, gatewaySubscriptionId: string) {
  const rows = await db
    .select({ id: billingWebhookEvents.id })
    .from(billingWebhookEvents)
    .where(
      and(
        eq(billingWebhookEvents.gateway, ASAAS),
        inArray(billingWebhookEvents.status, ["failed", "received"]),
        sql`(${billingWebhookEvents.payload} -> 'payment' ->> 'subscription' = ${gatewaySubscriptionId}
          OR ${billingWebhookEvents.payload} -> 'subscription' ->> 'id' = ${gatewaySubscriptionId})`
      )
    )
    .orderBy(billingWebhookEvents.receivedAt)
  for (const row of rows) await processAsaasEvent(db, row.id)
  return rows.length
}
