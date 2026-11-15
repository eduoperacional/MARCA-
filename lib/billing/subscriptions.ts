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

/**
 * Rotina diária: encerra cancelamentos agendados cujo período acabou e expira trials vencidos
 * há mais de 3 dias sem nenhum pagamento aprovado.
 */
export async function runBillingMaintenance(db: BillingDb, now = new Date()) {
  const graceLimit = new Date(now.getTime() - 3 * 86_400_000)
  return db.transaction(async (tx) => {
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
      await tx
        .update(subscriptions)
        .set({ status: toStatus, canceledAt: sub.canceledAt ?? (toStatus === "canceled" ? now : null), endedAt: now, updatedAt: now })
        .where(eq(subscriptions.id, sub.id))
      await logEvent(tx, sub, toStatus === "canceled" ? "canceled" : "trial_expired", toStatus, { userId: null, source: "system" })
    }
    return due.length
  })
}
