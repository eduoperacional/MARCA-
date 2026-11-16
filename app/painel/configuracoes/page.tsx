import type { Metadata } from "next"

import { HelpHint } from "@/components/help/help-hint"
import { SettingsForm } from "@/components/settings/settings-form"
import { getCurrentBusiness } from "@/lib/business"
import { getMessagingStatus } from "@/lib/automations"

export const metadata: Metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const business = await getCurrentBusiness()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <HelpHint topic="hours" label="Como preencher o horário?" />
        <HelpHint topic="rules" label="Como definir as regras?" />
      </div>
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
    </div>
  )
}
