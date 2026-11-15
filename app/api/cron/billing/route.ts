import { db } from "@/lib/db"
import { runBillingMaintenance } from "@/lib/billing/subscriptions"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const updated = await runBillingMaintenance(db)
  return Response.json({ updated })
}
