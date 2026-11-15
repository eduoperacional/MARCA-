import { db } from "@/lib/db"
import * as asaas from "@/lib/billing/asaas"
import { runBillingMaintenance } from "@/lib/billing/subscriptions"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runBillingMaintenance(db, new Date(), asaas.isAsaasConfigured() ? asaas : undefined)
  return Response.json(result)
}
