import { sql } from "drizzle-orm"

import { PARTNER_BENEFIT_PLAN_CODE, PARTNER_BENEFIT_PLAN_LABEL } from "@/lib/billing/partner-benefit"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import type { SubscriptionStatus } from "@/lib/db/schema"

export const PAGE_SIZE = 20

/** Valor do filtro de status da listagem para o benefício gratuito de parceiro. */
export const PARTNER_STATUS_FILTER = "partner"

export type BusinessListRow = {
  id: string
  name: string
  slug: string
  phone: string | null
  created_at: string
  owner_name: string | null
  owner_email: string | null
  subscription_id: string | null
  subscription_status: SubscriptionStatus | null
  plan_name: string | null
  partner_benefit_active: boolean
  suspended: boolean
  last_access: string | null
  total: number
}

export type BusinessListFilters = { q?: string; status?: string; plan?: string; page: number }

/**
 * O benefício de parceiro (businesses.partner_benefit_active) concede ELITE sem assinatura,
 * então plano e status não podem vir só da última linha de subscriptions.
 */
export async function queryBusinessList(db: BillingDb, filters: BusinessListFilters) {
  const q = filters.q?.trim() ? `%${filters.q.trim().replace(/[%_\\]/g, "\\$&")}%` : null
  const status = filters.status || null
  const plan = filters.plan || null
  const offset = (Math.max(1, filters.page) - 1) * PAGE_SIZE

  const result = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (s.business_id) s.business_id, s.id, s.status, s.plan_id
      FROM subscriptions s
      ORDER BY s.business_id, s.created_at DESC
    )
    SELECT b.id, coalesce(b.display_name, b.name) AS name, b.slug, b.phone, b.created_at,
      u.name AS owner_name, u.email AS owner_email,
      l.id AS subscription_id, l.status AS subscription_status,
      CASE WHEN b.partner_benefit_active
        THEN coalesce((SELECT ep.name FROM plans ep WHERE ep.code = ${PARTNER_BENEFIT_PLAN_CODE}), ${PARTNER_BENEFIT_PLAN_LABEL})
        ELSE p.name END AS plan_name,
      b.partner_benefit_active,
      (bs.business_id IS NOT NULL) AS suspended,
      (SELECT max(se."updatedAt") FROM "session" se
        WHERE se."userId" IN (SELECT m.user_id FROM business_members m WHERE m.business_id = b.id)) AS last_access,
      count(*) OVER()::int AS total
    FROM businesses b
    LEFT JOIN LATERAL (
      SELECT m.user_id FROM business_members m WHERE m.business_id = b.id AND m.role = 'owner' LIMIT 1
    ) om ON true
    LEFT JOIN "user" u ON u.id = coalesce(b.owner_user_id, om.user_id)
    LEFT JOIN latest l ON l.business_id = b.id
    LEFT JOIN plans p ON p.id = l.plan_id
    LEFT JOIN business_suspensions bs ON bs.business_id = b.id
    WHERE (${q}::text IS NULL OR b.name ILIKE ${q} OR b.display_name ILIKE ${q} OR b.slug ILIKE ${q} OR u.email ILIKE ${q} OR u.name ILIKE ${q})
      AND (${plan}::text IS NULL OR (CASE WHEN b.partner_benefit_active THEN ${PARTNER_BENEFIT_PLAN_CODE} ELSE p.code END) = ${plan})
      AND (
        ${status}::text IS NULL
        OR (${status} = 'suspended' AND bs.business_id IS NOT NULL)
        OR (${status} = ${PARTNER_STATUS_FILTER} AND b.partner_benefit_active)
        OR (${status} = 'none' AND l.id IS NULL AND NOT b.partner_benefit_active)
        OR (l.status = ${status} AND NOT b.partner_benefit_active)
      )
    ORDER BY b.created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `)) as unknown as { rows: Record<string, unknown>[] }
  const rows = result.rows as unknown as BusinessListRow[]
  return { rows, total: rows[0]?.total ?? 0 }
}
