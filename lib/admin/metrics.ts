import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

export type AdminPeriod = "30d" | "90d" | "12m" | "ano"

export const ADMIN_PERIODS: { value: AdminPeriod; label: string }[] = [
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "ano", label: "Este ano" },
]

export function resolvePeriod(value: string | undefined) {
  const period: AdminPeriod = ADMIN_PERIODS.some((p) => p.value === value) ? (value as AdminPeriod) : "30d"
  const end = new Date()
  const start = new Date(end)
  if (period === "30d") start.setDate(start.getDate() - 30)
  if (period === "90d") start.setDate(start.getDate() - 90)
  if (period === "12m") start.setMonth(start.getMonth() - 12)
  if (period === "ano") start.setMonth(0, 1)
  if (period === "ano") start.setHours(0, 0, 0, 0)
  return { period, start, end }
}

async function rows<T>(query: ReturnType<typeof sql>) {
  const result = await db.execute(query)
  return result.rows as T[]
}

/**
 * Receita mensal normalizada de uma assinatura: planos anuais contam 1/12 por mês.
 * Assinaturas em cortesia vigente não entram no MRR porque não geram cobrança.
 */
const MRR_EXPR = sql`CASE WHEN s.billing_interval = 'year' THEN s.price_cents / 12.0 ELSE s.price_cents END`
const PAYING = sql`s.status = 'active' AND (s.courtesy_until IS NULL OR s.courtesy_until < now())`
/** Valor efetivamente recebido: aprovado ou reembolsado parcialmente, menos o reembolso. */
const RECEIVED_EXPR = sql`CASE WHEN t.status IN ('approved', 'refunded') THEN t.amount_cents - t.refunded_cents ELSE 0 END`
/** Planos de teste interno (plans.is_test) não contam como receita comercial nem MRR. */
const COMMERCIAL_SUB = sql`NOT EXISTS (SELECT 1 FROM plans tp WHERE tp.id = s.plan_id AND tp.is_test)`
const COMMERCIAL_TX = sql`NOT EXISTS (SELECT 1 FROM plans tp WHERE tp.id = t.plan_id AND tp.is_test)`

export async function getOverview(start: Date, end: Date) {
  const [base] = await rows<{
    businesses: number
    users: number
    new_businesses: number
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM businesses) AS businesses,
      (SELECT count(*)::int FROM "user") AS users,
      (SELECT count(*)::int FROM businesses WHERE created_at BETWEEN ${start} AND ${end}) AS new_businesses
  `)

  const [subs] = await rows<{
    active: number
    trialing: number
    canceled: number
    delinquent: number
    paying: number
    mrr_cents: number
  }>(sql`
    SELECT
      count(*) FILTER (WHERE s.status = 'active')::int AS active,
      count(*) FILTER (WHERE s.status = 'trialing')::int AS trialing,
      count(*) FILTER (WHERE s.status = 'canceled')::int AS canceled,
      count(*) FILTER (WHERE s.status IN ('past_due', 'payment_pending', 'awaiting_payment', 'expired'))::int AS delinquent,
      count(*) FILTER (WHERE ${PAYING} AND ${COMMERCIAL_SUB})::int AS paying,
      coalesce(sum(${MRR_EXPR}) FILTER (WHERE ${PAYING} AND ${COMMERCIAL_SUB}), 0)::float8 AS mrr_cents
    FROM subscriptions s
    WHERE s.id IN (
      SELECT DISTINCT ON (business_id) id FROM subscriptions ORDER BY business_id, created_at DESC
    )
  `)

  const [money] = await rows<{ received_cents: number; pending_cents: number }>(sql`
    SELECT
      coalesce(sum(${RECEIVED_EXPR}) FILTER (WHERE t.paid_at BETWEEN ${start} AND ${end}), 0)::float8 AS received_cents,
      coalesce(sum(t.amount_cents) FILTER (WHERE t.status = 'pending'), 0)::float8 AS pending_cents
    FROM billing_transactions t
    WHERE ${COMMERCIAL_TX}
  `)

  const mrr = subs.mrr_cents / 100
  return {
    businesses: base.businesses,
    users: base.users,
    newBusinesses: base.new_businesses,
    active: subs.active,
    trialing: subs.trialing,
    canceled: subs.canceled,
    delinquent: subs.delinquent,
    mrr,
    arr: mrr * 12,
    averageTicket: subs.paying ? mrr / subs.paying : 0,
    received: money.received_cents / 100,
    pending: money.pending_cents / 100,
  }
}

export type MonthlyPoint = {
  month: string
  newBusinesses: number
  totalBusinesses: number
  newSubscriptions: number
  cancellations: number
  revenue: number
}

export async function getMonthlySeries(months = 12): Promise<MonthlyPoint[]> {
  const data = await rows<{
    month: string
    new_businesses: number
    total_businesses: number
    new_subscriptions: number
    cancellations: number
    revenue_cents: number
  }>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', now()) - make_interval(months => ${months - 1}),
        date_trunc('month', now()),
        interval '1 month'
      ) AS m
    )
    SELECT
      to_char(m, 'YYYY-MM') AS month,
      (SELECT count(*)::int FROM businesses b WHERE date_trunc('month', b.created_at) = m) AS new_businesses,
      (SELECT count(*)::int FROM businesses b WHERE b.created_at < m + interval '1 month') AS total_businesses,
      (SELECT count(*)::int FROM subscriptions s WHERE date_trunc('month', s.created_at) = m) AS new_subscriptions,
      (SELECT count(*)::int FROM subscriptions s WHERE date_trunc('month', s.canceled_at) = m) AS cancellations,
      (SELECT coalesce(sum(${RECEIVED_EXPR}), 0)::float8 FROM billing_transactions t WHERE date_trunc('month', t.paid_at) = m AND ${COMMERCIAL_TX}) AS revenue_cents
    FROM months
    ORDER BY m
  `)
  return data.map((row) => ({
    month: row.month,
    newBusinesses: row.new_businesses,
    totalBusinesses: row.total_businesses,
    newSubscriptions: row.new_subscriptions,
    cancellations: row.cancellations,
    revenue: row.revenue_cents / 100,
  }))
}

export type PlanSlice = { planId: string; name: string; subscribers: number; mrr: number; received: number }

export async function getPlanBreakdown(start: Date, end: Date): Promise<PlanSlice[]> {
  const data = await rows<{ id: string; name: string; subscribers: number; mrr_cents: number; received_cents: number }>(sql`
    SELECT
      p.id, p.name,
      (SELECT count(*)::int FROM subscriptions s WHERE s.plan_id = p.id AND s.status IN ('active', 'trialing', 'past_due', 'payment_pending')) AS subscribers,
      (SELECT coalesce(sum(${MRR_EXPR}), 0)::float8 FROM subscriptions s WHERE s.plan_id = p.id AND ${PAYING}) AS mrr_cents,
      (SELECT coalesce(sum(${RECEIVED_EXPR}), 0)::float8 FROM billing_transactions t
        WHERE t.plan_id = p.id AND t.paid_at BETWEEN ${start} AND ${end}) AS received_cents
    FROM plans p
    WHERE NOT p.is_test
    ORDER BY p.sort_order, p.name
  `)
  return data.map((row) => ({
    planId: row.id,
    name: row.name,
    subscribers: row.subscribers,
    mrr: row.mrr_cents / 100,
    received: row.received_cents / 100,
  }))
}

/**
 * Indicadores de saúde comercial no período [start, end].
 * - Novos assinantes: estabelecimentos cujo PRIMEIRO pagamento aprovado caiu no período.
 * - Churn: cancelamentos efetivados (ended_at) no período ÷ assinaturas pagantes no início do período.
 * - Conversão trial → pago: trials encerrados no período que tiveram pagamento aprovado ÷ trials encerrados.
 * - Inadimplência: assinaturas atrasadas ou com pagamento pendente ÷ assinaturas cobráveis (ativa + atrasada + pendente).
 * - Cancelamento solicitado (cancel_requested_at) ≠ efetivado (status canceled + ended_at) ≠ expirada (status expired).
 */
export async function getGrowthMetrics(start: Date, end: Date) {
  const [m] = await rows<{
    new_subscribers: number
    churned: number
    base_at_start: number
    trials_ended: number
    trials_converted: number
    delinquent: number
    billable: number
    cancel_requested: number
    cancel_effective: number
    expired: number
    refunds_cents: number
    failed_payments: number
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM (
        SELECT business_id, min(paid_at) AS first_paid FROM billing_transactions
        WHERE status IN ('approved', 'refunded') AND paid_at IS NOT NULL GROUP BY business_id
      ) f WHERE f.first_paid BETWEEN ${start} AND ${end}) AS new_subscribers,
      (SELECT count(*)::int FROM subscriptions WHERE status = 'canceled' AND ended_at BETWEEN ${start} AND ${end}) AS churned,
      (SELECT count(*)::int FROM subscriptions s
        WHERE s.started_at < ${start}
          AND (s.ended_at IS NULL OR s.ended_at >= ${start})
          AND EXISTS (SELECT 1 FROM billing_transactions t WHERE t.subscription_id = s.id AND t.status IN ('approved', 'refunded') AND t.paid_at < ${start})
      ) AS base_at_start,
      (SELECT count(*)::int FROM subscriptions WHERE trial_ends_at BETWEEN ${start} AND ${end}) AS trials_ended,
      (SELECT count(*)::int FROM subscriptions s WHERE s.trial_ends_at BETWEEN ${start} AND ${end}
        AND EXISTS (SELECT 1 FROM billing_transactions t WHERE t.subscription_id = s.id AND t.status IN ('approved', 'refunded'))
      ) AS trials_converted,
      (SELECT count(*)::int FROM subscriptions WHERE status IN ('past_due', 'payment_pending')) AS delinquent,
      (SELECT count(*)::int FROM subscriptions WHERE status IN ('active', 'past_due', 'payment_pending')) AS billable,
      (SELECT count(*)::int FROM subscriptions WHERE cancel_requested_at BETWEEN ${start} AND ${end}) AS cancel_requested,
      (SELECT count(*)::int FROM subscriptions WHERE status = 'canceled' AND ended_at BETWEEN ${start} AND ${end}) AS cancel_effective,
      (SELECT count(*)::int FROM subscriptions WHERE status = 'expired' AND ended_at BETWEEN ${start} AND ${end}) AS expired,
      (SELECT coalesce(sum(refunded_cents), 0)::float8 FROM billing_transactions WHERE updated_at BETWEEN ${start} AND ${end} AND refunded_cents > 0) AS refunds_cents,
      (SELECT count(*)::int FROM billing_transactions WHERE status = 'declined' AND created_at BETWEEN ${start} AND ${end}) AS failed_payments
  `)

  const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
  return {
    newSubscribers: m.new_subscribers,
    churnRate: ratio(m.churned, m.base_at_start),
    churned: m.churned,
    baseAtStart: m.base_at_start,
    trialConversion: ratio(m.trials_converted, m.trials_ended),
    trialsEnded: m.trials_ended,
    trialsConverted: m.trials_converted,
    delinquencyRate: ratio(m.delinquent, m.billable),
    delinquent: m.delinquent,
    billable: m.billable,
    cancelRequested: m.cancel_requested,
    cancelEffective: m.cancel_effective,
    expired: m.expired,
    refunds: m.refunds_cents / 100,
    failedPayments: m.failed_payments,
  }
}
