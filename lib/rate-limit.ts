import "server-only"

import { headers } from "next/headers"

import { pool } from "@/lib/db"

/** Contador atômico por chave em janela fixa. Retorna true quando a operação é permitida. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const { rows } = await pool.query<{ count: number }>(
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
  return rows[0].count <= max
}

export async function clientIp() {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}

export const RATE_LIMITED = "Muitas tentativas. Aguarde alguns minutos e tente novamente."
