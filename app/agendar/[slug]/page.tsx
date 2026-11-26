import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { CalendarOff, Phone } from "lucide-react"

import { BookingFlow } from "@/components/booking/booking-flow"
import { PublicBusinessHeader } from "@/components/booking/public-business-header"
import { isPublicBookingBlocked } from "@/lib/booking-guard"
import { getBusinessBySlug } from "@/lib/business"
import { db } from "@/lib/db"
import { getSiteUrl } from "@/lib/site-url-server"
import { listProfessionals, listServices } from "@/lib/queries/catalog"
import { todayLocal } from "@/lib/time"


export async function generateMetadata({ params }: PageProps<"/agendar/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const business = await getBusinessBySlug(slug)
  if (!business) return { title: "Página não encontrada" }

  const businessName = business.displayName || business.name
  const profileDetails = [business.description?.trim(), business.address, business.phone].filter(Boolean).join(" · ")
  const description = profileDetails.slice(0, 300) || `Agende seu horário online em ${businessName}.`
  const siteUrl = await getSiteUrl()
  const publicUrl = new URL(`/agendar/${business.slug}`, siteUrl).toString()
  const image = business.logoUrl ? [{ url: business.logoUrl, alt: `Logomarca de ${businessName}` }] : undefined

  return {
    metadataBase: new URL(siteUrl),
    title: { absolute: `Agendar horário · ${businessName}` },
    description,
    alternates: { canonical: publicUrl },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: businessName,
      url: publicUrl,
      title: businessName,
      description,
      ...(image ? { images: image } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: businessName,
      description,
      ...(image ? { images: image.map((item) => item.url) } : {}),
    },
  }
}

export default async function PublicBookingPage({ params }: PageProps<"/agendar/[slug]">) {
  const { slug } = await params
  const business = await getBusinessBySlug(slug)
  if (!business) notFound()
  if (business.slug !== slug) permanentRedirect(`/agendar/${business.slug}`)

  const [services, professionals, blocked] = await Promise.all([
    listServices(business.id),
    listProfessionals(business.id),
    isPublicBookingBlocked(db, business),
  ])
  const businessName = business.displayName || business.name
  const activeProfessionals = professionals.filter((p) => p.active)
  const activeIds = new Set(activeProfessionals.map((p) => p.id))
  const bookable = services
    .filter((s) => s.active)
    .map((s) => ({ ...s, professionalIds: s.professionalIds.filter((id) => activeIds.has(id)) }))
    .filter((s) => s.professionalIds.length > 0)

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicBusinessHeader
        business={{
          name: businessName,
          segment: business.segment,
          description: business.description,
          address: business.address,
          city: business.city,
          state: business.state,
          phone: business.phone,
          instagramUrl: business.instagramUrl,
          websiteUrl: business.websiteUrl,
          logoUrl: business.logoUrl,
          coverUrl: business.coverUrl,
        }}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {blocked || !business.onlineBookingEnabled || bookable.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-white/[0.07] bg-card p-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-white/[0.05]">
              <CalendarOff className="size-7 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-heading text-xl font-semibold">Agendamento online indisponível</h2>
              <p className="text-sm text-pretty text-muted-foreground">
                Entre em contato diretamente com o estabelecimento para marcar seu horário.
              </p>
            </div>
            {business.phone && (
              <a
                href={`tel:${business.phone.replace(/[^+\d]/g, "")}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Phone className="size-4" aria-hidden="true" />
                Ligar para {business.phone}
              </a>
            )}
          </div>
        ) : (
          <BookingFlow
            slug={business.slug}
            businessName={businessName}
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
      <footer className="flex flex-col items-center gap-2 border-t border-white/[0.05] px-4 pt-6 pb-32 text-center text-xs text-muted-foreground lg:pb-8">
        <span>
          Agendamento por <span className="font-medium text-foreground/80">MarcAí</span>
        </span>
        <nav aria-label="Documentos" className="flex gap-4">
          <Link href="/privacidade" className="hover:text-foreground hover:underline">Política de Privacidade</Link>
          <Link href="/termos" className="hover:text-foreground hover:underline">Termos de Uso</Link>
        </nav>
      </footer>
    </div>
  )
}
