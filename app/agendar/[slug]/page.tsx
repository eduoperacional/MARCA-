import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CalendarOff, MapPin, Phone } from "lucide-react"

import { BookingFlow } from "@/components/booking/booking-flow"
import { getBusinessBySlug } from "@/lib/business"
import { listProfessionals, listServices } from "@/lib/queries/catalog"
import { todayLocal } from "@/lib/time"

export async function generateMetadata({ params }: PageProps<"/agendar/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const business = await getBusinessBySlug(slug)
  if (!business) return { title: "Página não encontrada" }
  return {
    title: { absolute: `Agendar horário · ${business.name}` },
    description: `Agende seu horário online em ${business.name}.`,
  }
}

export default async function PublicBookingPage({ params }: PageProps<"/agendar/[slug]">) {
  const { slug } = await params
  const business = await getBusinessBySlug(slug)
  if (!business) notFound()

  const [services, professionals] = await Promise.all([listServices(business.id), listProfessionals(business.id)])
  const activeProfessionals = professionals.filter((p) => p.active)
  const activeIds = new Set(activeProfessionals.map((p) => p.id))
  const bookable = services
    .filter((s) => s.active)
    .map((s) => ({ ...s, professionalIds: s.professionalIds.filter((id) => activeIds.has(id)) }))
    .filter((s) => s.professionalIds.length > 0)

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card/40">
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-4 py-6">
          <span className="text-xs font-medium tracking-wide text-brand-light uppercase">{business.segment ?? "Agendamento online"}</span>
          <h1 className="font-heading text-2xl font-semibold text-balance">{business.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {business.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" />
                {business.address}
              </span>
            )}
            {business.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden="true" />
                {business.phone}
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {!business.onlineBookingEnabled || bookable.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
            <CalendarOff className="size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-heading text-lg font-semibold">Agendamento online indisponível</h2>
            <p className="text-sm text-muted-foreground">Entre em contato diretamente com o estabelecimento para marcar seu horário.</p>
          </div>
        ) : (
          <BookingFlow
            slug={business.slug}
            today={todayLocal()}
            openWeekdays={business.openingHours.filter((d) => d.active).map((d) => d.weekday)}
            services={bookable.map((s) => ({
              id: s.id,
              name: s.name,
              category: s.category,
              description: s.description,
              price: s.price,
              durationMin: s.durationMin,
              professionalIds: s.professionalIds,
            }))}
            professionals={activeProfessionals.map((p) => ({
              id: p.id,
              name: p.name,
              specialties: p.specialties,
              photoUrl: p.photoUrl,
              color: p.color,
              workdays: p.workSchedule.filter((d) => d.active).map((d) => d.weekday),
            }))}
          />
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-muted-foreground">Agendamento por MarcAí</footer>
    </div>
  )
}
