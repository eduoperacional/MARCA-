import type { PushSendResult, PushTarget } from "@/lib/push/web-push"

/**
 * Núcleo da fila de notificações push. Sem banco e sem rede: recebe um `PushStore` e um `PushSender`,
 * o que permite testar idempotência, tentativas, expiração e inscrições vencidas sem Neon.
 * Cada linha da fila é uma entrega para UMA inscrição (dispositivo).
 */

export type PushEvent = "new_booking" | "cancellation" | "reschedule" | "reminder" | "test"
export type PushDeliveryStatus = "pending" | "processing" | "sent" | "failed" | "skipped"

export const MAX_ATTEMPTS = 5
/** Atraso antes de cada nova tentativa (o processador roda a cada 5 minutos). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]
/** Um aviso de agenda com mais de 24 h perde o sentido; lembretes expiram no início do atendimento. */
export const EVENT_TTL_MS = 24 * 60 * 60_000
export const TEST_TTL_MS = 10 * 60_000
export const LOCK_MS = 2 * 60_000

export interface PushPreferences {
  enabled: boolean
  sound: boolean
  notifyNewBooking: boolean
  notifyCancellation: boolean
  notifyReschedule: boolean
  notifyReminder: boolean
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  enabled: true,
  sound: true,
  notifyNewBooking: true,
  notifyCancellation: true,
  notifyReschedule: true,
  notifyReminder: true,
}

const EVENT_PREF: Record<Exclude<PushEvent, "test">, keyof PushPreferences> = {
  new_booking: "notifyNewBooking",
  cancellation: "notifyCancellation",
  reschedule: "notifyReschedule",
  reminder: "notifyReminder",
}

/** O teste ignora as preferências de evento; os demais exigem push ligado e o evento marcado. */
export function eventAllowed(prefs: PushPreferences, event: PushEvent) {
  if (event === "test") return true
  return prefs.enabled && prefs[EVENT_PREF[event]]
}

export interface AppointmentSnapshot {
  appointmentId: string
  businessId: string
  professionalId: string
  clientName: string
  serviceName: string
  professionalName: string
  startsAt: Date
  updatedAt: Date
}

export interface Recipient {
  subscriptionId: string
  userId: string
  preferences: PushPreferences
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  silent: boolean
  timestamp: number
  event: PushEvent
  appointmentId: string | null
}

export interface NewPushDelivery {
  businessId: string
  subscriptionId: string
  appointmentId: string | null
  event: PushEvent
  payload: PushPayload
  dedupeKey: string
  maxAttempts: number
  nextAttemptAt: Date
  expiresAt: Date
}

export interface ClaimedPushDelivery {
  id: string
  businessId: string
  subscriptionId: string
  appointmentId: string | null
  event: PushEvent
  payload: PushPayload
  /** Já inclui a tentativa atual. */
  attempts: number
  maxAttempts: number
  expiresAt: Date
}

export interface DeliveryTarget extends PushTarget {
  /** Inscrição não revogada e membro ainda ativo no estabelecimento. */
  active: boolean
  preferences: PushPreferences
}

export interface PushStore {
  /** Inscrições ativas de membros ativos que podem ver o agendamento do profissional informado. */
  listRecipients(businessId: string, options: { professionalId?: string; userId?: string }): Promise<Recipient[]>
  /** Insere ignorando chaves (inscrição, dedupe) já existentes. Retorna os ids criados. */
  insertPending(rows: NewPushDelivery[]): Promise<string[]>
  claim(input: { now: Date; lockUntil: Date; limit: number; ids?: string[] }): Promise<ClaimedPushDelivery[]>
  getTarget(subscriptionId: string, businessId: string): Promise<DeliveryTarget | null>
  markSent(id: string, subscriptionId: string, now: Date): Promise<void>
  scheduleRetry(id: string, error: string, nextAttemptAt: Date, now: Date): Promise<void>
  markFailed(id: string, error: string, now: Date): Promise<void>
  markSkipped(id: string, reason: string, now: Date): Promise<void>
  revokeSubscription(subscriptionId: string, reason: string, now: Date): Promise<void>
}

export interface PushSender {
  isConfigured(): boolean
  send(target: PushTarget, payload: string, options: { ttlSeconds: number; topic?: string }): Promise<PushSendResult>
}

export interface PushDeps {
  store: PushStore
  sender: PushSender
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}

export function appointmentUrl(appointmentId: string) {
  return `/painel/agendamentos?agendamento=${appointmentId}`
}

/**
 * Novo agendamento: uma vez por agendamento. Reagendamento e cancelamento incluem o updated_at da
 * própria alteração (cada remarcação legítima é distinta; o reprocessamento gera a mesma chave).
 * Lembrete: um por horário; se o atendimento for remarcado, o novo horário ganha o próprio lembrete.
 */
export function dedupeKeyFor(event: Exclude<PushEvent, "test">, s: Pick<AppointmentSnapshot, "appointmentId" | "startsAt" | "updatedAt">) {
  const id = s.appointmentId
  if (event === "new_booking") return `new_booking:${id}`
  if (event === "reschedule") return `reschedule:${id}:${s.startsAt.getTime()}:${s.updatedAt.getTime()}`
  if (event === "reminder") return `reminder:${id}:${s.startsAt.getTime()}`
  return `cancellation:${id}:${s.updatedAt.getTime()}`
}

const TITLES: Record<Exclude<PushEvent, "test">, string> = {
  new_booking: "Novo agendamento",
  cancellation: "Agendamento cancelado",
  reschedule: "Agendamento reagendado",
  reminder: "Atendimento em breve",
}

export function buildPayload(
  event: Exclude<PushEvent, "test">,
  s: AppointmentSnapshot,
  options: { sound: boolean; formatWhen: (instant: Date) => string; now: Date }
): PushPayload {
  return {
    title: `${TITLES[event]} · ${s.clientName}`,
    body: `${s.serviceName} com ${s.professionalName}\n${options.formatWhen(s.startsAt)}`,
    url: appointmentUrl(s.appointmentId),
    // A mesma tag substitui o aviso anterior do mesmo agendamento na central do aparelho.
    tag: `appt-${s.appointmentId}`,
    silent: !options.sound,
    timestamp: options.now.getTime(),
    event,
    appointmentId: s.appointmentId,
  }
}

export function retryDelayMs(attemptsMade: number) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attemptsMade, 1), RETRY_DELAYS_MS.length) - 1]
}

export type EnqueueResult =
  | { status: "queued"; ids: string[] }
  | { status: "duplicate" }
  | { status: "skipped"; reason: "not_configured" | "no_appointment" | "no_recipients" | "expired" }
  | { status: "error" }

/** Grava uma entrega pending por inscrição elegível ANTES de qualquer envio. Nunca lança erro. */
export async function enqueueAppointmentPush(
  deps: PushDeps,
  input: {
    businessId: string
    event: Exclude<PushEvent, "test">
    loadSnapshot: () => Promise<AppointmentSnapshot | null>
    formatWhen: (instant: Date) => string
  }
): Promise<EnqueueResult> {
  try {
    if (!deps.sender.isConfigured()) return { status: "skipped", reason: "not_configured" }
    const snapshot = await input.loadSnapshot()
    if (!snapshot || snapshot.businessId !== input.businessId) return { status: "skipped", reason: "no_appointment" }

    const now = (deps.now ?? (() => new Date()))()
    const expiresAt = input.event === "reminder" ? snapshot.startsAt : new Date(now.getTime() + EVENT_TTL_MS)
    if (expiresAt.getTime() <= now.getTime()) return { status: "skipped", reason: "expired" }

    const recipients = (await deps.store.listRecipients(input.businessId, { professionalId: snapshot.professionalId })).filter((r) =>
      eventAllowed(r.preferences, input.event)
    )
    if (!recipients.length) return { status: "skipped", reason: "no_recipients" }

    const dedupeKey = dedupeKeyFor(input.event, snapshot)
    const ids = await deps.store.insertPending(
      recipients.map((r) => ({
        businessId: input.businessId,
        subscriptionId: r.subscriptionId,
        appointmentId: snapshot.appointmentId,
        event: input.event,
        payload: buildPayload(input.event, snapshot, { sound: r.preferences.sound, formatWhen: input.formatWhen, now }),
        dedupeKey,
        maxAttempts: MAX_ATTEMPTS,
        nextAttemptAt: now,
        expiresAt,
      }))
    )
    return ids.length ? { status: "queued", ids } : { status: "duplicate" }
  } catch (error) {
    deps.log?.("[push] falha ao enfileirar aviso", error)
    return { status: "error" }
  }
}

/** Teste para todos os dispositivos ativos do próprio usuário no estabelecimento. */
export async function enqueueTestPush(deps: PushDeps, input: { businessId: string; userId: string; businessName: string }) {
  if (!deps.sender.isConfigured()) return { status: "skipped" as const, reason: "not_configured" as const }
  const now = (deps.now ?? (() => new Date()))()
  const recipients = await deps.store.listRecipients(input.businessId, { userId: input.userId })
  if (!recipients.length) return { status: "skipped" as const, reason: "no_recipients" as const }
  const ids = await deps.store.insertPending(
    recipients.map((r) => ({
      businessId: input.businessId,
      subscriptionId: r.subscriptionId,
      appointmentId: null,
      event: "test" as const,
      payload: {
        title: "Notificações ativadas",
        body: `Você vai receber aqui os avisos de agenda de ${input.businessName}.`,
        url: "/painel/configuracoes?aba=notificacoes",
        tag: "marcai-test",
        silent: !r.preferences.sound,
        timestamp: now.getTime(),
        event: "test" as const,
        appointmentId: null,
      },
      dedupeKey: `test:${now.getTime()}`,
      maxAttempts: 1,
      nextAttemptAt: now,
      expiresAt: new Date(now.getTime() + TEST_TTL_MS),
    }))
  )
  return { status: "queued" as const, ids }
}

export type ProcessOutcome = "sent" | "retry" | "failed" | "skipped"

/** Processa uma entrega já reservada. Inscrição, vínculo e preferências são conferidos de novo no envio. */
export async function processPushDelivery(deps: PushDeps, row: ClaimedPushDelivery): Promise<ProcessOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const { store } = deps

  if (now.getTime() > row.expiresAt.getTime()) {
    await store.markFailed(row.id, "expired", now)
    return "failed"
  }
  if (row.attempts > row.maxAttempts) {
    await store.markFailed(row.id, "max_attempts", now)
    return "failed"
  }

  const target = await store.getTarget(row.subscriptionId, row.businessId)
  if (!target || !target.active) {
    await store.markSkipped(row.id, "subscription_inactive", now)
    return "skipped"
  }
  if (!eventAllowed(target.preferences, row.event)) {
    await store.markSkipped(row.id, "disabled_by_user", now)
    return "skipped"
  }

  let result: PushSendResult
  try {
    result = await deps.sender.send(target, JSON.stringify(row.payload), {
      ttlSeconds: Math.max(60, Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000)),
      topic: row.appointmentId?.replace(/-/g, ""),
    })
  } catch (error) {
    result = { ok: false, kind: "retry", status: 0, error: String((error as Error)?.message ?? error).slice(0, 300) }
  }

  if (result.ok) {
    await store.markSent(row.id, row.subscriptionId, now)
    return "sent"
  }
  if (result.kind === "gone") {
    await store.revokeSubscription(row.subscriptionId, "expired", now)
    await store.markSkipped(row.id, "subscription_expired", now)
    return "skipped"
  }
  if (result.kind === "retry" && row.attempts < row.maxAttempts) {
    await store.scheduleRetry(row.id, result.error, new Date(now.getTime() + retryDelayMs(row.attempts)), now)
    return "retry"
  }
  await store.markFailed(row.id, result.error, now)
  return "failed"
}

export interface PushRunSummary {
  configured: boolean
  claimed: number
  sent: number
  retry: number
  failed: number
  skipped: number
  errors: number
}

export function emptySummary(configured: boolean): PushRunSummary {
  return { configured, claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, errors: 0 }
}

/** Processa a fila (cron) ou entregas específicas (`ids`, logo após a resposta). Sem VAPID, não reserva nada. */
export async function processPushQueue(deps: PushDeps, options: { limit?: number; ids?: string[] } = {}): Promise<PushRunSummary> {
  const summary = emptySummary(deps.sender.isConfigured())
  if (!summary.configured || (options.ids && !options.ids.length)) return summary

  const now = (deps.now ?? (() => new Date()))()
  const rows = await deps.store.claim({
    now,
    lockUntil: new Date(now.getTime() + LOCK_MS),
    limit: options.limit ?? options.ids?.length ?? 25,
    ids: options.ids,
  })
  summary.claimed = rows.length
  for (const row of rows) {
    try {
      summary[await processPushDelivery(deps, row)]++
    } catch (error) {
      summary.errors++
      deps.log?.(`[push] erro ao processar entrega ${row.id}`, error)
    }
  }
  return summary
}
