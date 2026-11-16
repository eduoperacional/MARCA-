"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, MessageCircle, Save, Send } from "lucide-react"

import { saveWhatsappSettings, testWhatsappNotification } from "@/app/actions/whatsapp"
import { WhatsappPhoneInput } from "@/components/shared/whatsapp-phone-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/hooks/use-server-action"
import { toWhatsappNumber } from "@/lib/whatsapp/templates"

export interface WhatsappCardProps {
  available: boolean
  providerConfigured: boolean
  initial: {
    phone: string | null
    enabled: boolean
    notifyNewBooking: boolean
    notifyCancellation: boolean
    notifyReschedule: boolean
    lastTestAt: string | null
    lastTestStatus: string | null
  }
}

const EVENTS = [
  { key: "notifyNewBooking", label: "Novo agendamento", hint: "Pelo painel ou pela página pública." },
  { key: "notifyCancellation", label: "Cancelamento" },
  { key: "notifyReschedule", label: "Reagendamento", hint: "Quando data, horário ou profissional mudam." },
] as const

export function WhatsappNotificationsCard({ available, providerConfigured, initial }: WhatsappCardProps) {
  const router = useRouter()
  const [values, setValues] = useState({ ...initial, phone: initial.phone ?? "" })
  const save = useServerAction()
  const test = useServerAction()
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
            O envio por WhatsApp está em ativação pelo MARCAÍ. Salve seu número agora: ele passa a receber os avisos
            automaticamente, sem nenhuma ação sua. Até lá, os alertas continuam no sino do painel.
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
            <FieldLabel htmlFor="whatsapp-enabled">Receber notificações no WhatsApp</FieldLabel>
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
      </CardContent>
    </Card>
  )
}
