import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { SetupComplete, SetupWelcome } from "@/components/onboarding/setup-screens"
import { SetupWizard } from "@/components/onboarding/setup-wizard"
import { getAccess, requireUser } from "@/lib/business"
import { db } from "@/lib/db"
import { MIN_ADVANCE_OPTIONS } from "@/lib/onboarding"
import { firstParam } from "@/lib/period"
import { listProfessionals, listServices } from "@/lib/queries/catalog"
import { SETUP_STEPS } from "@/lib/setup-progress"
import { getSetupState } from "@/lib/setup-state"

export const metadata: Metadata = { title: "Configurar estabelecimento", robots: { index: false } }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-brand-glow flex min-h-svh flex-col items-center gap-8 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <MarcaiMark />
        <MarcaiWordmark />
      </div>
      <main className="w-full max-w-2xl">{children}</main>
    </div>
  )
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser()
  const params = await searchParams
  const createNew = params.novo === "1"
  const etapa = firstParam(params.etapa)
  const mode = firstParam(params.modo) === "manual" ? "manual" : "guided"
  const access = await getAccess()

  if (access && access.role !== "owner" && !createNew) redirect("/painel")

  if (!access || createNew) {
    if (!etapa) {
      return (
        <Shell>
          <SetupWelcome userName={user.name} hasBusiness={false} nextStep={1} />
        </Shell>
      )
    }
    return (
      <Shell>
        <SetupWizard step={1} steps={null} percent={0} business={null} services={[]} professionals={[]} selfProfessionalId={null} createNew mode={mode} />
      </Shell>
    )
  }

  const business = access.business
  const state = await getSetupState(db, business.id)
  if (!state) redirect("/painel")
  const { progress } = state
  const nextStep = progress.nextStep?.step ?? SETUP_STEPS.length

  if (!etapa) {
    if (progress.ready) redirect("/onboarding?etapa=concluido")
    return (
      <Shell>
        <SetupWelcome userName={user.name} hasBusiness nextStep={nextStep} />
      </Shell>
    )
  }

  const [services, professionals] = await Promise.all([listServices(business.id), listProfessionals(business.id)])

  if (etapa === "concluido") {
    if (!progress.ready) redirect(`/onboarding?etapa=${nextStep}`)
    const activeIds = new Set(services.filter((s) => s.active).map((s) => s.id))
    return (
      <Shell>
        <SetupComplete
          summary={{
            name: business.displayName ?? business.name,
            slug: business.slug,
            openDays: business.openingHours.filter((d) => d.active).length,
            services: activeIds.size,
            professionals: professionals.filter((p) => p.active && p.serviceIds.some((id) => activeIds.has(id))).length,
            slotIntervalMin: business.slotIntervalMin,
            minAdvanceLabel: MIN_ADVANCE_OPTIONS.find((o) => o.value === business.minAdvanceMin)?.label ?? `${business.minAdvanceMin} min`,
          }}
        />
      </Shell>
    )
  }

  const step = Math.min(Math.max(Number.parseInt(etapa, 10) || 1, 1), SETUP_STEPS.length)

  return (
    <Shell>
      <SetupWizard
        step={step}
        steps={progress.steps}
        percent={progress.percent}
        createNew={false}
        mode={state.record?.mode ?? "guided"}
        selfProfessionalId={access.professionalId}
        business={{
          name: business.name,
          segment: business.segment ?? "",
          phone: business.phone ?? "",
          address: business.address ?? "",
          city: business.city ?? "",
          state: business.state ?? "",
          displayName: business.displayName ?? "",
          primaryColor: business.primaryColor,
          logoUrl: business.logoUrl,
          description: business.description ?? "",
          slug: business.slug,
          coverUrl: business.coverUrl,
          openingHours: business.openingHours,
          slotIntervalMin: business.slotIntervalMin,
          minAdvanceMin: business.minAdvanceMin,
          onlineBookingEnabled: business.onlineBookingEnabled,
        }}
        services={services.map((s) => ({ id: s.id, name: s.name, category: s.category, price: s.price, durationMin: s.durationMin, active: s.active }))}
        professionals={professionals.map((p) => ({
          id: p.id,
          name: p.name,
          specialties: p.specialties,
          active: p.active,
          serviceIds: p.serviceIds,
          workDays: p.workSchedule.filter((d) => d.active).length,
        }))}
      />
    </Shell>
  )
}
