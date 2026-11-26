import { and, desc, eq, sql } from "drizzle-orm"

import { db as defaultDb } from "@/lib/db"
import {
  adminAuditLog,
  billingTransactions,
  businesses,
  businessNotes,
  businessSuspensions,
  plans,
  subscriptionEvents,
  subscriptions,
  users,
  type SubscriptionStatus,
} from "@/lib/db/schema"
import { PAGE_SIZE, queryBusinessList, type BusinessListFilters } from "@/lib/admin/business-list"
import type { BillingDb } from "@/lib/billing/process-asaas-event"

export { PAGE_SIZE, PARTNER_STATUS_FILTER, type BusinessListRow } from "@/lib/admin/business-list"

type QueryRows = { rows: Record<string, unknown>[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function listBusinesses(filters: BusinessListFilters, db: BillingDb = defaultDb) {
  return queryBusinessList(db, filters)
}

export async function listPlanOptions(db: BillingDb = defaultDb) {
  return db
    .select({ id: plans.id, code: plans.code, name: plans.name, priceCents: plans.priceCents, interval: plans.billingInterval, isActive: plans.isActive })
    .from(plans)
    .orderBy(plans.sortOrder, plans.priceCents)
}

export async function getBusinessDetail(id: string, db: BillingDb = defaultDb) {
  if (!UUID_RE.test(id)) return null
  const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1)
  if (!business) return null

  const [owner, suspension, subs, transactions, notes, audit, stats] = await Promise.all([
    business.ownerUserId
      ? db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, business.ownerUserId)).limit(1)
      : Promise.resolve([]),
    db.select().from(businessSuspensions).where(eq(businessSuspensions.businessId, id)).limit(1),
    db
      .select({ sub: subscriptions, planName: plans.name })
      .from(subscriptions)
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.businessId, id))
      .orderBy(desc(subscriptions.createdAt)),
    db.select().from(billingTransactions).where(eq(billingTransactions.businessId, id)).orderBy(desc(billingTransactions.createdAt)).limit(20),
    db
      .select({ note: businessNotes, author: users.name })
      .from(businessNotes)
      .leftJoin(users, eq(users.id, businessNotes.authorUserId))
      .where(eq(businessNotes.businessId, id))
      .orderBy(desc(businessNotes.createdAt))
      .limit(30),
    db.select().from(adminAuditLog).where(eq(adminAuditLog.businessId, id)).orderBy(desc(adminAuditLog.createdAt)).limit(20),
    (db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM business_members WHERE business_id = ${id}) AS members,
        (SELECT count(*)::int FROM professionals WHERE business_id = ${id}) AS professionals,
        (SELECT count(*)::int FROM appointments WHERE business_id = ${id} AND starts_at >= now() - interval '30 days') AS appointments_30d,
        (SELECT max(se."updatedAt") FROM "session" se
          WHERE se."userId" IN (SELECT user_id FROM business_members WHERE business_id = ${id})) AS last_access
    `) as unknown as Promise<QueryRows>),
  ])

  return {
    business,
    owner: owner[0] ?? null,
    suspension: suspension[0] ?? null,
    subscriptions: subs,
    transactions,
    notes,
    audit,
    stats: stats.rows[0] as { members: number; professionals: number; appointments_30d: number; last_access: string | null },
  }
}

export type SubscriptionListRow = {
  id: string
  business_id: string
  business_name: string
  plan_name: string | null
  price_cents: number
  billing_interval: "month" | "year"
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  courtesy_until: string | null
  created_at: string
  total: number
}

/** Visões rápidas da lista de assinaturas. */
export const SUBSCRIPTION_VIEWS: Record<string, { label: string; statuses: SubscriptionStatus[] | null }> = {
  todas: { label: "Todas", statuses: null },
  trial: { label: "Trial", statuses: ["trialing"] },
  ativas: { label: "Ativas", statuses: ["active"] },
  pendentes: { label: "Pagamento pendente", statuses: ["awaiting_payment", "payment_pending"] },
  inadimplentes: { label: "Inadimplentes", statuses: ["past_due"] },
  encerradas: { label: "Canceladas/expiradas", statuses: ["canceled", "expired", "suspended"] },
}

export async function listSubscriptions(
  filters: { q?: string; view?: string; plan?: string; page: number },
  db: BillingDb = defaultDb
) {
  const q = filters.q?.trim() ? `%${filters.q.trim().replace(/[%_\\]/g, "\\$&")}%` : null
  const statuses = SUBSCRIPTION_VIEWS[filters.view ?? "todas"]?.statuses ?? null
  const statusList = statuses ? `{${statuses.join(",")}}` : null
  const plan = filters.plan || null
  const offset = (Math.max(1, filters.page) - 1) * PAGE_SIZE

  const result = (await db.execute(sql`
    SELECT s.id, s.business_id, coalesce(b.display_name, b.name) AS business_name, p.name AS plan_name,
      s.price_cents, s.billing_interval, s.status, s.trial_ends_at, s.current_period_end,
      s.cancel_at_period_end, s.courtesy_until, s.created_at, count(*) OVER()::int AS total
    FROM subscriptions s
    JOIN businesses b ON b.id = s.business_id
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE (${q}::text IS NULL OR b.name ILIKE ${q} OR b.display_name ILIKE ${q} OR b.slug ILIKE ${q})
      AND (${statusList}::text[] IS NULL OR s.status = ANY(${statusList}::text[]))
      AND (${plan}::text IS NULL OR p.code = ${plan})
    ORDER BY s.created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `)) as unknown as QueryRows
  const rows = result.rows as unknown as SubscriptionListRow[]
  return { rows, total: rows[0]?.total ?? 0 }
}

export async function getSubscriptionSummary(db: BillingDb = defaultDb) {
  const result = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'trialing')::int AS trialing,
      count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE status IN ('awaiting_payment', 'payment_pending'))::int AS pending,
      count(*) FILTER (WHERE status = 'past_due')::int AS past_due,
      count(*) FILTER (WHERE status = 'active' AND current_period_end BETWEEN now() AND now() + interval '7 days')::int AS renewing_7d,
      coalesce(sum(CASE WHEN status = 'active' AND NOT EXISTS (SELECT 1 FROM plans tp WHERE tp.id = plan_id AND tp.is_test) THEN
        CASE WHEN billing_interval = 'year' THEN price_cents / 12.0 ELSE price_cents END END), 0)::bigint AS mrr_cents
    FROM subscriptions
  `)) as unknown as QueryRows
  const row = result.rows[0] as Record<string, number | string>
  return {
    trialing: Number(row.trialing),
    active: Number(row.active),
    pending: Number(row.pending),
    pastDue: Number(row.past_due),
    renewing7d: Number(row.renewing_7d),
    mrrCents: Number(row.mrr_cents),
  }
}

export async function getSubscriptionDetail(id: string, db: BillingDb = defaultDb) {
  if (!UUID_RE.test(id)) return null
  const [row] = await db
    .select({ sub: subscriptions, plan: plans, businessName: businesses.name, businessDisplayName: businesses.displayName })
    .from(subscriptions)
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
    .where(eq(subscriptions.id, id))
    .limit(1)
  if (!row) return null

  const [events, transactions] = await Promise.all([
    db
      .select({ event: subscriptionEvents, actor: users.name })
      .from(subscriptionEvents)
      .leftJoin(users, eq(users.id, subscriptionEvents.actorUserId))
      .where(eq(subscriptionEvents.subscriptionId, id))
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(50),
    db
      .select()
      .from(billingTransactions)
      .where(and(eq(billingTransactions.subscriptionId, id)))
      .orderBy(desc(billingTransactions.createdAt))
      .limit(50),
  ])
  return { ...row, events, transactions }
}
