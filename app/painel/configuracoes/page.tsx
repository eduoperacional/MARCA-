import type { Metadata } from "next"

import { SettingsForm } from "@/components/settings/settings-form"
import { getCurrentBusiness } from "@/lib/business"
import { getMessagingStatus } from "@/lib/automations"

export const metadata: Metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const business = await getCurrentBusiness()
  return (
    <SettingsForm
      messaging={getMessagingStatus()}
      initial={{
        name: business.name,
        phone: business.phone ?? "",
        address: business.address ?? "",
        openingHours: business.openingHours,
        slotIntervalMin: business.slotIntervalMin,
        minAdvanceMin: business.minAdvanceMin,
        onlineBookingEnabled: business.onlineBookingEnabled,
      }}
    />
  )
}
