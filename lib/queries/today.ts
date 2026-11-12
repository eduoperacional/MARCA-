import "server-only"

import { and, eq } from "drizzle-orm"

import { computeSlots, getWorkWindow, loadBusy } from "@/lib/availability"
import { db } from "@/lib/db"
import { professionals, type BusinessRow } from "@/lib/db/schema"
import { sumPayments } from "@/lib/queries/stats"
import { localParts, timeToMinutes } from "@/lib/time"

/** Duração usada para contar "encaixes" livres no dia. */
export const FREE_SLOT_DURATION_MIN = 30

export interface TodayOperations {
  revenueReceived: number
  freeSlots: number
  /** Hora local (HH:mm) em que os dados foram calculados. */
  now: string
}

export async function getTodayOperations(business: BusinessRow, today: string): Promise<TodayOperations> {
  const team = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.businessId, business.id), eq(professionals.active, true)))

  const [revenueReceived, busy] = await Promise.all([
    sumPayments(business.id, { from: today, to: today }),
    team.length ? loadBusy(business.id, team.map((p) => p.id), today) : Promise.resolve(new Map()),
  ])

  const now = localParts(new Date()).time
  const notBefore = timeToMinutes(now)
  const freeSlots = team.reduce(
    (total, professional) =>
      total +
      computeSlots({
        window: getWorkWindow(business, professional, today),
        busy: busy.get(professional.id) ?? [],
        duration: FREE_SLOT_DURATION_MIN,
        interval: FREE_SLOT_DURATION_MIN,
        notBefore,
      }).length,
    0
  )

  return { revenueReceived, freeSlots, now }
}
