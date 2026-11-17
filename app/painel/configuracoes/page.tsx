import type { Metadata } from "next"

import { HelpHint } from "@/components/help/help-hint"
import { SettingsForm } from "@/components/settings/settings-form"
import { WhatsappNotificationsCard } from "@/components/settings/whatsapp-notifications-card"
import { getCurrentBusiness } from "@/lib/business"
import { getWhatsappProviderStatus, getWhatsappSettings, listRecentDeliveries } from "@/lib/whatsapp/service"

export const metadata: Metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const business = await getCurrentBusiness()
  const [whatsapp, deliveries] = await Promise.all([getWhatsappSettings(business.id), listRecentDeliveries(business.id)])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <HelpHint topic="hours" label="Como preencher o horário?" />
        <HelpHint topic="rules" label="Como definir as regras?" />
      </div>
      <SettingsForm
        notifications={
          <WhatsappNotificationsCard
            available={whatsapp.available}
            providerConfigured={getWhatsappProviderStatus().configured}
            initial={whatsapp.settings}
            deliveries={deliveries}
          />
        }
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
