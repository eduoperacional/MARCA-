import { Check, Sparkles, Users } from "lucide-react"

import type { PublicProfessional } from "@/components/booking/booking-types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/lib/format"
import { cn } from "@/lib/utils"

export function ProfessionalStep({
  professionals,
  selectedId,
  onSelect,
}: {
  professionals: PublicProfessional[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <section aria-labelledby="step-professional-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="step-professional-title" className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          Com quem você prefere?
        </h2>
        <p className="text-sm text-muted-foreground">Escolha um profissional ou deixe a agenda encontrar o melhor horário.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <ProfessionalOption
            selected={selectedId === null}
            onClick={() => onSelect(null)}
            title="Qualquer profissional"
            subtitle="Mostra mais horários disponíveis"
            badge="Recomendado"
            avatar={
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-brand-light">
                <Users className="size-5" aria-hidden="true" />
              </span>
            }
          />
        </li>
        {professionals.map((p) => (
          <li key={p.id}>
            <ProfessionalOption
              selected={selectedId === p.id}
              onClick={() => onSelect(p.id)}
              title={p.name}
              subtitle={p.specialties ?? ""}
              avatar={
                <Avatar className="size-12">
                  {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                  <AvatarFallback style={{ backgroundColor: `color-mix(in oklch, ${p.color} 30%, var(--card))` }}>
                    {getInitials(p.name)}
                  </AvatarFallback>
                </Avatar>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProfessionalOption({
  selected,
  onClick,
  title,
  subtitle,
  avatar,
  badge,
}: {
  selected: boolean
  onClick: () => void
  title: string
  subtitle: string
  avatar: React.ReactNode
  badge?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/[0.08] shadow-lg shadow-primary/10" : "border-white/[0.07] hover:border-primary/40 hover:bg-accent/60"
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {badge && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-brand-light">
              <Sparkles className="size-3" aria-hidden="true" />
              {badge}
            </span>
          )}
        </span>
        {subtitle && <span className="truncate text-sm text-muted-foreground">{subtitle}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition-all",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-transparent group-hover:border-primary/50"
        )}
      >
        <Check className="size-3.5" />
      </span>
    </button>
  )
}
