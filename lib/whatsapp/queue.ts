import { toWhatsappNumber, type WhatsappEvent } from "@/lib/whatsapp/templates"

/**
 * Núcleo da fila de notificações por WhatsApp. Não acessa banco nem rede diretamente:
 * recebe um `QueueStore` e um `QueueSender`, o que permite testar toda a regra sem Neon e sem Meta.
 */

export type NotificationEvent = Exclude<WhatsappEvent, "test">
export type DeliveryStatus = "pending" | "processing" | "sent" | "failed" | "skipped"

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; reason: "not_configured" | "provider_error" | "network_error"; error: string; retryable: boolean }

export const MAX_ATTEMPTS = 5
/** Espera antes da 2ª, 3ª, 4ª e 5ª tentativa. */
export const RETRY_DELAYS_MIN = [1, 5, 15, 60] as const
/** Um aviso que não saiu em 24 h deixa de ser útil e é encerrado como falha. */
export const DELIVERY_TTL_MS = 24 * 60 * 60_000
/** Uma linha em "processing" com o bloqueio vencido volta a ser elegível (processo interrompido). */
export const LOCK_MS = 2 * 60_000

export interface ConsentSettings {
  phone: string | null
  enabled: boolean
  consentAt: Date | string | null
  notifyNewBooking: boolean
  notifyCancellation: boolean
  notifyReschedule: boolean
}

export interface AppointmentSnapshot {
  appointmentId: string
  businessId: string
  businessName: string
  clientName: string
  serviceName: string
  professionalName: string
  startsAt: Date
  updatedAt: Date
}

export interface ClaimedDelivery {
  id: string
  businessId: string
  appointmentId: string | null
  event: NotificationEvent
  params: string[]
  /** Já inclui a tentativa atual (incrementado no momento da reserva). */
  attempts: number
  maxAttempts: number
  expiresAt: Date
}

export interface NewDelivery {
  businessId: string
  appointmentId: string
  event: NotificationEvent
  toPhone: string
  params: string[]
  dedupeKey: string
  maxAttempts: number
  nextAttemptAt: Date
  expiresAt: Date
}

export interface QueueStore {
  getSettings(businessId: string): Promise<ConsentSettings | null>
  /** Retorna o id criado, ou null quando a chave de idempotência já existe para o estabelecimento. */
  insertPending(row: NewDelivery): Promise<string | null>
  /** Reserva linhas elegíveis (status pending vencido ou processing com bloqueio expirado), incrementando attempts. */
  claim(input: { now: Date; lockUntil: Date; limit: number; id?: string }): Promise<ClaimedDelivery[]>
  markSent(id: string, toPhone: string, messageId: string | null, now: Date): Promise<void>
  scheduleRetry(id: string, error: string, nextAttemptAt: Date, now: Date): Promise<void>
  markFailed(id: string, error: string, now: Date): Promise<void>
  markSkipped(id: string, reason: string, now: Date): Promise<void>
  /** Volta para pending uma entrega com status failed, somente se pertencer ao estabelecimento. */
  requeueFailed(businessId: string, id: string, now: Date, expiresAt: Date): Promise<boolean>
}

export interface QueueSender {
  isConfigured(): boolean
  send(input: { to: string; event: NotificationEvent; params: string[] }): Promise<SendResult>
}

export interface QueueDeps {
  store: QueueStore
  sender: QueueSender
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}

const EVENT_PREF: Record<NotificationEvent, keyof ConsentSettings> = {
  new_booking: "notifyNewBooking",
  cancellation: "notifyCancellation",
  reschedule: "notifyReschedule",
}

export type ConsentCheck =
  | { ok: true; to: string }
  | { ok: false; reason: "no_settings" | "disabled" | "no_consent" | "event_disabled" | "invalid_phone" }

/** Só envia com número salvo, ativação voluntária registrada (consent_at) e o evento ligado. */
export function canNotifyOwner(settings: ConsentSettings | null, event: NotificationEvent): ConsentCheck {
  if (!settings) return { ok: false, reason: "no_settings" }
  if (!settings.enabled) return { ok: false, reason: "disabled" }
  if (!settings.consentAt) return { ok: false, reason: "no_consent" }
  if (!settings[EVENT_PREF[event]]) return { ok: false, reason: "event_disabled" }
  const to = toWhatsappNumber(settings.phone)
  if (!to) return { ok: false, reason: "invalid_phone" }
  return { ok: true, to }
}

/**
 * Chave de idempotência. Novo agendamento: uma vez por agendamento. Reagendamento e cancelamento
 * incluem o updated_at gravado pela própria alteração, então cada remarcação legítima gera uma
 * chave nova, enquanto o reprocessamento do mesmo evento sempre gera a mesma chave.
 */
export function dedupeKeyFor(event: NotificationEvent, snapshot: Pick<AppointmentSnapshot, "appointmentId" | "startsAt" | "updatedAt">) {
  const id = snapshot.appointmentId
  if (event === "new_booking") return `new_booking:${id}`
  if (event === "reschedule") return `reschedule:${id}:${snapshot.startsAt.getTime()}:${snapshot.updatedAt.getTime()}`
  return `cancellation:${id}:${snapshot.updatedAt.getTime()}`
}

export function templateParams(snapshot: AppointmentSnapshot, formatWhen: (instant: Date) => string) {
  return [
    snapshot.businessName,
    snapshot.clientName,
    `${snapshot.serviceName} com ${snapshot.professionalName}`,
    formatWhen(snapshot.startsAt),
  ]
}

/** Atraso antes da próxima tentativa, dado quantas já foram feitas (backoff progressivo). */
export function retryDelayMs(attemptsMade: number) {
  const index = Math.min(Math.max(attemptsMade, 1), RETRY_DELAYS_MIN.length) - 1
  return RETRY_DELAYS_MIN[index] * 60_000
}

/** Códigos da Cloud API que indicam falha temporária (limite, indisponibilidade). */
const RETRYABLE_META_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 133004])

export function isRetryableProviderError(httpStatus: number, metaCode?: number) {
  if (metaCode !== undefined && RETRYABLE_META_CODES.has(metaCode)) return true
  return httpStatus === 408 || httpStatus === 429 || httpStatus >= 500
}

export type EnqueueResult =
  | { status: "queued"; id: string }
  | { status: "duplicate" }
  | { status: "skipped"; reason: "not_configured" | "no_appointment" | Extract<ConsentCheck, { ok: false }>["reason"] }
  | { status: "error" }

/**
 * Registra o aviso como pending ANTES de qualquer chamada à Meta. Sem credenciais, sem consentimento
 * ou com o evento desligado, nada é gravado nem enviado. Nunca lança erro.
 */
export async function enqueueOwnerNotification(
  deps: QueueDeps,
  input: {
    businessId: string
    event: NotificationEvent
    loadSnapshot: () => Promise<AppointmentSnapshot | null>
    formatWhen: (instant: Date) => string
  }
): Promise<EnqueueResult> {
  try {
    if (!deps.sender.isConfigured()) return { status: "skipped", reason: "not_configured" }
    const check = canNotifyOwner(await deps.store.getSettings(input.businessId), input.event)
    if (!check.ok) return { status: "skipped", reason: check.reason }

    const snapshot = await input.loadSnapshot()
    if (!snapshot || snapshot.businessId !== input.businessId) return { status: "skipped", reason: "no_appointment" }

    const now = (deps.now ?? (() => new Date()))()
    const id = await deps.store.insertPending({
      businessId: input.businessId,
      appointmentId: snapshot.appointmentId,
      event: input.event,
      toPhone: check.to,
      params: templateParams(snapshot, input.formatWhen),
      dedupeKey: dedupeKeyFor(input.event, snapshot),
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: now,
      expiresAt: new Date(now.getTime() + DELIVERY_TTL_MS),
    })
    return id ? { status: "queued", id } : { status: "duplicate" }
  } catch (error) {
    deps.log?.("[whatsapp] falha ao enfileirar aviso", error)
    return { status: "error" }
  }
}

export type ProcessOutcome = "sent" | "retry" | "failed" | "skipped"

/** Processa uma entrega já reservada. O consentimento é conferido de novo no momento do envio. */
export async function processDelivery(deps: QueueDeps, row: ClaimedDelivery): Promise<ProcessOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const { store } = deps

  if (now.getTime() > row.expiresAt.getTime()) {
    await store.markFailed(row.id, "expired: aviso não entregue dentro de 24 horas", now)
    return "failed"
  }
  if (row.attempts > row.maxAttempts) {
    await store.markFailed(row.id, "max_attempts", now)
    return "failed"
  }

  const check = canNotifyOwner(await store.getSettings(row.businessId), row.event)
  if (!check.ok) {
    await store.markSkipped(row.id, check.reason, now)
    return "skipped"
  }

  let result: SendResult
  try {
    result = await deps.sender.send({ to: check.to, event: row.event, params: row.params })
  } catch (error) {
    result = { ok: false, reason: "network_error", error: String((error as Error)?.message ?? error).slice(0, 500), retryable: true }
  }

  if (result.ok) {
    await store.markSent(row.id, check.to, result.messageId, now)
    return "sent"
  }
  if (result.retryable && row.attempts < row.maxAttempts) {
    await store.scheduleRetry(row.id, result.error, new Date(now.getTime() + retryDelayMs(row.attempts)), now)
    return "retry"
  }
  await store.markFailed(row.id, result.error, now)
  return "failed"
}

export interface QueueRunSummary {
  configured: boolean
  claimed: number
  sent: number
  retry: number
  failed: number
  skipped: number
  errors: number
}

/**
 * Processa a fila (cron) ou uma única entrega (`id`, logo após a resposta da requisição).
 * Sem credenciais não reserva nada, para não consumir tentativas.
 */
export async function processQueue(deps: QueueDeps, options: { limit?: number; id?: string } = {}): Promise<QueueRunSummary> {
  const summary: QueueRunSummary = { configured: deps.sender.isConfigured(), claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, errors: 0 }
  if (!summary.configured) return summary

  const now = (deps.now ?? (() => new Date()))()
  const rows = await deps.store.claim({
    now,
    lockUntil: new Date(now.getTime() + LOCK_MS),
    limit: options.limit ?? 25,
    id: options.id,
  })
  summary.claimed = rows.length
  for (const row of rows) {
    try {
      summary[await processDelivery(deps, row)]++
    } catch (error) {
      summary.errors++
      deps.log?.(`[whatsapp] erro ao processar entrega ${row.id}`, error)
    }
  }
  return summary
}

/** Reprocessamento manual de uma falha, restrito ao estabelecimento informado. */
export async function retryFailedDelivery(deps: QueueDeps, businessId: string, id: string) {
  const now = (deps.now ?? (() => new Date()))()
  return deps.store.requeueFailed(businessId, id, now, new Date(now.getTime() + DELIVERY_TTL_MS))
}
