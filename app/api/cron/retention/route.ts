import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { pool } from "@/lib/db"
import { formatRetentionSummary, runRetentionCleanup } from "@/lib/retention"

export const maxDuration = 60

/** Limpeza diária de dados técnicos temporários (Vercel Cron, `Authorization: Bearer CRON_SECRET`). */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const summary = await runRetentionCleanup({ query: (sql, params) => pool.query(sql, params) })
  console.info(`[retention-cron] removidos: ${formatRetentionSummary(summary)}`)
  const failed = Object.values(summary).some((r) => r.status === "error")
  return Response.json(summary, { status: failed ? 500 : 200 })
}
