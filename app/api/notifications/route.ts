import { NextResponse } from "next/server"

import { getCurrentBusiness } from "@/lib/business"
import { listNotifications } from "@/lib/queries/notifications"

export async function GET() {
  const business = await getCurrentBusiness()
  const notifications = await listNotifications(business.id, 15)
  return NextResponse.json({ notifications }, { headers: { "Cache-Control": "no-store" } })
}
