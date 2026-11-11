import "server-only"

import { and, asc, eq, ilike, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { localParts } from "@/lib/time"

export interface ClientItem {
  id: string
  name: string
  phone: string
  email: string | null
  birthDate: string | null
  notes: string | null
  createdAt: string
  visits: number
  totalSpent: number
  lastVisit: string | null
  nextAppointment: string | null
  daysSinceLastVisit: number | null
}

export type ClientSegment = "all" | "new" | "recurring" | "inactive"

/** Clientes sem visita há mais de N dias são considerados "sem retorno". */
export const INACTIVE_AFTER_DAYS = 45

const visitsSql = sql<number>`(select count(*) from appointments a where a.client_id = ${clients.id} and a.status = 'completed')::int`
const spentSql = sql<number>`coalesce((select sum(a.price_cents) from appointments a where a.client_id = ${clients.id} and a.status = 'completed'), 0)::int`
const lastVisitSql = sql<Date | null>`(select max(a.starts_at) from appointments a where a.client_id = ${clients.id} and a.status = 'completed')`
const nextSql = sql<Date | null>`(select min(a.starts_at) from appointments a where a.client_id = ${clients.id} and a.status in ('pending','confirmed') and a.starts_at > now())`

export async function listClients(businessId: string, { query, segment = "all", clientId }: { query?: string; segment?: ClientSegment; clientId?: string } = {}) {
  const term = query?.trim()
  const digits = term?.replace(/\D/g, "") ?? ""
  const rows = await db
    .select({
      client: clients,
      visits: visitsSql,
      spentCents: spentSql,
      lastVisit: lastVisitSql,
      nextAppointment: nextSql,
    })
    .from(clients)
    .where(
      and(
        eq(clients.businessId, businessId),
        clientId ? eq(clients.id, clientId) : undefined,
        term
          ? or(
              ilike(clients.name, `%${term}%`),
              ilike(clients.email, `%${term}%`),
              digits.length >= 3 ? ilike(clients.phoneNormalized, `%${digits}%`) : undefined
            )
          : undefined
      )
    )
    .orderBy(asc(clients.name))

  const now = Date.now()
  const items = rows.map<ClientItem>((row) => {
    const last = row.lastVisit ? new Date(row.lastVisit) : null
    const next = row.nextAppointment ? new Date(row.nextAppointment) : null
    return {
      id: row.client.id,
      name: row.client.name,
      phone: row.client.phone,
      email: row.client.email,
      birthDate: row.client.birthDate,
      notes: row.client.notes,
      createdAt: localParts(row.client.createdAt).date,
      visits: row.visits,
      totalSpent: row.spentCents / 100,
      lastVisit: last ? localParts(last).date : null,
      nextAppointment: next ? next.toISOString() : null,
      daysSinceLastVisit: last ? Math.floor((now - last.getTime()) / 86_400_000) : null,
    }
  })

  return items.filter((c) => {
    if (segment === "new") return c.visits <= 1
    if (segment === "recurring") return c.visits >= 2
    if (segment === "inactive")
      return c.daysSinceLastVisit !== null && c.daysSinceLastVisit > INACTIVE_AFTER_DAYS && !c.nextAppointment
    return true
  })
}

export async function getClient(businessId: string, id: string) {
  const [client] = await listClients(businessId, { clientId: id })
  return client ?? null
}
