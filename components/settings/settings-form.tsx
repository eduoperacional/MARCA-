"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle, Save } from "lucide-react"

import { updateBusinessSettings } from "@/app/actions/operations"
import { ScheduleEditor } from "@/components/shared/schedule-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/hooks/use-server-action"
import type { DaySchedule } from "@/lib/types"

const INTERVALS = [10, 15, 20, 30, 60].map((v) => ({ value: String(v), label: `${v} minutos` }))
const ADVANCE = [
  { value: "0", label: "Sem antecedência" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "1440", label: "1 dia" },
]

interface SettingsValues {
  name: string
  phone: string
  address: string
  openingHours: DaySchedule[]
  slotIntervalMin: number
  minAdvanceMin: number
  onlineBookingEnabled: boolean
}

export function SettingsForm({
  initial,
  messaging,
}: {
  initial: SettingsValues
  messaging: { connected: boolean; providerName: string | null }
}) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const { pending, run } = useServerAction()

  function set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => updateBusinessSettings(values), "Configurações salvas", () => router.refresh())
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Dados do estabelecimento, horário de funcionamento e regras de agendamento.</p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          Salvar alterações
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Estabelecimento</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="business-name">Nome</FieldLabel>
                  <Input id="business-name" value={values.name} onChange={(e) => set("name", e.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="business-phone">Telefone / WhatsApp</FieldLabel>
                  <Input id="business-phone" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="business-address">Endereço</FieldLabel>
                  <Input id="business-address" value={values.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agendamento online</CardTitle>
              <CardDescription>Regras aplicadas à página pública de agendamento.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Switch
                    id="online-enabled"
                    checked={values.onlineBookingEnabled}
                    onCheckedChange={(checked) => set("onlineBookingEnabled", checked)}
                  />
                  <FieldLabel htmlFor="online-enabled">Aceitar agendamentos pela página pública</FieldLabel>
                </Field>
                <Field>
                  <FieldLabel htmlFor="slot-interval">Intervalo entre horários</FieldLabel>
                  <Select
                    items={INTERVALS}
                    value={String(values.slotIntervalMin)}
                    onValueChange={(v) => v && set("slotIntervalMin", Number(v))}
                  >
                    <SelectTrigger id="slot-interval" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="min-advance">Antecedência mínima</FieldLabel>
                  <Select
                    items={ADVANCE}
                    value={String(values.minAdvanceMin)}
                    onValueChange={(v) => v !== null && set("minAdvanceMin", Number(v))}
                  >
                    <SelectTrigger id="min-advance" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADVANCE.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Clientes não verão horários que começam antes desse prazo.</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Mensagens automáticas</CardTitle>
                {messaging.connected ? (
                  <Badge className="bg-success/15 text-success">{messaging.providerName}</Badge>
                ) : (
                  <Badge variant="secondary">Não conectado</Badge>
                )}
              </div>
              <CardDescription>
                Confirmações e lembretes por WhatsApp ficam prontos para ativar assim que um provedor de mensagens for conectado.
                Enquanto isso, a equipe recebe notificações internas no painel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageCircle className="size-4" aria-hidden="true" />
                Novo agendamento, cancelamento e reagendamento geram alertas no sino de notificações.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Horário de funcionamento</CardTitle>
            <CardDescription>A agenda e a página pública só oferecem horários dentro deste período.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleEditor idPrefix="business-hours" value={values.openingHours} onChange={(next) => set("openingHours", next)} />
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
