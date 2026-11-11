"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Check, Copy, ExternalLink, Globe, MessageCircle, Settings } from "lucide-react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/shared/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/format"
import { dateFromLocal } from "@/lib/time"
import type { Appointment } from "@/lib/types"

export function BookingPageAdmin({
  slug,
  businessName,
  settings,
  onlineLast30,
  recent,
}: {
  slug: string
  businessName: string
  settings: { onlineBookingEnabled: boolean; minAdvanceMin: number; slotIntervalMin: number }
  onlineLast30: number
  recent: Appointment[]
}) {
  const path = `/agendar/${slug}`
  const [url, setUrl] = useState(path)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`)
  }, [path])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Link copiado")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`Agende seu horário em ${businessName}: ${url}`)}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Página de agendamento</h1>
        <p className="text-sm text-muted-foreground">Compartilhe o link para seus clientes marcarem horário sozinhos, 24h por dia.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Seu link público</CardTitle>
            {settings.onlineBookingEnabled ? (
              <Badge className="bg-success/15 text-success">Ativa</Badge>
            ) : (
              <Badge variant="secondary">Desativada</Badge>
            )}
          </div>
          <CardDescription>Os horários exibidos respeitam a jornada dos profissionais, bloqueios e agendamentos existentes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} aria-label="Link da página de agendamento" className="font-mono text-sm" onFocus={(e) => e.target.select()} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={copy}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                Copiar
              </Button>
              <Button variant="outline" render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />}>
                <MessageCircle data-icon="inline-start" />
                WhatsApp
              </Button>
              <Button render={<a href={path} target="_blank" rel="noopener noreferrer" />}>
                <ExternalLink data-icon="inline-start" />
                Abrir
              </Button>
            </div>
          </div>
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
          <Button variant="ghost" size="sm" className="self-start" render={<Link href="/configuracoes" />}>
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
