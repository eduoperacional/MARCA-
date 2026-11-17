"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, MessageCircle, RotateCw, Save, Send } from "lucide-react"

import { retryWhatsappDeliveryAction, saveWhatsappSettings, testWhatsappNotification } from "@/app/actions/whatsapp"
import { WhatsappPhoneInput } from "@/components/shared/whatsapp-phone-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/hooks/use-server-action"
import { toWhatsappNumber } from "@/lib/whatsapp/templates"
import type { DeliveryListItem, WhatsappSettings } from "@/lib/whatsapp/service"

export interface WhatsappCardProps {
  available: boolean
  providerConfigured: boolean
  initial: WhatsappSettings
  deliveries: DeliveryListItem[]
}

const EVENT_LABEL: Record<string, string> = {
  new_booking: "Novo agendamento",
  cancellation: "Cancelamento",
  reschedule: "Reagendamento",
  test: "Teste",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  processing: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Não enviada",
}

const formatDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

const EVENTS = [
  { key: "notifyNewBooking", label: "Novo agendamento", hint: "Pelo painel ou pela página pública." },
  { key: "notifyCancellation", label: "Cancelamento" },
  { key: "notifyReschedule", label: "Reagendamento", hint: "Quando data, horário ou profissional mudam." },
] as const

export function WhatsappNotificationsCard({ available, providerConfigured, initial, deliveries }: WhatsappCardProps) {
  const router = useRouter()
  const [values, setValues] = useState({
    phone: initial.phone ?? "",
    enabled: initial.enabled,
    notifyNewBooking: initial.notifyNewBooking,
    notifyCancellation: initial.notifyCancellation,
    notifyReschedule: initial.notifyReschedule,
  })
  const save = useServerAction()
  const test = useServerAction()
  const retry = useServerAction()
  const phoneValid = toWhatsappNumber(values.phone) !== null
  const savedPhone = toWhatsappNumber(initial.phone)
  const dirty = toWhatsappNumber(values.phone) !== savedPhone

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Notificações no WhatsApp</CardTitle>
          {!savedPhone ? (
            <Badge variant="secondary">Número não configurado</Badge>
          ) : !initial.enabled ? (
            <Badge variant="secondary">Desativadas</Badge>
          ) : providerConfigured ? (
            <Badge className="bg-success/15 text-success">Ativas</Badge>
          ) : (
            <Badge className="bg-warning/15 text-warning">Aguardando ativação do envio</Badge>
          )}
        </div>
        <CardDescription className="leading-relaxed">
          Informe o número que vai receber os avisos. Funciona com WhatsApp comum ou Business, sem conectar conta,
          escanear QR Code ou instalar nada. As mensagens são enviadas pelo número oficial do MARCAÍ.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!available && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm leading-relaxed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            A configuração de WhatsApp ainda não está disponível neste ambiente. Ela será liberada após a atualização do banco de dados.
          </p>
        )}
        {available && !providerConfigured && (
          <p role="status" className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
            <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            O envio por WhatsApp está em ativação pelo MARCAÍ. Você já pode salvar seu número e suas preferências; os
            avisos começam a chegar quando o envio for liberado. Até lá, os alertas continuam no sino do painel.
          </p>
        )}

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="whatsapp-phone">WhatsApp para receber notificações</FieldLabel>
            <WhatsappPhoneInput
              id="whatsapp-phone"
              value={values.phone}
              onChange={(v) => set("phone", v)}
              aria-describedby="whatsapp-phone-hint"
              aria-invalid={values.phone.length > 0 && !phoneValid}
            />
            <FieldDescription id="whatsapp-phone-hint">
              {values.phone.length > 0 && !phoneValid
                ? "Número incompleto. Informe DDD e número."
                : "Com DDD. Ex.: (11) 98888-7777"}
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Switch id="whatsapp-enabled" checked={values.enabled} onCheckedChange={(c) => set("enabled", c)} />
            <FieldContent>
              <FieldLabel htmlFor="whatsapp-enabled">Receber notificações no WhatsApp</FieldLabel>
              <FieldDescription>
                Ao ativar, você autoriza o MARCAÍ a enviar avisos de agendamento para este número. Desative quando
                quiser para parar de receber.
              </FieldDescription>
            </FieldContent>
          </Field>

          <FieldSeparator />

          {EVENTS.map((e) => (
            <Field key={e.key} orientation="horizontal" data-disabled={!values.enabled || undefined}>
              <Switch
                id={`whatsapp-${e.key}`}
                checked={values[e.key]}
                disabled={!values.enabled}
                onCheckedChange={(c) => set(e.key, c)}
              />
              <FieldContent>
                <FieldLabel htmlFor={`whatsapp-${e.key}`}>{e.label}</FieldLabel>
                {"hint" in e && <FieldDescription>{e.hint}</FieldDescription>}
              </FieldContent>
            </Field>
          ))}
        </FieldGroup>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={save.pending || !available}
            onClick={() => save.run(() => saveWhatsappSettings(values), "Notificações salvas", () => router.refresh())}
          >
            {save.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Salvar notificações
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={test.pending || !available || !phoneValid || dirty}
            onClick={() =>
              test.run(() => testWhatsappNotification(values.phone), "Mensagem de teste enviada. Confira seu WhatsApp.", () => router.refresh())
            }
          >
            {test.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            Enviar teste
          </Button>
          {dirty && phoneValid && <span className="text-xs text-muted-foreground">Salve o número antes de testar.</span>}
        </div>

        {initial.lastTestAt && (
          <p className="text-xs text-muted-foreground">
            Último teste em {new Date(initial.lastTestAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}:{" "}
            {initial.lastTestStatus === "sent" ? "enviado" : initial.lastTestStatus === "not_configured" ? "envio ainda não ativado" : "falhou"}
          </p>
        )}

        {deliveries.length > 0 && (
          <section aria-labelledby="whatsapp-history" className="flex flex-col gap-2">
            <h3 id="whatsapp-history" className="text-sm font-medium">Últimos envios</h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {deliveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span>{EVENT_LABEL[d.event] ?? d.event}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(d.sentAt ?? d.createdAt)} · {d.attempts} {d.attempts === 1 ? "tentativa" : "tentativas"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={d.status === "sent" ? "default" : "secondary"}
                      className={d.status === "failed" ? "bg-destructive/15 text-destructive" : undefined}
                    >
                      {STATUS_LABEL[d.status] ?? d.status}
                    </Badge>
                    {d.status === "failed" && d.event !== "test" && providerConfigured && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retry.pending}
                        onClick={() => retry.run(() => retryWhatsappDeliveryAction(d.id), "Reenvio agendado", () => router.refresh())}
                      >
                        <RotateCw data-icon="inline-start" />
                        Reenviar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
