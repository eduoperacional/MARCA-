import { and, eq, gt, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm"

import * as schema from "@/lib/db/schema"
import type { BillingInterval, PromoCampaignRow, PromoRedemptionRow, SubscriptionRow, SubscriptionStatus } from "@/lib/db/schema"
import type { BillingDb } from "@/lib/billing/process-asaas-event"

const { billingTransactions, plans, promoCampaigns, promoRedemptions, subscriptionEvents, subscriptions } = schema

type Tx = Parameters<Parameters<BillingDb["transaction"]>[0]>[0]
type Conn = BillingDb | Tx

export const LAUNCH_PROMO_CODE = "lancamento"
/**
 * Por quanto tempo um checkout sem pagamento segura a vaga, contado da primeira cobrança
 * (fim do trial ou contratação). Cobre a compensação do boleto (até 3 dias úteis).
 */
export const PROMO_HOLD_DAYS = 5
export const PROMO_HOLD_MS = PROMO_HOLD_DAYS * 86_400_000
export const PROMO_PRICE_SYNC_MAX_ATTEMPTS = 8
const PROMO_PRICE_SYNC_LEASE_MS = 10 * 60_000
const PROMO_PRICE_SYNC_BATCH = 100
const ENDED: SubscriptionStatus[] = ["canceled", "expired"]

type PlanLike = { code: string; family: string | null; billingInterval: BillingInterval; isTest?: boolean }
type CampaignRules = Pick<PromoCampaignRow, "planFamilies" | "billingIntervals">

export function discountedCents(priceCents: number, discountPercent: number) {
  return Math.round((priceCents * (100 - discountPercent)) / 100)
}

export function isCampaignOpen(campaign: Pick<PromoCampaignRow, "isActive" | "startsAt" | "endsAt">, now: Date) {
  return campaign.isActive && campaign.startsAt <= now && (!campaign.endsAt || campaign.endsAt > now)
}

export function isPlanEligible(campaign: CampaignRules, plan: PlanLike) {
  const family = plan.family ?? plan.code
  return (
    !plan.isTest &&
    (campaign.planFamilies.length === 0 || campaign.planFamilies.includes(family)) &&
    campaign.billingIntervals.includes(plan.billingInterval)
  )
}

/** Ainda há ciclos com desconto a cobrar nesta reserva. */
export function hasDiscountLeft(redemption: Pick<PromoRedemptionRow, "status" | "paidCycles" | "discountedCycles"> | null) {
  return Boolean(
    redemption && (redemption.status === "reserved" || redemption.status === "confirmed") && redemption.paidCycles < redemption.discountedCycles
  )
}

async function getCampaign(db: Conn, code: string, lock = false) {
  const query = db.select().from(promoCampaigns).where(eq(promoCampaigns.code, code)).limit(1)
  const [row] = lock ? await query.for("update") : await query
  return row ?? null
}

/**
 * Vagas ocupadas: promoções já pagas (definitivas) mais reservas dentro do prazo cuja assinatura
 * segue vigente. Reservas vencidas ou de assinaturas encerradas não contam, mesmo antes da limpeza diária.
 */
export async function countUsedSlots(db: Conn, code: string, now: Date, excludeBusinessId?: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .innerJoin(subscriptions, eq(subscriptions.id, promoRedemptions.subscriptionId))
    .where(
      and(
        eq(promoRedemptions.campaignCode, code),
        excludeBusinessId ? ne(promoRedemptions.businessId, excludeBusinessId) : undefined,
        or(
          inArray(promoRedemptions.status, ["confirmed", "completed"]),
          and(
            eq(promoRedemptions.status, "reserved"),
            gt(promoRedemptions.expiresAt, now),
            notInArray(subscriptions.status, ENDED)
          ),
          // Trial com plano escolhido aguardando o cron criar a assinatura no Asaas: segue reservada.
          and(
            eq(promoRedemptions.status, "reserved"),
            eq(subscriptions.gatewayActivationStatus, "pending"),
            notInArray(subscriptions.status, ENDED)
          )
        )
      )
    )
  return row?.count ?? 0
}

/**
 * Somente novos clientes: nunca tiveram assinatura no Asaas, nunca pagaram e não usaram a promoção.
 * Assinantes existentes (inclusive antigos) não recebem o desconto retroativamente.
 */
export async function isBusinessEligibleForPromo(db: Conn, businessId: string, code = LAUNCH_PROMO_CODE) {
  const [hadGatewaySub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), sql`${subscriptions.gatewaySubscriptionId} IS NOT NULL`))
    .limit(1)
  if (hadGatewaySub) return false
  const [paid] = await db
    .select({ id: billingTransactions.id })
    .from(billingTransactions)
    .where(and(eq(billingTransactions.businessId, businessId), inArray(billingTransactions.status, ["approved", "refunded", "charged_back"])))
    .limit(1)
  if (paid) return false
  const [used] = await db
    .select({ id: promoRedemptions.id })
    .from(promoRedemptions)
    .where(
      and(
        eq(promoRedemptions.campaignCode, code),
        eq(promoRedemptions.businessId, businessId),
        inArray(promoRedemptions.status, ["confirmed", "completed"])
      )
    )
    .limit(1)
  return !used
}

export type LaunchPromoStatus = {
  code: string
  name: string
  discountPercent: number
  discountedCycles: number
  maxRedemptions: number
  remaining: number
  planFamilies: string[]
  billingIntervals: BillingInterval[]
}

/** Campanha aberta e com vagas. Null quando encerrada, inativa ou esgotada. */
export async function getLaunchPromoStatus(db: BillingDb, now = new Date(), code = LAUNCH_PROMO_CODE): Promise<LaunchPromoStatus | null> {
  const campaign = await getCampaign(db, code)
  if (!campaign || !isCampaignOpen(campaign, now)) return null
  const used = await countUsedSlots(db, code, now)
  const remaining = Math.max(0, campaign.maxRedemptions - used)
  if (remaining === 0) return null
  return {
    code: campaign.code,
    name: campaign.name,
    discountPercent: campaign.discountPercent,
    discountedCycles: campaign.discountedCycles,
    maxRedemptions: campaign.maxRedemptions,
    remaining,
    planFamilies: campaign.planFamilies,
    billingIntervals: campaign.billingIntervals,
  }
}

/** Para páginas públicas: nunca derruba a página (ex.: migração 019 ainda não executada). */
export async function loadLaunchPromoSafe(db: BillingDb, businessId?: string) {
  try {
    const status = await getLaunchPromoStatus(db)
    if (!status) return null
    if (businessId && !(await isBusinessEligibleForPromo(db, businessId, status.code))) return null
    return status
  } catch (error) {
    console.error("[billing] promoção de lançamento indisponível", error)
    return null
  }
}

export function promoAppliesTo(promo: Pick<LaunchPromoStatus, "planFamilies" | "billingIntervals">, plan: { family: string; interval: BillingInterval }) {
  return (promo.planFamilies.length === 0 || promo.planFamilies.includes(plan.family)) && promo.billingIntervals.includes(plan.interval)
}

async function logPromoEvent(db: Conn, sub: Pick<SubscriptionRow, "id" | "businessId" | "status">, type: string, details: Record<string, unknown>) {
  await db.insert(subscriptionEvents).values({
    subscriptionId: sub.id,
    businessId: sub.businessId,
    type,
    fromStatus: sub.status,
    toStatus: sub.status,
    source: "system",
    details,
  })
}

/**
 * Reserva uma vaga na mesma transação que cria a assinatura local. A linha da campanha é bloqueada
 * (FOR UPDATE), então checkouts simultâneos contam as vagas um de cada vez e nunca passam do limite.
 */
export async function reservePromoSlot(
  tx: Tx,
  input: { sub: SubscriptionRow; plan: PlanLike; now: Date; holdUntil: Date; code?: string }
) {
  const code = input.code ?? LAUNCH_PROMO_CODE
  const campaign = await getCampaign(tx, code, true)
  if (!campaign || !isCampaignOpen(campaign, input.now) || !isPlanEligible(campaign, input.plan)) return null
  if (!(await isBusinessEligibleForPromo(tx, input.sub.businessId, code))) return null
  if ((await countUsedSlots(tx, code, input.now, input.sub.businessId)) >= campaign.maxRedemptions) return null

  const values = {
    campaignCode: code,
    businessId: input.sub.businessId,
    subscriptionId: input.sub.id,
    status: "reserved" as const,
    discountPercent: campaign.discountPercent,
    discountedCycles: campaign.discountedCycles,
    paidCycles: 0,
    reservedAt: input.now,
    expiresAt: input.holdUntil,
    confirmedAt: null,
    completedAt: null,
    releasedAt: null,
    releaseReason: null,
    priceSyncStatus: null,
    priceSyncAttempts: 0,
    priceSyncLastError: null,
    priceSyncLastAttemptAt: null,
    priceSyncedAt: null,
    updatedAt: input.now,
  }
  // Reserva anterior abandonada (released) ou de uma assinatura substituída é reaproveitada;
  // uma promoção já paga nunca é sobrescrita.
  const [row] = await tx
    .insert(promoRedemptions)
    .values(values)
    .onConflictDoUpdate({
      target: [promoRedemptions.campaignCode, promoRedemptions.businessId],
      set: values,
      setWhere: inArray(promoRedemptions.status, ["reserved", "released"]),
    })
    .returning()
  if (!row) return null
  await logPromoEvent(tx, input.sub, "promo_reserved", {
    campaign: code,
    discountPercent: row.discountPercent,
    discountedCycles: row.discountedCycles,
    expiresAt: row.expiresAt,
  })
  return row
}

export async function getSubscriptionPromo(db: Conn, subscriptionId: string) {
  const [row] = await db.select().from(promoRedemptions).where(eq(promoRedemptions.subscriptionId, subscriptionId)).limit(1)
  return row ?? null
}

/** Valor a cobrar no Asaas para esta assinatura e plano: com desconto enquanto restarem ciclos promocionais. */
export async function gatewayPriceCents(db: Conn, subscriptionId: string, plan: PlanLike & { priceCents: number }) {
  const [row] = await db
    .select({ redemption: promoRedemptions, campaign: promoCampaigns })
    .from(promoRedemptions)
    .innerJoin(promoCampaigns, eq(promoCampaigns.code, promoRedemptions.campaignCode))
    .where(eq(promoRedemptions.subscriptionId, subscriptionId))
    .limit(1)
  if (!row || !hasDiscountLeft(row.redemption) || !isPlanEligible(row.campaign, plan)) return plan.priceCents
  return discountedCents(plan.priceCents, row.redemption.discountPercent)
}

/** A assinatura acabou de ser criada no Asaas: o prazo da reserva passa a contar da primeira cobrança. */
export async function extendPromoHold(db: Conn, subscriptionId: string, now: Date) {
  await db
    .update(promoRedemptions)
    .set({ expiresAt: new Date(now.getTime() + PROMO_HOLD_MS), updatedAt: now })
    .where(and(eq(promoRedemptions.subscriptionId, subscriptionId), eq(promoRedemptions.status, "reserved")))
}

/**
 * Chamado pelo webhook, na mesma transação, quando uma cobrança da assinatura é aprovada.
 * - Primeiro pagamento confirma a vaga (com nova checagem de limite se a reserva já venceu).
 * - Cada cobrança com desconto conta um ciclo uma única vez (billing_transactions.promo_cycle),
 *   então reenvios do webhook, retentativas de cartão e estornos revertidos não contam de novo.
 * - Ao pagar o último ciclo promocional, enfileira a volta ao preço integral no Asaas.
 */
export async function registerPromoPayment(
  tx: Tx,
  sub: SubscriptionRow,
  payment: { gatewayTransactionId: string; amountCents: number },
  now: Date
) {
  const [redemption] = await tx
    .select()
    .from(promoRedemptions)
    .where(eq(promoRedemptions.subscriptionId, sub.id))
    .for("update")
    .limit(1)
  if (!redemption || redemption.status === "released" || redemption.status === "completed") return null

  let current = redemption
  if (current.status === "reserved") {
    const campaign = await getCampaign(tx, current.campaignCode, true)
    const expired = current.expiresAt <= now
    const full =
      expired && (!campaign || (await countUsedSlots(tx, current.campaignCode, now, current.businessId)) >= campaign.maxRedemptions)
    if (full) {
      await tx
        .update(promoRedemptions)
        .set({
          status: "released",
          releasedAt: now,
          releaseReason: "vagas_esgotadas_no_pagamento",
          priceSyncStatus: sub.gatewaySubscriptionId ? "pending" : null,
          updatedAt: now,
        })
        .where(eq(promoRedemptions.id, current.id))
      await logPromoEvent(tx, sub, "promo_released", { reason: "vagas_esgotadas_no_pagamento", paymentId: payment.gatewayTransactionId })
      return "released" as const
    }
    const [confirmed] = await tx
      .update(promoRedemptions)
      .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
      .where(eq(promoRedemptions.id, current.id))
      .returning()
    current = confirmed
    await logPromoEvent(tx, sub, "promo_confirmed", { campaign: current.campaignCode, paymentId: payment.gatewayTransactionId })
  }

  if (current.paidCycles >= current.discountedCycles) return "confirmed" as const
  // Só conta cobranças emitidas com desconto (uma cobrança cheia não consome ciclo promocional).
  if (payment.amountCents > discountedCents(sub.priceCents, current.discountPercent)) return "confirmed" as const

  const cycle = current.paidCycles + 1
  const [marked] = await tx
    .update(billingTransactions)
    .set({ promoCycle: cycle, updatedAt: now })
    .where(
      and(
        eq(billingTransactions.gateway, "asaas"),
        eq(billingTransactions.gatewayTransactionId, payment.gatewayTransactionId),
        isNull(billingTransactions.promoCycle)
      )
    )
    .returning({ id: billingTransactions.id })
  if (!marked) return "confirmed" as const

  const completed = cycle >= current.discountedCycles
  await tx
    .update(promoRedemptions)
    .set({
      paidCycles: cycle,
      ...(completed ? { status: "completed" as const, completedAt: now, priceSyncStatus: "pending" as const } : {}),
      updatedAt: now,
    })
    .where(eq(promoRedemptions.id, current.id))
  await logPromoEvent(tx, sub, completed ? "promo_completed" : "promo_cycle_paid", {
    cycle,
    discountedCycles: current.discountedCycles,
    paymentId: payment.gatewayTransactionId,
    amountCents: payment.amountCents,
  })
  return completed ? ("completed" as const) : ("cycle_paid" as const)
}

/**
 * Devolve vagas de checkouts abandonados: reserva vencida sem pagamento (exceto trial ainda aguardando
 * a criação da assinatura pelo cron) ou assinatura encerrada antes do primeiro pagamento.
 * Se já existir assinatura no Asaas com valor promocional, enfileira a volta ao preço integral.
 */
export async function releaseAbandonedPromoReservations(db: BillingDb, now: Date) {
  const rows = await db
    .select({ id: promoRedemptions.id, sub: subscriptions })
    .from(promoRedemptions)
    .innerJoin(subscriptions, eq(subscriptions.id, promoRedemptions.subscriptionId))
    .where(
      and(
        eq(promoRedemptions.status, "reserved"),
        or(
          inArray(subscriptions.status, ENDED),
          and(
            lt(promoRedemptions.expiresAt, now),
            or(isNull(subscriptions.gatewayActivationStatus), eq(subscriptions.gatewayActivationStatus, "done"))
          )
        )
      )
    )

  let released = 0
  for (const { id, sub } of rows) {
    const ended = ENDED.includes(sub.status)
    const reason = ended ? "assinatura_encerrada" : "checkout_abandonado"
    const [row] = await db
      .update(promoRedemptions)
      .set({
        status: "released",
        releasedAt: now,
        releaseReason: reason,
        priceSyncStatus: !ended && sub.gatewaySubscriptionId ? "pending" : null,
        updatedAt: now,
      })
      .where(and(eq(promoRedemptions.id, id), eq(promoRedemptions.status, "reserved")))
      .returning({ id: promoRedemptions.id })
    if (!row) continue
    released++
    await logPromoEvent(db, sub, "promo_released", { reason })
  }
  return released
}

type PriceGateway = {
  updateSubscription(id: string, input: { value: number; cycle: "MONTHLY" | "YEARLY"; description: string }): Promise<unknown>
}

export type PromoPriceSyncSummary = { synced: number; failedAttempts: number; pending: number; failed: number }

/**
 * Fila persistente que devolve a assinatura no Asaas ao preço integral (3º ciclo em diante ou vaga
 * devolvida). Cada item é reservado com UPDATE condicional, como as demais filas de cobrança, e
 * `updatePendingPayments` ajusta também a próxima cobrança já emitida.
 */
export async function processPromoPriceSync(db: BillingDb, gateway: PriceGateway, now = new Date()) {
  let synced = 0
  let failedAttempts = 0
  const leaseLimit = new Date(now.getTime() - PROMO_PRICE_SYNC_LEASE_MS)
  const claimable = and(
    eq(promoRedemptions.priceSyncStatus, "pending"),
    or(isNull(promoRedemptions.priceSyncLastAttemptAt), lt(promoRedemptions.priceSyncLastAttemptAt, leaseLimit))
  )
  const candidates = await db.select({ id: promoRedemptions.id }).from(promoRedemptions).where(claimable).limit(PROMO_PRICE_SYNC_BATCH)

  for (const { id } of candidates) {
    const [claimed] = await db
      .update(promoRedemptions)
      .set({
        priceSyncAttempts: sql`${promoRedemptions.priceSyncAttempts} + 1`,
        priceSyncLastAttemptAt: now,
        updatedAt: now,
      })
      .where(and(eq(promoRedemptions.id, id), claimable))
      .returning()
    if (!claimed) continue

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, claimed.subscriptionId)).limit(1)
    const finish = (extra: Partial<typeof promoRedemptions.$inferInsert> = {}) =>
      db
        .update(promoRedemptions)
        .set({ priceSyncStatus: "done", priceSyncedAt: now, priceSyncLastError: null, updatedAt: now, ...extra })
        .where(and(eq(promoRedemptions.id, id), eq(promoRedemptions.priceSyncStatus, "pending")))

    if (!sub?.gatewaySubscriptionId || ENDED.includes(sub.status)) {
      await finish()
      continue
    }
    const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, sub.planId)).limit(1)
    try {
      await gateway.updateSubscription(sub.gatewaySubscriptionId, {
        value: sub.priceCents / 100,
        cycle: sub.billingInterval === "year" ? "YEARLY" : "MONTHLY",
        description: `MARCAÍ - Plano ${plan?.name ?? "MARCAÍ"} (${sub.billingInterval === "year" ? "anual" : "mensal"})`,
      })
      await finish()
      await logPromoEvent(db, sub, "promo_price_restored", {
        gatewaySubscriptionId: sub.gatewaySubscriptionId,
        priceCents: sub.priceCents,
        attempts: claimed.priceSyncAttempts,
      })
      synced++
    } catch (error) {
      failedAttempts++
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
      const exhausted = claimed.priceSyncAttempts >= PROMO_PRICE_SYNC_MAX_ATTEMPTS
      console.error("[billing] falha ao restaurar preço integral no Asaas", sub.gatewaySubscriptionId, message)
      await db
        .update(promoRedemptions)
        .set({ priceSyncStatus: exhausted ? "failed" : "pending", priceSyncLastError: message, updatedAt: now })
        .where(and(eq(promoRedemptions.id, id), eq(promoRedemptions.priceSyncStatus, "pending")))
    }
  }

  const counts = await db
    .select({ status: promoRedemptions.priceSyncStatus, count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(inArray(promoRedemptions.priceSyncStatus, ["pending", "failed"]))
    .groupBy(promoRedemptions.priceSyncStatus)
  const countOf = (status: string) => counts.find((c) => c.status === status)?.count ?? 0
  return { synced, failedAttempts, pending: countOf("pending"), failed: countOf("failed") } satisfies PromoPriceSyncSummary
}
