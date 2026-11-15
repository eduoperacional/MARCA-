import { and, desc, eq, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm"

import * as schema from "@/lib/db/schema"
import type { PlanRow, SubscriptionRow, SubscriptionStatus } from "@/lib/db/schema"
import { ASAAS, type BillingDb } from "@/lib/billing/process-asaas-event"

const { businessNotes, businessSuspensions, plans, subscriptionEvents, subscriptions } = schema

export type Actor = { userId: string | null; source: "admin" | "system" | "owner" }

const ENDED: SubscriptionStatus[] = ["canceled", "expired"]

export async function getCurrentSubscription(db: BillingDb, businessId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), notInArray(subscriptions.status, ENDED)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)
  return row ?? null
}

export async function getActivePlanByCode(db: BillingDb, code: string) {
  const [plan] = await db.select().from(plans).where(and(eq(plans.code, code), eq(plans.isActive, true))).limit(1)
  return plan ?? null
}

/** Último customer do Asaas usado pelo estabelecimento (evita duplicar clientes no gateway). */
export async function getGatewayCustomerId(db: BillingDb, businessId: string) {
  const [row] = await db
    .select({ id: subscriptions.gatewayCustomerId })
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), isNotNull(subscriptions.gatewayCustomerId)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)
  return row?.id ?? null
}

export async function hasHadSubscription(db: BillingDb, businessId: string) {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), isNotNull(subscriptions.gatewaySubscriptionId)))
    .limit(1)
  return Boolean(row)
}

/**
 * Cria a assinatura local antes de chamar o gateway: o id dela vira o externalReference no Asaas.
 * Uma assinatura vigente sem vínculo com o gateway (ex.: cortesia manual) é encerrada e substituída.
 */
export async function createLocalSubscription(
  db: BillingDb,
  input: { businessId: string; plan: PlanRow; trialDays: number; gatewayCustomerId: string; now?: Date }
) {
  const now = input.now ?? new Date()
  const trialEndsAt = input.trialDays > 0 ? new Date(now.getTime() + input.trialDays * 86_400_000) : null

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.businessId, input.businessId), notInArray(subscriptions.status, ENDED)))
      .for("update")
      .limit(1)
    if (current?.gatewaySubscriptionId) throw new Error("Este estabelecimento já possui uma assinatura em andamento.")
    if (current) {
      await tx
        .update(subscriptions)
        .set({ status: "canceled", canceledAt: now, endedAt: now, updatedAt: now })
        .where(eq(subscriptions.id, current.id))
      await tx.insert(subscriptionEvents).values({
        subscriptionId: current.id,
        businessId: current.businessId,
        type: "replaced",
        fromStatus: current.status,
        toStatus: "canceled",
        source: "system",
        details: { reason: "Substituída por assinatura paga" },
      })
    }

    const [sub] = await tx
      .insert(subscriptions)
      .values({
        businessId: input.businessId,
        planId: input.plan.id,
        planVersion: input.plan.version,
        status: trialEndsAt ? "trialing" : "awaiting_payment",
        priceCents: input.plan.priceCents,
        billingInterval: input.plan.billingInterval,
        features: input.plan.features,
        limits: input.plan.limits,
        gateway: ASAAS,
        gatewayCustomerId: input.gatewayCustomerId,
        startedAt: now,
        trialEndsAt,
      })
      .returning()
    return sub
  })
}

export async function attachGatewaySubscription(db: BillingDb, sub: SubscriptionRow, gatewaySubscriptionId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ gatewaySubscriptionId, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id))
    await tx.insert(subscriptionEvents).values({
      subscriptionId: sub.id,
      businessId: sub.businessId,
      type: "created",
      toStatus: sub.status,
      source: "system",
      details: { gatewaySubscriptionId, planId: sub.planId, priceCents: sub.priceCents },
    })
  })
}

/** Remove a assinatura local quando o gateway recusa a criação (ainda não há histórico). */
export async function discardLocalSubscription(db: BillingDb, subscriptionId: string) {
  await db.delete(subscriptions).where(and(eq(subscriptions.id, subscriptionId), isNull(subscriptions.gatewaySubscriptionId)))
}

async function logEvent(
  db: Pick<BillingDb, "insert">,
  sub: SubscriptionRow,
  type: string,
  toStatus: SubscriptionStatus,
  actor: Actor,
  details: Record<string, unknown> = {}
) {
  await db.insert(subscriptionEvents).values({
    subscriptionId: sub.id,
    businessId: sub.businessId,
    type,
    fromStatus: sub.status,
    toStatus,
    source: actor.source,
    actorUserId: actor.userId,
    details,
  })
}

export async function cancelSubscriptionLocal(
  db: BillingDb,
  sub: SubscriptionRow,
  mode: "now" | "period_end",
  actor: Actor,
  reason: string | null
) {
  const now = new Date()
  const atPeriodEnd = mode === "period_end" && sub.currentPeriodEnd && sub.currentPeriodEnd > now
  await db.transaction(async (tx) => {
    if (atPeriodEnd) {
      await tx
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, cancelRequestedAt: now, updatedAt: now })
        .where(eq(subscriptions.id, sub.id))
      await logEvent(tx, sub, "cancel_requested", sub.status, actor, { reason, endsAt: sub.currentPeriodEnd })
      return
    }
    await tx
      .update(subscriptions)
      .set({ status: "canceled", cancelRequestedAt: sub.cancelRequestedAt ?? now, canceledAt: now, endedAt: now, updatedAt: now })
      .where(eq(subscriptions.id, sub.id))
    await logEvent(tx, sub, "canceled", "canceled", actor, { reason })
  })
  return atPeriodEnd ? "period_end" : "now"
}

/** Desfaz um cancelamento agendado quando o gateway recusa o cancelamento. */
export async function revertScheduledCancel(db: BillingDb, sub: SubscriptionRow, actor: Actor) {
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: false, cancelRequestedAt: null, updatedAt: new Date() })
      .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.cancelAtPeriodEnd, true)))
    await logEvent(tx, sub, "cancel_reverted", sub.status, actor, { reason: "Gateway recusou o cancelamento" })
  })
}

export async function grantCourtesy(db: BillingDb, sub: SubscriptionRow, days: number, actor: Actor, reason: string | null) {
  const base = sub.courtesyUntil && sub.courtesyUntil > new Date() ? sub.courtesyUntil : new Date()
  const courtesyUntil = new Date(base.getTime() + days * 86_400_000)
  await db.transaction(async (tx) => {
    await tx.update(subscriptions).set({ courtesyUntil, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id))
    await logEvent(tx, sub, "courtesy", sub.status, actor, { days, courtesyUntil, reason })
  })
  return courtesyUntil
}

export async function changePlanLocal(db: BillingDb, sub: SubscriptionRow, plan: PlanRow, actor: Actor, reason: string | null) {
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        planId: plan.id,
        planVersion: plan.version,
        priceCents: plan.priceCents,
        billingInterval: plan.billingInterval,
        features: plan.features,
        limits: plan.limits,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id))
    await logEvent(tx, sub, "plan_changed", sub.status, actor, {
      fromPlanId: sub.planId,
      toPlanId: plan.id,
      fromPriceCents: sub.priceCents,
      toPriceCents: plan.priceCents,
      reason,
    })
  })
}

export async function suspendBusiness(db: BillingDb, businessId: string, reason: string, actorUserId: string) {
  await db
    .insert(businessSuspensions)
    .values({ businessId, reason, suspendedBy: actorUserId })
    .onConflictDoUpdate({ target: businessSuspensions.businessId, set: { reason, suspendedBy: actorUserId, suspendedAt: new Date() } })
}

export async function reactivateBusiness(db: BillingDb, businessId: string) {
  const deleted = await db.delete(businessSuspensions).where(eq(businessSuspensions.businessId, businessId)).returning()
  return deleted.length > 0
}

export async function getSuspension(db: BillingDb, businessId: string) {
  const [row] = await db.select().from(businessSuspensions).where(eq(businessSuspensions.businessId, businessId)).limit(1)
  return row ?? null
}

export async function addBusinessNote(db: BillingDb, businessId: string, authorUserId: string, body: string) {
  await db.insert(businessNotes).values({ businessId, authorUserId, body })
}

export const GATEWAY_CANCEL_MAX_ATTEMPTS = 8
/** Janela em que uma tentativa em andamento fica reservada, evitando chamadas duplicadas entre execuções simultâneas. */
const GATEWAY_CANCEL_LEASE_MS = 10 * 60_000
const GATEWAY_CANCEL_BATCH = 100

type CancelGateway = { cancelSubscription(id: string): Promise<unknown> }

export type GatewayCancelSummary = {
  /** Cancelamentos confirmados pelo Asaas nesta execução. */
  concluded: number
  /** Tentativas que falharam nesta execução (serão repetidas ou foram esgotadas). */
  failedAttempts: number
  /** Total aguardando nova tentativa após esta execução. */
  pending: number
  /** Total com tentativas esgotadas, aguardando verificação manual. */
  failed: number
}

function isGatewayNotFound(error: unknown) {
  return typeof error === "object" && error !== null && (error as { status?: unknown }).status === 404
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500)
}

const system: Actor = { userId: null, source: "system" }

/**
 * Processa a fila persistente de cancelamentos no Asaas. Cada item é reservado com um UPDATE
 * condicional antes da chamada, então duas execuções do cron nunca cancelam o mesmo item ao mesmo
 * tempo, e um cancelamento confirmado ('done') nunca é repetido.
 */
export async function processGatewayCancellations(db: BillingDb, now: Date, gateway?: CancelGateway) {
  let concluded = 0
  let failedAttempts = 0
  const leaseLimit = new Date(now.getTime() - GATEWAY_CANCEL_LEASE_MS)
  const claimable = and(
    eq(subscriptions.gatewayCancelStatus, "pending"),
    eq(subscriptions.status, "expired"),
    isNotNull(subscriptions.gatewaySubscriptionId),
    or(isNull(subscriptions.gatewayCancelLastAttemptAt), lt(subscriptions.gatewayCancelLastAttemptAt, leaseLimit))
  )

  if (gateway) {
    const candidates = await db.select({ id: subscriptions.id }).from(subscriptions).where(claimable).limit(GATEWAY_CANCEL_BATCH)

    for (const { id } of candidates) {
      const [claimed] = await db
        .update(subscriptions)
        .set({
          gatewayCancelAttempts: sql`${subscriptions.gatewayCancelAttempts} + 1`,
          gatewayCancelLastAttemptAt: now,
          updatedAt: now,
        })
        .where(and(eq(subscriptions.id, id), claimable))
        .returning()
      if (!claimed?.gatewaySubscriptionId) continue

      let failure: unknown = null
      let alreadyRemoved = false
      try {
        await gateway.cancelSubscription(claimed.gatewaySubscriptionId)
      } catch (error) {
        if (isGatewayNotFound(error)) alreadyRemoved = true
        else failure = error
      }

      if (!failure) {
        const [done] = await db
          .update(subscriptions)
          .set({ gatewayCancelStatus: "done", gatewayCanceledAt: now, gatewayCancelLastError: null, updatedAt: now })
          .where(and(eq(subscriptions.id, id), eq(subscriptions.gatewayCancelStatus, "pending")))
          .returning({ id: subscriptions.id })
        // Sem linha atualizada: um pagamento tardio reativou a assinatura durante a chamada ao Asaas.
        await logEvent(db, claimed, done ? "gateway_canceled" : "gateway_canceled_after_reactivation", claimed.status, system, {
          gatewaySubscriptionId: claimed.gatewaySubscriptionId,
          attempts: claimed.gatewayCancelAttempts,
          alreadyRemoved,
        })
        if (!done) console.error("[billing] assinatura reativada foi cancelada no Asaas; verificar", claimed.gatewaySubscriptionId)
        concluded++
        continue
      }

      failedAttempts++
      const exhausted = claimed.gatewayCancelAttempts >= GATEWAY_CANCEL_MAX_ATTEMPTS
      const message = errorMessage(failure)
      console.error("[billing] falha ao cancelar no Asaas", claimed.gatewaySubscriptionId, `tentativa ${claimed.gatewayCancelAttempts}`, message)
      await db
        .update(subscriptions)
        .set({ gatewayCancelStatus: exhausted ? "failed" : "pending", gatewayCancelLastError: message, updatedAt: now })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.gatewayCancelStatus, "pending")))
      await logEvent(db, claimed, "gateway_cancel_failed", claimed.status, system, {
        gatewaySubscriptionId: claimed.gatewaySubscriptionId,
        attempt: claimed.gatewayCancelAttempts,
        error: message,
        willRetry: !exhausted,
      })
    }
  }

  const counts = await db
    .select({ status: subscriptions.gatewayCancelStatus, count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(or(eq(subscriptions.gatewayCancelStatus, "pending"), eq(subscriptions.gatewayCancelStatus, "failed")))
    .groupBy(subscriptions.gatewayCancelStatus)
  const countOf = (status: string) => counts.find((c) => c.status === status)?.count ?? 0

  return { concluded, failedAttempts, pending: countOf("pending"), failed: countOf("failed") } satisfies GatewayCancelSummary
}

/**
 * Rotina diária: encerra cancelamentos agendados cujo período acabou, expira trials vencidos
 * há mais de 3 dias sem nenhum pagamento aprovado e processa a fila de cancelamentos no Asaas.
 */
export async function runBillingMaintenance(db: BillingDb, now = new Date(), gateway?: CancelGateway) {
  const graceLimit = new Date(now.getTime() - 3 * 86_400_000)
  const ended = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(subscriptions)
      .where(
        or(
          and(
            eq(subscriptions.cancelAtPeriodEnd, true),
            notInArray(subscriptions.status, ENDED),
            lt(subscriptions.currentPeriodEnd, now)
          ),
          and(
            eq(subscriptions.status, "trialing"),
            lt(subscriptions.trialEndsAt, graceLimit),
            sql`NOT EXISTS (SELECT 1 FROM billing_transactions t WHERE t.subscription_id = ${subscriptions.id} AND t.status IN ('approved', 'refunded'))`
          )
        )
      )
      .for("update")

    for (const sub of due) {
      const toStatus: SubscriptionStatus = sub.cancelAtPeriodEnd ? "canceled" : "expired"
      // Trial expirado entra na fila para interromper as cobranças no Asaas. Cancelamentos
      // agendados já foram encerrados no gateway no momento da solicitação.
      const queueGatewayCancel = toStatus === "expired" && Boolean(sub.gatewaySubscriptionId) && !sub.gatewayCancelStatus
      await tx
        .update(subscriptions)
        .set({
          status: toStatus,
          canceledAt: sub.canceledAt ?? (toStatus === "canceled" ? now : null),
          endedAt: now,
          updatedAt: now,
          ...(queueGatewayCancel ? { gatewayCancelStatus: "pending" as const } : {}),
        })
        .where(eq(subscriptions.id, sub.id))
      await logEvent(tx, sub, toStatus === "canceled" ? "canceled" : "trial_expired", toStatus, system)
    }
    return due
  })

  const gatewayCancel = await processGatewayCancellations(db, now, gateway)
  return { updated: ended.length, gatewayCancel }
}
