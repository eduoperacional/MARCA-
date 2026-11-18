"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Globe, Settings } from "lucide-react"

import { BookingLinkCard } from "@/components/booking/booking-link-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/format"
import { dateFromLocal } from "@/lib/time"
import type { Appointment } from "@/lib/types"

export function BookingPageAdmin({
  slug,
  siteUrl,
  canEdit,
  businessName,
  settings,
  onlineLast30,
  recent,
}: {
  slug: string
  siteUrl: string
  canEdit: boolean
  businessName: string
  settings: { onlineBookingEnabled: boolean; minAdvanceMin: number; slotIntervalMin: number }
  onlineLast30: number
  recent: Appointment[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Página de agendamento</h1>
        <p className="text-sm text-muted-foreground">Compartilhe o link para seus clientes marcarem horário sozinhos, 24h por dia.</p>
      </div>

      <BookingLinkCard
        slug={slug}
        siteUrl={siteUrl}
        businessName={businessName}
        onlineBookingEnabled={settings.onlineBookingEnabled}
        canEdit={canEdit}
      />

      <Card>
        <CardHeader>
          <CardTitle>Desempenho e regras</CardTitle>
          <CardDescription>Os horários exibidos respeitam a jornada dos profissionais, bloqueios e agendamentos existentes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Agendamentos online (30 dias)</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums">{onlineLast30}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Intervalo entre horários</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums">{settings.slotIntervalMin} min</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Antecedência mínima</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums">
                {settings.minAdvanceMin >= 60 ? `${Math.round(settings.minAdvanceMin / 60)} h` : `${settings.minAdvanceMin} min`}
              </dd>
            </div>
          </dl>
          <Button variant="ghost" size="sm" className="self-start" render={<Link href="/painel/configuracoes" />} nativeButton={false}>
            <Settings data-icon="inline-start" />
            Ajustar regras e horário de funcionamento
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos agendamentos pela página</CardTitle>
          <CardDescription>Cada novo agendamento online gera uma notificação no painel.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Globe className="size-6" aria-hidden="true" />
              Nenhum agendamento online recente. Compartilhe seu link para começar.
            </div>
          ) : (
            <ul className="flex flex-col divide-y">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{a.clientName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.service.name} · {a.professional.name}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {format(dateFromLocal(a.date), "dd/MM", { locale: ptBR })} {a.start}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(a.price, true)}</span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
