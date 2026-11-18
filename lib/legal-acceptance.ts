import "server-only"

import type { Pool } from "pg"

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal"

type Queryable = Pick<Pool, "query">

export async function recordLegalAcceptance(client: Queryable, userId: string, source = "signup") {
  try {
    await client.query(
      `INSERT INTO legal_acceptances (user_id, terms_version, privacy_version, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, terms_version, privacy_version) DO NOTHING`,
      [userId, TERMS_VERSION, PRIVACY_VERSION, source]
    )
    return true
  } catch (error) {
    // Never block an account that was already created; the missing record is visible in logs.
    const code = (error as { code?: string }).code
    console.error("[legal] Falha ao registrar aceite dos documentos", { userId, code })
    return false
  }
}
