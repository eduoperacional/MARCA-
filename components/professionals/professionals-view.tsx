"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDays, Mail, Pencil, Phone, UserPlus } from "lucide-react"

import { setProfessionalActive } from "@/app/actions/catalog"
import { PageHeader } from "@/components/layout/page-header"
import { ProfessionalSheet } from "@/components/professionals/professional-sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/hooks/use-server-action"
import { useUrlParams } from "@/hooks/use-url-params"
import { formatCurrency, getInitials } from "@/lib/format"
import type { ProfessionalItem, ServiceItem } from "@/lib/queries/catalog"
import { WEEKDAY_SHORT } from "@/lib/time"
import { cn } from "@/lib/utils"

export function ProfessionalsView({
  professionals,
  services,
  monthStats,
  openCreate,
}: {
  professionals: ProfessionalItem[]
  services: ServiceItem[]
  monthStats: Record<string, { count: number; revenue: number }>
  openCreate: boolean
}) {
  const [editing, setEditing] = useState<ProfessionalItem | null | "new">(openCreate ? "new" : null)
  const { setParams } = useUrlParams()
  const serviceNames = new Map(services.map((s) => [s.id, s.name]))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Profissionais"
        description="Equipe, jornadas de trabalho e serviços que cada um realiza."
        actions={
          <Button onClick={() => setEditing("new")}>
            <UserPlus data-icon="inline-start" />
            Novo profissional
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {professionals.map((p) => (
          <ProfessionalCard
            key={p.id}
            professional={p}
            serviceNames={p.serviceIds.map((id) => serviceNames.get(id)).filter(Boolean) as string[]}
            stats={monthStats[p.id]}
            onEdit={() => setEditing(p)}
          />
        ))}
      </div>

      <ProfessionalSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            if (openCreate) setParams({ novo: null }, { replace: true })
          }
        }}
        professional={editing === "new" ? null : editing}
        services={services}
      />
    </div>
  )
}

function ProfessionalCard({
  professional: p,
  serviceNames,
  stats,
  onEdit,
}: {
  professional: ProfessionalItem
  serviceNames: string[]
  stats?: { count: number; revenue: number }
  onEdit: () => void
}) {
  const { pending, run } = useServerAction()
  const workDays = p.workSchedule.filter((d) => d.active).map((d) => d.weekday)
  const ordered = [1, 2, 3, 4, 5, 6, 0]

  return (
    <Card className={cn("gap-4", !p.active && "opacity-60")}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-12 ring-2 ring-offset-2 ring-offset-card" style={{ ["--tw-ring-color" as string]: p.color }}>
            {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
            <AvatarFallback className="text-sm font-medium" style={{ backgroundColor: `color-mix(in oklch, ${p.color} 25%, var(--card))` }}>
              {getInitials(p.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-heading text-base font-semibold">{p.name}</span>
            <span className="truncate text-sm text-muted-foreground">{p.specialties || "Sem especialidades"}</span>
          </div>
          <Switch
            checked={p.active}
            disabled={pending}
            aria-label={p.active ? `Desativar ${p.name}` : `Ativar ${p.name}`}
            onCheckedChange={(active) => run(() => setProfessionalActive(p.id, active), active ? "Profissional ativado." : "Profissional desativado.")}
          />
        </div>

        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {p.phone && (
            <span className="flex items-center gap-2">
              <Phone className="size-3.5" aria-hidden="true" /> {p.phone}
            </span>
          )}
          {p.email && (
            <span className="flex items-center gap-2 truncate">
              <Mail className="size-3.5" aria-hidden="true" /> {p.email}
            </span>
          )}
        </div>

        <div className="flex gap-1" aria-label="Dias de trabalho">
          {ordered.map((d) => (
            <span
              key={d}
              className={cn(
                "flex h-6 flex-1 items-center justify-center rounded text-[11px]",
                workDays.includes(d) ? "bg-primary/15 font-medium text-brand-light" : "bg-muted text-muted-foreground/60"
              )}
            >
              {WEEKDAY_SHORT[d]}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {serviceNames.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nenhum serviço habilitado</span>
          ) : (
            serviceNames.slice(0, 4).map((name) => (
              <Badge key={name} variant="secondary" className="text-[11px]">
                {name}
              </Badge>
            ))
          )}
          {serviceNames.length > 4 && (
            <Badge variant="outline" className="text-[11px]">
              +{serviceNames.length - 4}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Atendimentos no mês</span>
            <span className="font-semibold tabular-nums">{stats?.count ?? 0}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Faturamento no mês</span>
            <span className="font-semibold tabular-nums">{formatCurrency(stats?.revenue ?? 0)}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          <Pencil data-icon="inline-start" />
          Editar
        </Button>
        <Button variant="ghost" size="sm" className="flex-1" render={<Link href={`/agenda?professional=${p.id}`} />} nativeButton={false}>
          <CalendarDays data-icon="inline-start" />
          Ver agenda
        </Button>
      </CardFooter>
    </Card>
  )
}
