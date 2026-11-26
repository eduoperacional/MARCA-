import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { AtSign, CalendarOff, ExternalLink, Globe2, MapPin, Phone, Store } from "lucide-react"

import { BookingFlow } from "@/components/booking/booking-flow"
import { isPublicBookingBlocked } from "@/lib/booking-guard"
import { getBusinessBySlug } from "@/lib/business"
import { db } from "@/lib/db"
import { getSiteUrl } from "@/lib/site-url-server"
import { listProfessionals, listServices } from "@/lib/queries/catalog"
import { todayLocal } from "@/lib/time"

/* eslint-disable @next/next/no-img-element -- Public logos may use a runtime-defined Blob URL host. */

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
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card/40">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
          <div className="flex items-start gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/60">
              {business.logoUrl ? (
                <img src={business.logoUrl} alt={`Logomarca de ${businessName}`} className="size-full object-contain" />
              ) : (
                <Store className="size-7 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-brand-light uppercase">{business.segment ?? "Agendamento online"}</span>
              <h1 className="font-heading text-2xl font-semibold text-balance">{businessName}</h1>
              {business.description && <p className="text-sm leading-relaxed text-muted-foreground">{business.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {business.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden="true" />
                {business.address}
              </span>
            )}
            {business.phone && (
              <a href={`tel:${business.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-1.5 hover:text-foreground">
                <Phone className="size-3.5" aria-hidden="true" />
                {business.phone}
              </a>
            )}
            {business.instagramUrl && (
              <a href={business.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <AtSign className="size-3.5" aria-hidden="true" />
                Instagram
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
            {business.websiteUrl && (
              <a href={business.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <Globe2 className="size-3.5" aria-hidden="true" />
                Site
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {blocked || !business.onlineBookingEnabled || bookable.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
            <CalendarOff className="size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-heading text-lg font-semibold">Agendamento online indisponível</h2>
            <p className="text-sm text-muted-foreground">Entre em contato diretamente com o estabelecimento para marcar seu horário.</p>
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
      <footer className="flex flex-col items-center gap-2 pb-8 text-center text-xs text-muted-foreground">
        <span>Agendamento por MarcAí</span>
        <nav aria-label="Documentos" className="flex gap-4">
          <Link href="/privacidade" className="hover:text-foreground hover:underline">Política de Privacidade</Link>
          <Link href="/termos" className="hover:text-foreground hover:underline">Termos de Uso</Link>
        </nav>
      </footer>
    </div>
  )
}
