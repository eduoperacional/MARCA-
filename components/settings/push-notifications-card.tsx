"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  BellOff,
  BellRing,
  CheckCircle2,
  Loader2,
  Save,
  Send,
  Share,
  Smartphone,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { saveReminderSettings, savePushPreferences, sendPushTestAction } from "@/app/actions/push"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/hooks/use-server-action"
import {
  disablePush,
  enablePush,
  getDeviceStatus,
  getPermission,
  getPushSupport,
  type PermissionState,
  type PushSupport,
} from "@/lib/push/client"
import type { PushPreferences } from "@/lib/push/queue"
import type { PushOverview } from "@/lib/push/service"
import { cn } from "@/lib/utils"

const LEAD_OPTIONS = [
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "240", label: "4 horas antes" },
  { value: "1440", label: "1 dia antes" },
]

const EVENTS: { key: keyof PushPreferences; label: string; hint: string }[] = [
  { key: "notifyNewBooking", label: "Novo agendamento", hint: "Pelo painel ou pela página pública." },
  { key: "notifyCancellation", label: "Cancelamento", hint: "Quando um horário é desmarcado." },
  { key: "notifyReschedule", label: "Reagendamento", hint: "Quando data, horário ou profissional mudam." },
  { key: "notifyReminder", label: "Lembrete de atendimento", hint: "Antes do início, conforme a regra do estabelecimento." },
]

const EVENT_LABEL: Record<string, string> = {
  new_booking: "Novo agendamento",
  cancellation: "Cancelamento",
  reschedule: "Reagendamento",
  reminder: "Lembrete",
  test: "Teste",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  processing: "Enviando",
  sent: "Entregue",
  failed: "Falhou",
  skipped: "Não enviada",
}

type DeviceStatus = "loading" | "subscribed" | "not_subscribed" | "out_of_sync"

interface ClientState {
  support: PushSupport
  permission: PermissionState
  device: DeviceStatus
}

export function PushNotificationsCard({ overview, canManageBusiness }: { overview: PushOverview; canManageBusiness: boolean }) {
  const router = useRouter()
  const [prefs, setPrefs] = useState(overview.preferences)
  const [reminders, setReminders] = useState(overview.business)
  const [client, setClient] = useState<ClientState | null>(null)
  const [deviceBusy, setDeviceBusy] = useState(false)
  const savePrefs = useServerAction()
  const saveReminders = useServerAction()
  const test = useServerAction()

  const refreshClient = useCallback(async () => {
    const support = getPushSupport()
    const permission = getPermission()
    if (support !== "supported" || permission !== "granted") {
      setClient({ support, permission, device: "not_subscribed" })
      return
    }
    setClient({ support, permission, device: "loading" })
    setClient({ support, permission, device: await getDeviceStatus() })
  }, [])

  useEffect(() => {
    void refreshClient()
  }, [refreshClient])

  async function activateDevice() {
    if (!overview.publicKey) return
    setDeviceBusy(true)
    const result = await enablePush(overview.publicKey)
    setDeviceBusy(false)
    await refreshClient()
    router.refresh()
    if (result.ok) toast.success("Notificações ativadas neste dispositivo.")
    else if (result.reason === "denied") toast.error("O navegador bloqueou as notificações. Veja abaixo como liberar.")
    else if (result.reason === "failed") toast.error("Não foi possível ativar agora. Tente novamente.")
  }

  async function deactivateDevice() {
    setDeviceBusy(true)
    await disablePush()
    setDeviceBusy(false)
    await refreshClient()
    router.refresh()
    toast.success("Notificações desativadas neste dispositivo.")
  }

  const subscribed = client?.device === "subscribed"
  const ready = overview.available && overview.configured

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-brand-light">
            <BellRing className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="font-heading">Notificações no celular e no computador</CardTitle>
            <CardDescription className="leading-relaxed">
              Avisos nativos na tela bloqueada e na central de notificações, mesmo com o MARCAÍ fechado. Ao tocar, o
              agendamento abre direto.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {!overview.available && (
          <Notice icon={AlertTriangle} tone="warning">
            As notificações push ainda não estão disponíveis neste ambiente. Elas serão liberadas após a atualização do
            banco de dados.
          </Notice>
        )}
        {overview.available && !overview.configured && (
          <Notice icon={AlertTriangle} tone="warning">
            O envio de notificações push ainda não foi configurado no servidor. Suas preferências já podem ser salvas.
          </Notice>
        )}

        <section aria-labelledby="push-device" className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Smartphone className="size-5 text-muted-foreground" aria-hidden="true" />
              <div className="flex flex-col">
                <h3 id="push-device" className="text-sm font-medium">
                  Este dispositivo
                </h3>
                <p className="text-xs text-muted-foreground">
                  {overview.activeDevices === 0
                    ? "Nenhum dispositivo ativo na sua conta"
                    : `${overview.activeDevices} ${overview.activeDevices === 1 ? "dispositivo ativo" : "dispositivos ativos"} na sua conta`}
                </p>
              </div>
            </div>
            <StatusBadges client={client} />
          </div>

          <DeviceGuidance client={client} />

          <div className="flex flex-wrap items-center gap-2">
            {subscribed ? (
              <Button type="button" variant="outline" onClick={deactivateDevice} disabled={deviceBusy}>
                {deviceBusy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <BellOff data-icon="inline-start" />}
                Desativar neste dispositivo
              </Button>
            ) : (
              <Button
                type="button"
                onClick={activateDevice}
                disabled={deviceBusy || !ready || !client || client.support !== "supported" || client.permission === "denied"}
              >
                {deviceBusy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <BellRing data-icon="inline-start" />}
                {client?.device === "out_of_sync" ? "Reativar neste dispositivo" : "Ativar neste dispositivo"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={test.pending || !subscribed || !ready}
              onClick={() => test.run(() => sendPushTestAction(), "Teste enviado. Confira a notificação.", () => router.refresh())}
            >
              {test.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              Enviar teste
            </Button>
          </div>
        </section>

        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="push-enabled" checked={prefs.enabled} onCheckedChange={(c) => setPrefs((p) => ({ ...p, enabled: c }))} />
            <FieldContent>
              <FieldLabel htmlFor="push-enabled">Receber notificações push</FieldLabel>
              <FieldDescription>Vale para todos os seus dispositivos ativos neste estabelecimento.</FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal" data-disabled={!prefs.enabled || undefined}>
            <Switch
              id="push-sound"
              checked={prefs.sound}
              disabled={!prefs.enabled}
              onCheckedChange={(c) => setPrefs((p) => ({ ...p, sound: c }))}
            />
            <FieldContent>
              <FieldLabel htmlFor="push-sound">Tocar som</FieldLabel>
              <FieldDescription>
                Usa o som padrão do aparelho. O modo silencioso e as configurações do sistema prevalecem.
              </FieldDescription>
            </FieldContent>
          </Field>

          <FieldSeparator>Quais avisos receber</FieldSeparator>

          {EVENTS.map((e) => (
            <Field key={e.key} orientation="horizontal" data-disabled={!prefs.enabled || undefined}>
              <Switch
                id={`push-${e.key}`}
                checked={prefs[e.key]}
                disabled={!prefs.enabled}
                onCheckedChange={(c) => setPrefs((p) => ({ ...p, [e.key]: c }))}
              />
              <FieldContent>
                <FieldLabel htmlFor={`push-${e.key}`}>{e.label}</FieldLabel>
                <FieldDescription>{e.hint}</FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </FieldGroup>

        <div>
          <Button
            type="button"
            disabled={savePrefs.pending || !overview.available}
            onClick={() => savePrefs.run(() => savePushPreferences(prefs), "Preferências salvas", () => router.refresh())}
          >
            {savePrefs.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Salvar preferências
          </Button>
        </div>

        {canManageBusiness && (
          <section aria-labelledby="push-reminders" className="flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-1">
              <h3 id="push-reminders" className="text-sm font-medium">
                Lembretes do estabelecimento
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Define quando a equipe recebe o lembrete de um atendimento pendente ou confirmado.
              </p>
            </div>
            <FieldGroup>
              <Field orientation="horizontal">
                <Switch
                  id="push-reminders-enabled"
                  checked={reminders.remindersEnabled}
                  onCheckedChange={(c) => setReminders((r) => ({ ...r, remindersEnabled: c }))}
                />
                <FieldLabel htmlFor="push-reminders-enabled">Enviar lembretes de atendimentos</FieldLabel>
              </Field>
              <Field data-disabled={!reminders.remindersEnabled || undefined}>
                <FieldLabel htmlFor="push-reminder-lead">Antecedência</FieldLabel>
                <Select
                  items={LEAD_OPTIONS}
                  value={String(reminders.reminderLeadMin)}
                  disabled={!reminders.remindersEnabled}
                  onValueChange={(v) => v && setReminders((r) => ({ ...r, reminderLeadMin: Number(v) }))}
                >
                  <SelectTrigger id="push-reminder-lead" className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={saveReminders.pending || !overview.available}
                onClick={() => saveReminders.run(() => saveReminderSettings(reminders), "Lembretes salvos", () => router.refresh())}
              >
                {saveReminders.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                Salvar lembretes
              </Button>
            </div>
          </section>
        )}

        {overview.deliveries.length > 0 && (
          <section aria-labelledby="push-history" className="flex flex-col gap-2">
            <h3 id="push-history" className="text-sm font-medium">
              Últimos avisos
            </h3>
            <ul className="flex flex-col divide-y rounded-xl border">
              {overview.deliveries.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span>{EVENT_LABEL[d.event] ?? d.event}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.sentAt ?? d.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      d.status === "sent" && "bg-success/15 text-success",
                      d.status === "failed" && "bg-destructive/15 text-destructive"
                    )}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadges({ client }: { client: ClientState | null }) {
  if (!client || client.device === "loading") return <Skeleton className="h-5 w-32 rounded-full" />
  const permission =
    client.support !== "supported"
      ? { label: "Sem suporte neste navegador", className: "" }
      : client.permission === "granted"
        ? { label: "Permissão concedida", className: "bg-success/15 text-success" }
        : client.permission === "denied"
          ? { label: "Permissão bloqueada", className: "bg-destructive/15 text-destructive" }
          : { label: "Permissão não solicitada", className: "" }
  const device =
    client.device === "subscribed"
      ? { label: "Inscrito", className: "bg-success/15 text-success" }
      : client.device === "out_of_sync"
        ? { label: "Inscrição desatualizada", className: "bg-warning/15 text-warning" }
        : { label: "Não inscrito", className: "" }
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary" className={permission.className}>
        {permission.label}
      </Badge>
      {client.support === "supported" && (
        <Badge variant="secondary" className={device.className}>
          {device.label}
        </Badge>
      )}
    </div>
  )
}

function DeviceGuidance({ client }: { client: ClientState | null }) {
  if (!client) return null
  if (client.support === "ios_needs_install") {
    return (
      <Notice icon={Share} tone="info">
        No iPhone e iPad (iOS 16.4 ou mais recente), toque em <strong>Compartilhar</strong> no Safari, escolha{" "}
        <strong>Adicionar à Tela de Início</strong> e abra o MARCAÍ pelo ícone criado. Depois volte aqui e ative.
      </Notice>
    )
  }
  if (client.support === "unsupported") {
    return (
      <Notice icon={AlertTriangle} tone="info">
        Este navegador não suporta notificações push. Use Chrome, Edge, Firefox ou Safari atualizados.
      </Notice>
    )
  }
  if (client.permission === "denied") {
    return (
      <Notice icon={AlertTriangle} tone="warning">
        As notificações estão bloqueadas para o MARCAÍ. No computador, clique no ícone ao lado do endereço do site e
        permita <strong>Notificações</strong>. No Android, vá em Configurações do Chrome &gt; Configurações do site &gt;
        Notificações. Depois recarregue a página.
      </Notice>
    )
  }
  if (client.device === "subscribed") {
    return (
      <Notice icon={CheckCircle2} tone="success">
        Tudo certo. Os avisos chegam aqui mesmo com o MARCAÍ fechado. Confira se o modo Não Perturbe está desligado.
      </Notice>
    )
  }
  if (client.device === "out_of_sync") {
    return (
      <Notice icon={AlertTriangle} tone="warning">
        A inscrição deste dispositivo expirou ou pertence a outro estabelecimento. Reative para voltar a receber.
      </Notice>
    )
  }
  return null
}

function Notice({ icon: Icon, tone, children }: { icon: LucideIcon; tone: "info" | "warning" | "success"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm leading-relaxed",
        tone === "warning" && "border-warning/40 bg-warning/10",
        tone === "success" && "border-success/30 bg-success/10",
        tone === "info" && "bg-muted/40 text-muted-foreground"
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "warning" && "text-warning", tone === "success" && "text-success")}
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  )
}
