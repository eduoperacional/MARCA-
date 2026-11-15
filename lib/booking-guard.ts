import { computeBillingAccess, isBillingEnforced } from "@/lib/billing/access"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { getCurrentSubscription, getSuspension } from "@/lib/billing/subscriptions"

export type QueryExec = { query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> }

/** Contador atômico por chave em janela fixa (tabela app_rate_limits). True quando a operação é permitida. */
export async function consumeRateLimit(exec: QueryExec, key: string, max: number, windowSeconds: number) {
  const { rows } = await exec.query(
    `insert into app_rate_limits (key, count, reset_at)
     values ($1, 1, now() + make_interval(secs => $2::double precision))
     on conflict (key) do update set
       count = case when app_rate_limits.reset_at < now() then 1 else app_rate_limits.count + 1 end,
       reset_at = case when app_rate_limits.reset_at < now()
         then now() + make_interval(secs => $2::double precision)
         else app_rate_limits.reset_at end
     returning count`,
    [key, windowSeconds]
  )
  return Number((rows[0] as { count: number | string }).count) <= max
}

export const PUBLIC_BOOKING_LIMITS = {
  /** Tentativas por IP, em qualquer estabelecimento. */
  ipShort: { max: 10, windowSeconds: 10 * 60 },
  ipDaily: { max: 40, windowSeconds: 24 * 60 * 60 },
  /** Reservas por telefone normalizado em um mesmo estabelecimento. */
  phoneShort: { max: 3, windowSeconds: 60 * 60 },
  phoneDaily: { max: 6, windowSeconds: 24 * 60 * 60 },
} as const

/** Limite por IP: aplicado antes de qualquer outra consulta. */
export async function allowBookingFromIp(exec: QueryExec, ip: string) {
  const { ipShort, ipDaily } = PUBLIC_BOOKING_LIMITS
  const short = await consumeRateLimit(exec, `booking-ip:${ip}`, ipShort.max, ipShort.windowSeconds)
  const daily = await consumeRateLimit(exec, `booking-ip-day:${ip}`, ipDaily.max, ipDaily.windowSeconds)
  return short && daily
}

/** Limite por telefone normalizado no estabelecimento. */
export async function allowBookingForPhone(exec: QueryExec, businessId: string, phoneNormalized: string) {
  const { phoneShort, phoneDaily } = PUBLIC_BOOKING_LIMITS
  const short = await consumeRateLimit(exec, `booking-phone:${businessId}:${phoneNormalized}`, phoneShort.max, phoneShort.windowSeconds)
  const daily = await consumeRateLimit(exec, `booking-phone-day:${businessId}:${phoneNormalized}`, phoneDaily.max, phoneDaily.windowSeconds)
  return short && daily
}

/**
 * Mesma regra do painel: suspensão administrativa sempre bloqueia; a assinatura bloqueia quando
 * BILLING_ENFORCEMENT=on e computeBillingAccess nega o acesso.
 */
export async function isPublicBookingBlocked(db: BillingDb, business: { id: string; createdAt: Date }, now = new Date()) {
  if (await getSuspension(db, business.id)) return true
  if (!isBillingEnforced()) return false
  const sub = await getCurrentSubscription(db, business.id)
  return !computeBillingAccess(business, sub, now).allowed
}
