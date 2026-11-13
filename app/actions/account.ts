"use server"

import { revalidatePath } from "next/cache"

import { fail } from "@/lib/actions/result"
import { getSession } from "@/lib/business"
import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"

export interface PreferencesInput {
  notifyNewBooking: boolean
  notifyCancellation: boolean
  weeklySummary: boolean
}

export async function savePreferences(input: PreferencesInput) {
  const session = await getSession()
  if (!session?.user) return fail("Sessão expirada. Entre novamente.")
  const values = {
    notifyNewBooking: Boolean(input.notifyNewBooking),
    notifyCancellation: Boolean(input.notifyCancellation),
    weeklySummary: Boolean(input.weeklySummary),
    updatedAt: new Date(),
  }
  await db
    .insert(userPreferences)
    .values({ userId: session.user.id, ...values })
    .onConflictDoUpdate({ target: userPreferences.userId, set: values })
  revalidatePath("/painel/minha-conta")
  return { ok: true as const }
}
