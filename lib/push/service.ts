import "server-only"

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { after } from "next/server"

import { db } from "@/lib/db"
import {
  appointments,
  businessMembers,
  businessPushSettings,
  clients,
  professionals,
  pushDeliveries,
  pushPreferences,
  pushSubscriptions,
  services,
} from "@/lib/db/schema"
import { effectivePermissions, type MemberRole, type Permission } from "@/lib/permissions"
import {
  DEFAULT_PUSH_PREFERENCES,
  emptySummary,
  enqueueAppointmentPush as enqueueCore,
  enqueueTestPush,
  processPushQueue,
  type AppointmentSnapshot,
  type ClaimedPushDelivery,
  type PushDeps,
  type PushEvent,
  type PushPayload,
  type PushPreferences,
  type PushRunSummary,
  type PushStore,
} from "@/lib/push/queue"
import { isValidVapidKeys, sendWebPush, type VapidKeys } from "@/lib/push/web-push"
import { localParts } from "@/lib/time"

export const REMINDER_LEAD_OPTIONS = [15, 30, 60, 120, 240, 1440] as const

export interface BusinessPushSettings {
  remindersEnabled: boolean
  reminderLeadMin: number
}

export const DEFAULT_BUSINESS_PUSH_SETTINGS: BusinessPushSettings = { remindersEnabled: true, reminderLeadMin: 60 }

/** Tabela ausente: script 017 ainda não executado. */
export function isMissingTable(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } }
  return (e?.code ?? e?.cause?.code) === "42P01"
}

function vapidKeys(): VapidKeys | null {
  const keys = {
    publicKey: process.env.VAPID_PUBLIC_KEY?.trim(),
    privateKey: process.env.VAPID_PRIVATE_KEY?.trim(),
    subject: process.env.VAPID_SUBJECT?.trim(),
  }
  return isValidVapidKeys(keys) ? keys : null
}

export function isPushConfigured() {
  return vapidKeys() !== null
}

/** Apenas a chave pública vai para o navegador; a privada nunca sai do servidor. */
export function getVapidPublicKey() {
  return vapidKeys()?.publicKey ?? null
}

/** Dono e quem vê a agenda da equipe recebem tudo; o profissional, só os próprios atendimentos. */
function canSeeAppointment(
  member: { role: MemberRole; permissions: Permission[]; professionalId: string | null },
  professionalId: string | undefined
) {
  if (!professionalId) return true
  if (member.role === "owner" || effectivePermissions(member.role, member.permissions).has("agenda.view_all")) return true
  return member.professionalId === professionalId
}

function toPreferences(row: { [K in keyof PushPreferences]?: boolean | null } | null): PushPreferences {
  if (!row || row.enabled === null || row.enabled === undefined) return DEFAULT_PUSH_PREFERENCES
  return {
    enabled: Boolean(row.enabled),
    sound: Boolean(row.sound),
    notifyNewBooking: Boolean(row.notifyNewBooking),
    notifyCancellation: Boolean(row.notifyCancellation),
    notifyReschedule: Boolean(row.notifyReschedule),
    notifyReminder: Boolean(row.notifyReminder),
  }
}

const preferenceColumns = {
  enabled: pushPreferences.enabled,
  sound: pushPreferences.sound,
  notifyNewBooking: pushPreferences.notifyNewBooking,
  notifyCancellation: pushPreferences.notifyCancellation,
  notifyReschedule: pushPreferences.notifyReschedule,
  notifyReminder: pushPreferences.notifyReminder,
}

type ClaimRow = {
  id: string
  business_id: string
  subscription_id: string
  appointment_id: string | null
  event: PushEvent
  payload: PushPayload
  attempts: number
  max_attempts: number
  expires_at: string | Date
}

const store: PushStore = {
  async listRecipients(businessId, { professionalId, userId }) {
    const rows = await db
      .select({
        subscriptionId: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        role: businessMembers.role,
        permissions: businessMembers.permissions,
        memberProfessionalId: businessMembers.professionalId,
        ...preferenceColumns,
      })
      .from(pushSubscriptions)
      .innerJoin(
        businessMembers,
        and(
          eq(businessMembers.businessId, pushSubscriptions.businessId),
          eq(businessMembers.userId, pushSubscriptions.userId),
          eq(businessMembers.active, true)
        )
      )
      .leftJoin(
        pushPreferences,
        and(eq(pushPreferences.businessId, pushSubscriptions.businessId), eq(pushPreferences.userId, pushSubscriptions.userId))
      )
      .where(
        and(
          eq(pushSubscriptions.businessId, businessId),
          isNull(pushSubscriptions.revokedAt),
          userId ? eq(pushSubscriptions.userId, userId) : undefined
        )
      )
    return rows
      .filter((r) =>
        canSeeAppointment({ role: r.role, permissions: r.permissions ?? [], professionalId: r.memberProfessionalId }, professionalId)
      )
      .map((r) => ({ subscriptionId: r.subscriptionId, userId: r.userId, preferences: toPreferences(r) }))
  },

  async insertPending(rows) {
    if (!rows.length) return []
    const created = await db
      .insert(pushDeliveries)
      .values(rows.map((r) => ({ ...r, payload: r.payload as unknown as Record<string, unknown>, status: "pending" as const, attempts: 0 })))
      .onConflictDoNothing({ target: [pushDeliveries.subscriptionId, pushDeliveries.dedupeKey] })
      .returning({ id: pushDeliveries.id })
    return created.map((c) => c.id)
  },

  async claim({ now, lockUntil, limit, ids }) {
    const result = await db.execute<ClaimRow>(sql`
      UPDATE push_deliveries d
      SET status = 'processing',
          attempts = d.attempts + 1,
          locked_until = ${lockUntil},
          last_attempt_at = ${now},
          updated_at = ${now}
      WHERE d.id IN (
        SELECT q.id FROM push_deliveries q
        WHERE (
            (q.status = 'pending' AND q.next_attempt_at <= ${now})
            OR (q.status = 'processing' AND q.locked_until < ${now})
          )
          ${ids?.length ? sql`AND q.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``}
        ORDER BY q.next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING d.id, d.business_id, d.subscription_id, d.appointment_id, d.event, d.payload, d.attempts, d.max_attempts, d.expires_at`)
    return result.rows.map(
      (r): ClaimedPushDelivery => ({
        id: r.id,
        businessId: r.business_id,
        subscriptionId: r.subscription_id,
        appointmentId: r.appointment_id,
        event: r.event,
        payload: r.payload,
        attempts: Number(r.attempts),
        maxAttempts: Number(r.max_attempts),
        expiresAt: new Date(r.expires_at),
      })
    )
  },

  async getTarget(subscriptionId, businessId) {
    const [row] = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        revokedAt: pushSubscriptions.revokedAt,
        memberActive: businessMembers.active,
        ...preferenceColumns,
      })
      .from(pushSubscriptions)
      .leftJoin(
        businessMembers,
        and(eq(businessMembers.businessId, pushSubscriptions.businessId), eq(businessMembers.userId, pushSubscriptions.userId))
      )
      .leftJoin(
        pushPreferences,
        and(eq(pushPreferences.businessId, pushSubscriptions.businessId), eq(pushPreferences.userId, pushSubscriptions.userId))
      )
      .where(and(eq(pushSubscriptions.id, subscriptionId), eq(pushSubscriptions.businessId, businessId)))
      .limit(1)
    if (!row) return null
    return {
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      active: !row.revokedAt && row.memberActive === true,
      preferences: toPreferences(row),
    }
  },

  async markSent(id, subscriptionId, now) {
    await db
      .update(pushDeliveries)
      .set({ status: "sent", sentAt: now, error: null, lockedUntil: null, updatedAt: now })
      .where(and(eq(pushDeliveries.id, id), eq(pushDeliveries.status, "processing")))
    await db.update(pushSubscriptions).set({ lastSuccessAt: now, updatedAt: now }).where(eq(pushSubscriptions.id, subscriptionId))
  },

  async scheduleRetry(id, error, nextAttemptAt, now) {
    await db
      .update(pushDeliveries)
      .set({ status: "pending", error, nextAttemptAt, lockedUntil: null, updatedAt: now })
      .where(and(eq(pushDeliveries.id, id), eq(pushDeliveries.status, "processing")))
  },

  async markFailed(id, error, now) {
    await db
      .update(pushDeliveries)
      .set({ status: "failed", error, lockedUntil: null, updatedAt: now })
      .where(and(eq(pushDeliveries.id, id), eq(pushDeliveries.status, "processing")))
  },

  async markSkipped(id, reason, now) {
    await db
      .update(pushDeliveries)
      .set({ status: "skipped", error: reason, lockedUntil: null, updatedAt: now })
      .where(and(eq(pushDeliveries.id, id), eq(pushDeliveries.status, "processing")))
  },

  async revokeSubscription(subscriptionId, reason, now) {
    await db
      .update(pushSubscriptions)
      .set({ revokedAt: now, revokedReason: reason, updatedAt: now })
      .where(and(eq(pushSubscriptions.id, subscriptionId), isNull(pushSubscriptions.revokedAt)))
  },
}

const deps: PushDeps = {
  store,
  sender: {
    isConfigured: isPushConfigured,
    async send(target, payload, options) {
      const keys = vapidKeys()
      if (!keys) return { ok: false, kind: "fail", status: 0, error: "not_configured" }
      return sendWebPush(target, payload, keys, options)
    },
  },
  log: (message, error) => console.error(message, error),
}

function formatWhen(instant: Date) {
  const local = localParts(instant)
  return `${local.date.split("-").reverse().join("/")} às ${local.time}`
}

async function loadSnapshot(businessId: string, appointmentId: string): Promise<AppointmentSnapshot | null> {
  const [row] = await db
    .select({
      professionalId: appointments.professionalId,
      clientName: clients.name,
      serviceName: services.name,
      professionalName: professionals.name,
      startsAt: appointments.startsAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(clients, and(eq(clients.id, appointments.clientId), eq(clients.businessId, appointments.businessId)))
    .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, appointments.businessId)))
    .innerJoin(professionals, and(eq(professionals.id, appointments.professionalId), eq(professionals.businessId, appointments.businessId)))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId)))
    .limit(1)
  return row ? { appointmentId, businessId, ...row } : null
}

function runAfterResponse(ids: string[]) {
  const job = () =>
    processPushQueue(deps, { ids }).catch((error) => console.error("[push] envio imediato falhou", error))
  try {
    after(job)
  } catch {
    void job()
  }
}

/**
 * Grava as entregas push (pending) dentro da requisição e tenta enviar logo após a resposta.
 * Se essa tentativa falhar, o cron /api/cron/push reprocessa. Nunca lança erro.
 */
export async function enqueueAppointmentPush(input: {
  businessId: string
  appointmentId: string
  event: Exclude<PushEvent, "test">
}) {
  try {
    const result = await enqueueCore(deps, {
      businessId: input.businessId,
      event: input.event,
      loadSnapshot: () => loadSnapshot(input.businessId, input.appointmentId),
      formatWhen,
    })
    if (result.status === "queued") runAfterResponse(result.ids)
    return result
  } catch (error) {
    if (!isMissingTable(error)) console.error("[push] falha ao enfileirar", error)
    return { status: "error" as const }
  }
}

/** Teste enviado na hora para os dispositivos do próprio usuário. */
export async function sendPushTest(businessId: string, userId: string, businessName: string): Promise<PushRunSummary & { devices: number }> {
  const queued = await enqueueTestPush(deps, { businessId, userId, businessName })
  if (queued.status !== "queued") return { ...emptySummary(isPushConfigured()), devices: 0 }
  const summary = await processPushQueue(deps, { ids: queued.ids })
  return { ...summary, devices: queued.ids.length }
}

/**
 * Lembretes: agendamentos pendentes/confirmados que começam dentro da antecedência configurada e ainda
 * não tiveram lembrete enfileirado para este horário. A chave de deduplicação impede envio duplo.
 */
export async function enqueueDueReminders(now = new Date(), limit = 200) {
  if (!isPushConfigured()) return { checked: 0, queued: 0 }
  const due = await db.execute<{ id: string; business_id: string }>(sql`
    SELECT a.id, a.business_id
    FROM appointments a
    LEFT JOIN business_push_settings s ON s.business_id = a.business_id
    WHERE a.status IN ('pending', 'confirmed')
      AND COALESCE(s.reminders_enabled, true)
      AND a.starts_at > ${now}
      AND a.starts_at <= ${now}::timestamptz + make_interval(mins => COALESCE(s.reminder_lead_min, ${DEFAULT_BUSINESS_PUSH_SETTINGS.reminderLeadMin}))
      AND EXISTS (
        SELECT 1 FROM push_subscriptions ps WHERE ps.business_id = a.business_id AND ps.revoked_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM push_deliveries d
        WHERE d.business_id = a.business_id
          AND d.appointment_id = a.id
          AND d.event = 'reminder'
          AND d.dedupe_key = 'reminder:' || a.id || ':' || floor(extract(epoch from a.starts_at) * 1000)::bigint
      )
    ORDER BY a.starts_at
    LIMIT ${limit}`)

  let queued = 0
  for (const row of due.rows) {
    const result = await enqueueCore(deps, {
      businessId: row.business_id,
      event: "reminder",
      loadSnapshot: () => loadSnapshot(row.business_id, row.id),
      formatWhen,
    })
    if (result.status === "queued") queued += result.ids.length
  }
  return { checked: due.rows.length, queued }
}

export function processPushDeliveries(limit = 50) {
  return processPushQueue(deps, { limit })
}

/* ------------------------------ Inscrições e preferências ------------------------------ */

export async function upsertSubscription(input: {
  businessId: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  replacesEndpoint?: string | null
}) {
  const now = new Date()
  await db
    .insert(pushSubscriptions)
    .values({ ...input, revokedAt: null, revokedReason: null, updatedAt: now })
    .onConflictDoUpdate({
      target: [pushSubscriptions.businessId, pushSubscriptions.endpoint],
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        revokedAt: null,
        revokedReason: null,
        updatedAt: now,
      },
    })
  if (input.replacesEndpoint && input.replacesEndpoint !== input.endpoint) {
    await revokeSubscriptionByEndpoint(input.businessId, input.userId, input.replacesEndpoint, "replaced")
  }
}

export async function revokeSubscriptionByEndpoint(businessId: string, userId: string, endpoint: string, reason = "user_disabled") {
  const now = new Date()
  await db
    .update(pushSubscriptions)
    .set({ revokedAt: now, revokedReason: reason, updatedAt: now })
    .where(
      and(
        eq(pushSubscriptions.businessId, businessId),
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
        isNull(pushSubscriptions.revokedAt)
      )
    )
}

export async function isEndpointSubscribed(businessId: string, userId: string, endpoint: string) {
  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.businessId, businessId),
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
        isNull(pushSubscriptions.revokedAt)
      )
    )
    .limit(1)
  return Boolean(row)
}

export async function savePushPreferences(businessId: string, userId: string, prefs: PushPreferences) {
  const now = new Date()
  await db
    .insert(pushPreferences)
    .values({ businessId, userId, ...prefs, updatedAt: now })
    .onConflictDoUpdate({ target: [pushPreferences.businessId, pushPreferences.userId], set: { ...prefs, updatedAt: now } })
}

export async function saveBusinessPushSettings(businessId: string, settings: BusinessPushSettings) {
  const now = new Date()
  await db
    .insert(businessPushSettings)
    .values({ businessId, ...settings, updatedAt: now })
    .onConflictDoUpdate({ target: businessPushSettings.businessId, set: { ...settings, updatedAt: now } })
}

export interface PushDeliveryItem {
  id: string
  event: PushEvent
  status: "pending" | "processing" | "sent" | "failed" | "skipped"
  createdAt: string
  sentAt: string | null
}

export interface PushOverview {
  available: boolean
  configured: boolean
  publicKey: string | null
  preferences: PushPreferences
  business: BusinessPushSettings
  activeDevices: number
  deliveries: PushDeliveryItem[]
}

/** Dados da seção de notificações push nas configurações (sempre do usuário logado no estabelecimento ativo). */
export async function getPushOverview(businessId: string, userId: string): Promise<PushOverview> {
  const base: PushOverview = {
    available: false,
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey(),
    preferences: DEFAULT_PUSH_PREFERENCES,
    business: DEFAULT_BUSINESS_PUSH_SETTINGS,
    activeDevices: 0,
    deliveries: [],
  }
  try {
    const [prefs, settings, devices] = await Promise.all([
      db
        .select(preferenceColumns)
        .from(pushPreferences)
        .where(and(eq(pushPreferences.businessId, businessId), eq(pushPreferences.userId, userId)))
        .limit(1),
      db
        .select({ remindersEnabled: businessPushSettings.remindersEnabled, reminderLeadMin: businessPushSettings.reminderLeadMin })
        .from(businessPushSettings)
        .where(eq(businessPushSettings.businessId, businessId))
        .limit(1),
      db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.businessId, businessId), eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt))),
    ])
    const deviceIds = devices.map((d) => d.id)
    const deliveries = deviceIds.length
      ? await db
          .select({
            id: pushDeliveries.id,
            event: pushDeliveries.event,
            status: pushDeliveries.status,
            createdAt: pushDeliveries.createdAt,
            sentAt: pushDeliveries.sentAt,
          })
          .from(pushDeliveries)
          .where(and(eq(pushDeliveries.businessId, businessId), inArray(pushDeliveries.subscriptionId, deviceIds)))
          .orderBy(desc(pushDeliveries.createdAt))
          .limit(6)
      : []
    return {
      ...base,
      available: true,
      preferences: toPreferences(prefs[0] ?? null),
      business: settings[0] ?? DEFAULT_BUSINESS_PUSH_SETTINGS,
      activeDevices: devices.length,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        event: d.event,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
      })),
    }
  } catch (error) {
    if (isMissingTable(error)) return base
    throw error
  }
}
