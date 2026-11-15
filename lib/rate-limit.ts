import "server-only"

import { headers } from "next/headers"

import { consumeRateLimit, type QueryExec } from "@/lib/booking-guard"
import { pool } from "@/lib/db"

export const rateLimitExec: QueryExec = { query: (sql, params) => pool.query(sql, params) }

/** Contador atômico por chave em janela fixa. Retorna true quando a operação é permitida. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  return consumeRateLimit(rateLimitExec, key, max, windowSeconds)
}

export async function clientIp() {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}

export const RATE_LIMITED = "Muitas tentativas. Aguarde alguns minutos e tente novamente."
