import type { Metadata } from "next"

import { HelpHint } from "@/components/help/help-hint"
import { PushNotificationsCard } from "@/components/settings/push-notifications-card"
import { SettingsForm } from "@/components/settings/settings-form"
import { WhatsappNotificationsCard } from "@/components/settings/whatsapp-notifications-card"
import { can, requireAccess } from "@/lib/business"
import { firstParam } from "@/lib/period"
import { getPushOverview } from "@/lib/push/service"
import { getWhatsappProviderStatus, getWhatsappSettings, listRecentDeliveries } from "@/lib/whatsapp/service"

export const metadata: Metadata = { title: "Configurações" }

const TABS = ["estabelecimento", "funcionamento", "online", "notificacoes"] as const

export default async function SettingsPage({ searchParams }: PageProps<"/painel/configuracoes">) {
  const access = await requireAccess()
  const business = access.business
  const tabParam = firstParam((await searchParams).aba)
  const defaultTab = TABS.find((t) => t === tabParam) ?? "estabelecimento"
  const [whatsapp, deliveries, push] = await Promise.all([
    getWhatsappSettings(business.id),
    listRecentDeliveries(business.id),
    getPushOverview(business.id, access.user.id),
  ])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <HelpHint topic="hours" label="Como preencher o horário?" />
        <HelpHint topic="rules" label="Como definir as regras?" />
      </div>
      <SettingsForm
        defaultTab={defaultTab}
        notifications={
          <div className="flex flex-col gap-6">
            <PushNotificationsCard overview={push} canManageBusiness={can(access, "settings.manage")} />
            <WhatsappNotificationsCard
              available={whatsapp.available}
              providerConfigured={getWhatsappProviderStatus().configured}
              initial={whatsapp.settings}
              deliveries={deliveries}
            />
          </div>
        }
        logoUrl={business.logoUrl}
        initial={{
          displayName: business.displayName ?? business.name,
          description: business.description ?? "",
          phone: business.phone ?? "",
          address: business.address ?? "",
          instagram: business.instagramUrl ?? "",
          website: business.websiteUrl ?? "",
          openingHours: business.openingHours,
          slotIntervalMin: business.slotIntervalMin,
          minAdvanceMin: business.minAdvanceMin,
          onlineBookingEnabled: business.onlineBookingEnabled,
        }}
      />
    </div>
  )
}
