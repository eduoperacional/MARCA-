import { eq } from "drizzle-orm"
import type { Metadata } from "next"

import { AccountSettings } from "@/components/account/account-settings"
import { requireUser } from "@/lib/business"
import { db } from "@/lib/db"
import { userPreferences, users } from "@/lib/db/schema"
import { isEmailConfigured } from "@/lib/email"

export const metadata: Metadata = { title: "Minha conta" }

export default async function AccountPage() {
  const user = await requireUser()
  const [[profile], [prefs]] = await Promise.all([
    db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Minha conta</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">Seus dados pessoais, segurança e preferências.</p>
      </div>
      <AccountSettings
        profile={{ name: profile?.name ?? "", email: profile?.email ?? "", phone: profile?.phone ?? "" }}
        preferences={{
          notifyNewBooking: prefs?.notifyNewBooking ?? true,
          notifyCancellation: prefs?.notifyCancellation ?? true,
          weeklySummary: prefs?.weeklySummary ?? false,
        }}
        emailEnabled={isEmailConfigured()}
      />
    </div>
  )
}
