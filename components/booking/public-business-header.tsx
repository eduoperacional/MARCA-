import { AtSign, ExternalLink, Globe2, MapPin, Phone, Store } from "lucide-react"

import { BUSINESS_SEGMENTS } from "@/lib/onboarding"

/* eslint-disable @next/next/no-img-element -- Public logos and covers may use a runtime-defined Blob URL host. */

export interface PublicBusinessProfile {
  name: string
  segment: string | null
  description: string | null
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  instagramUrl: string | null
  websiteUrl: string | null
  logoUrl: string | null
  coverUrl: string | null
}

function segmentLabel(segment: string | null) {
  if (!segment) return null
  return BUSINESS_SEGMENTS.find((s) => s.value === segment)?.label ?? segment
}

const chipClass =
  "inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm text-foreground/85 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

export function PublicBusinessHeader({ business }: { business: PublicBusinessProfile }) {
  const category = segmentLabel(business.segment)
  const location = [business.city, business.state].filter(Boolean).join(" · ")
  const hasContacts = business.address || business.phone || business.instagramUrl || business.websiteUrl

  return (
    <header className="relative">
      <div className="relative h-36 overflow-hidden sm:h-52 lg:h-60">
        {business.coverUrl ? (
          <>
            <img src={business.coverUrl} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          </>
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-[#100c1d]">
            <div className="absolute -top-24 left-1/4 size-[28rem] rounded-full bg-primary/30 blur-3xl" />
            <div className="absolute -top-10 right-0 size-80 rounded-full bg-brand-light/15 blur-3xl" />
            <div className="landing-grid absolute inset-0 opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}
      </div>

      <div className="relative mx-auto -mt-14 flex max-w-6xl flex-col gap-5 px-4 sm:-mt-16 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl shadow-black/50 ring-4 ring-background sm:size-28">
            {business.logoUrl ? (
              <img src={business.logoUrl} alt={`Logomarca de ${business.name}`} className="size-full object-contain p-1.5" />
            ) : (
              <Store className="size-10 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              {category && (
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-brand-light">{category}</span>
              )}
              {location && <span className="text-xs text-muted-foreground">{location}</span>}
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{business.name}</h1>
            {business.description && (
              <p className="max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">{business.description}</p>
            )}
          </div>
        </div>

        {hasContacts && (
          <ul className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end lg:pb-1" aria-label="Contato e redes sociais">
            {business.address && (
              <li>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={chipClass}
                >
                  <MapPin className="size-4 shrink-0 text-brand-light" aria-hidden="true" />
                  <span className="line-clamp-1">{business.address}</span>
                  <span className="sr-only">(abre o mapa em nova aba)</span>
                </a>
              </li>
            )}
            {business.phone && (
              <li>
                <a href={`tel:${business.phone.replace(/[^+\d]/g, "")}`} className={chipClass}>
                  <Phone className="size-4 text-brand-light" aria-hidden="true" />
                  {business.phone}
                </a>
              </li>
            )}
            {business.instagramUrl && (
              <li>
                <a href={business.instagramUrl} target="_blank" rel="noopener noreferrer" className={chipClass}>
                  <AtSign className="size-4 text-brand-light" aria-hidden="true" />
                  Instagram
                  <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />
                </a>
              </li>
            )}
            {business.websiteUrl && (
              <li>
                <a href={business.websiteUrl} target="_blank" rel="noopener noreferrer" className={chipClass}>
                  <Globe2 className="size-4 text-brand-light" aria-hidden="true" />
                  Site
                  <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />
                </a>
              </li>
            )}
          </ul>
        )}
      </div>
    </header>
  )
}
