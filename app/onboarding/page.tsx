import { and, asc, desc, eq, isNull } from "drizzle-orm"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { listMemberships, requireUser } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses, services } from "@/lib/db/schema"

export const metadata: Metadata = { title: "Configurar estabelecimento", robots: { index: false } }

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser()
  const params = await searchParams
  const creatingNew = params.novo === "1"

  const [draft] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.ownerUserId, user.id), isNull(businesses.onboardingCompletedAt)))
    .orderBy(desc(businesses.createdAt))
    .limit(1)

  if (!draft && !creatingNew) {
    const memberships = await listMemberships(user.id)
    if (memberships.length > 0) redirect("/painel")
  }

  const draftServices = draft
    ? await db
        .select({ id: services.id, name: services.name })
        .from(services)
        .where(eq(services.businessId, draft.id))
        .orderBy(asc(services.name))
    : []

  return (
    <div className="bg-brand-glow flex min-h-svh flex-col items-center gap-8 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <MarcaiMark />
        <MarcaiWordmark />
      </div>
      <main className="w-full max-w-2xl">
        <OnboardingWizard
          userName={user.name}
          draft={
            draft
              ? {
                  step: draft.onboardingStep,
                  name: draft.name,
                  segment: draft.segment ?? "",
                  phone: draft.phone ?? "",
                  address: draft.address ?? "",
                  city: draft.city ?? "",
                  state: draft.state ?? "",
                  displayName: draft.displayName ?? draft.name,
                  description: draft.description ?? "",
                  slug: draft.slug,
                  primaryColor: draft.primaryColor,
                  logoUrl: draft.logoUrl,
                  coverUrl: draft.coverUrl,
                  openingHours: draft.openingHours,
                  slotIntervalMin: draft.slotIntervalMin,
                  minAdvanceMin: draft.minAdvanceMin,
                  onlineBookingEnabled: draft.onlineBookingEnabled,
                }
              : null
          }
          services={draftServices}
        />
      </main>
    </div>
  )
}
