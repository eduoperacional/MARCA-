"use client"

import { useState } from "react"
import { Check, Clock, Search, SearchX } from "lucide-react"

import { formatDuration, type PublicService } from "@/components/booking/booking-types"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

const SEARCH_THRESHOLD = 6

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export function ServiceStep({
  services,
  selectedId,
  onSelect,
}: {
  services: PublicService[]
  selectedId: string | null
  onSelect: (service: PublicService) => void
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)

  const categories = [...new Set(services.map((s) => s.category))]
  const q = normalize(query.trim())
  const filtered = services.filter(
    (s) =>
      (!category || s.category === category) &&
      (!q || normalize(s.name).includes(q) || (s.description && normalize(s.description).includes(q)))
  )
  const visibleCategories = categories.filter((c) => filtered.some((s) => s.category === c))

  return (
    <section aria-labelledby="step-service-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="step-service-title" className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          Escolha o serviço
        </h2>
        <p className="text-sm text-muted-foreground">
          {services.length} {services.length === 1 ? "serviço disponível" : "serviços disponíveis"} para agendar online.
        </p>
      </div>

      {(services.length > SEARCH_THRESHOLD || categories.length > 1) && (
        <div className="flex flex-col gap-3">
          {services.length > SEARCH_THRESHOLD && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar serviço"
                aria-label="Buscar serviço"
                className="h-11 rounded-xl pl-10"
              />
            </div>
          )}
          {categories.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por categoria">
              {[null, ...categories].map((c) => {
                const active = category === c
                return (
                  <button
                    key={c ?? "__all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/10 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {c ?? "Todos"}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nenhum serviço encontrado para essa busca.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {visibleCategories.map((c) => (
            <div key={c} className="flex flex-col gap-3">
              {(categories.length > 1 || c !== "Geral") && (
                <h3 className="flex items-center gap-3 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {c}
                  <span aria-hidden="true" className="h-px flex-1 bg-white/[0.06]" />
                </h3>
              )}
              <ul className="grid gap-3 sm:grid-cols-2">
                {filtered
                  .filter((s) => s.category === c)
                  .map((s) => (
                    <li key={s.id}>
                      <ServiceCard service={s} selected={selectedId === s.id} onSelect={() => onSelect(s)} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ServiceCard({ service, selected, onSelect }: { service: PublicService; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex h-full w-full flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
        selected
          ? "border-primary bg-primary/[0.08] shadow-lg shadow-primary/10"
          : "border-white/[0.07] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/60 motion-reduce:hover:translate-y-0"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-medium leading-snug text-pretty">{service.name}</span>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border transition-all",
            selected ? "scale-100 border-primary bg-primary text-primary-foreground" : "border-white/15 text-transparent group-hover:border-primary/50"
          )}
        >
          <Check className="size-3.5" />
        </span>
      </span>
      {service.description && (
        <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{service.description}</span>
      )}
      <span className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {formatDuration(service.durationMin)}
        </span>
        <span className="font-heading text-base font-semibold tabular-nums">{formatCurrency(service.price, true)}</span>
      </span>
    </button>
  )
}
