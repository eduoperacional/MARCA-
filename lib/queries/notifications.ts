import "server-only"

import { desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  appointmentId: string | null
  read: boolean
  createdAt: string
}

export async function listNotifications(businessId: string, limit = 20) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.businessId, businessId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
  return rows.map<NotificationItem>((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    appointmentId: n.appointmentId,
    read: Boolean(n.readAt),
    createdAt: n.createdAt.toISOString(),
  }))
}
