import "server-only"

import { and, desc, eq, sql } from "drizzle-orm"
import { after } from "next/server"

import { db } from "@/lib/db"
import {
  appointments,
  businesses,
  businessWhatsappSettings,
  clients,
  professionals,
  services,
  whatsappDeliveries,
} from "@/lib/db/schema"
import { normalizeWhatsappPhone } from "@/lib/phone"
import { localParts } from "@/lib/time"
import { isWhatsappConfigured, sendWhatsappTemplate } from "@/lib/whatsapp/cloud-api"
import {
  enqueueOwnerNotification,
  processQueue,
  retryFailedDelivery,
  type AppointmentSnapshot,
  type ClaimedDelivery,
  type NotificationEvent,
  type QueueDeps,
  type QueueStore,
} from "@/lib/whatsapp/queue"
import { toWhatsappNumber } from "@/lib/whatsapp/templates"

export interface WhatsappSettings {
  phone: string | null
  enabled: boolean
  consentAt: string | null
  notifyNewBooking: boolean
  notifyCancellation: boolean
  notifyReschedule: boolean
  lastTestAt: string | null
  lastTestStatus: string | null
}

/** Sem linha salva: nada configurado e nada ativo. */
const DEFAULTS: WhatsappSettings = {
  phone: null,
  enabled: false,
  consentAt: null,
  notifyNewBooking: true,
  notifyCancellation: true,
  notifyReschedule: true,
  lastTestAt: null,
  lastTestStatus: null,
}

/** A tabela ainda não existe (script 015 não executado). */
export function isMissingTable(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } }
  return (e?.code ?? e?.cause?.code) === "42P01"
}

export async function getWhatsappSettings(businessId: string): Promise<{ available: boolean; settings: WhatsappSettings }> {
  try {
    const [row] = await db
      .select()
      .from(businessWhatsappSettings)
      .where(eq(businessWhatsappSettings.businessId, businessId))
      .limit(1)
    if (!row) return { available: true, settings: DEFAULTS }
    return {
      available: true,
      settings: {
        phone: row.phone,
        enabled: row.enabled,
        consentAt: row.consentAt?.toISOString() ?? null,
        notifyNewBooking: row.notifyNewBooking,
        notifyCancellation: row.notifyCancellation,
        notifyReschedule: row.notifyReschedule,
        lastTestAt: row.lastTestAt?.toISOString() ?? null,
        lastTestStatus: row.lastTestStatus,
      },
    }
  } catch (error) {
    if (isMissingTable(error)) return { available: false, settings: DEFAULTS }
    throw error
  }
}

/**
 * Grava as preferências. O número é sempre padronizado por normalizeWhatsappPhone e o consentimento
 * é registrado somente quando o proprietário ativa o envio; ao desativar, ele é revogado.
 */
export async function saveOwnerWhatsappPreferences(
  businessId: string,
  input: { phone: string | null; enabled: boolean; notifyNewBooking?: boolean; notifyCancellation?: boolean; notifyReschedule?: boolean }
) {
  const phone = normalizeWhatsappPhone(input.phone)
  const enabled = Boolean(input.enabled && phone)
  const values = {
    phone,
    enabled,
    consentAt: enabled ? new Date() : null,
    ...(input.notifyNewBooking === undefined ? {} : { notifyNewBooking: input.notifyNewBooking }),
    ...(input.notifyCancellation === undefined ? {} : { notifyCancellation: input.notifyCancellation }),
    ...(input.notifyReschedule === undefined ? {} : { notifyReschedule: input.notifyReschedule }),
  }
  try {
    await db
      .insert(businessWhatsappSettings)
      .values({ businessId, ...values })
      .onConflictDoUpdate({ target: businessWhatsappSettings.businessId, set: { ...values, updatedAt: new Date() } })
    return true
  } catch (error) {
    if (isMissingTable(error)) return false
    throw error
  }
}

export function getWhatsappProviderStatus() {
  return { configured: isWhatsappConfigured() }
}

/* --------------------------------- Fila --------------------------------- */

type ClaimRow = {
  id: string
  business_id: string
  appointment_id: string | null
  event: NotificationEvent
  params: string[] | null
  attempts: number
  max_attempts: number
  expires_at: Date | string
}

const store: QueueStore = {
  async getSettings(businessId) {
    const [row] = await db
      .select()
      .from(businessWhatsappSettings)
      .where(eq(businessWhatsappSettings.businessId, businessId))
      .limit(1)
    return row ?? null
  },

  async insertPending(row) {
    const [created] = await db
      .insert(whatsappDeliveries)
      .values({ ...row, status: "pending", attempts: 0 })
      .onConflictDoNothing({
        target: [whatsappDeliveries.businessId, whatsappDeliveries.dedupeKey],
        where: sql`dedupe_key IS NOT NULL`,
      })
      .returning({ id: whatsappDeliveries.id })
    return created?.id ?? null
  },

  async claim({ now, lockUntil, limit, id }) {
    const result = await db.execute<ClaimRow>(sql`
      UPDATE whatsapp_deliveries d
      SET status = 'processing',
          attempts = d.attempts + 1,
          locked_until = ${lockUntil},
          last_attempt_at = ${now},
          updated_at = ${now}
      WHERE d.id IN (
        SELECT q.id FROM whatsapp_deliveries q
        WHERE q.event <> 'test'
          AND (
            (q.status = 'pending' AND q.next_attempt_at <= ${now})
            OR (q.status = 'processing' AND q.locked_until < ${now})
          )
          ${id ? sql`AND q.id = ${id}` : sql``}
        ORDER BY q.next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING d.id, d.business_id, d.appointment_id, d.event, d.params, d.attempts, d.max_attempts, d.expires_at`)
    return result.rows.map(
      (r): ClaimedDelivery => ({
        id: r.id,
        businessId: r.business_id,
        appointmentId: r.appointment_id,
        event: r.event,
        params: Array.isArray(r.params) ? r.params : [],
        attempts: Number(r.attempts),
        maxAttempts: Number(r.max_attempts),
        expiresAt: new Date(r.expires_at),
      })
    )
  },

  async markSent(id, toPhone, messageId, now) {
    await db
      .update(whatsappDeliveries)
      .set({ status: "sent", toPhone, providerMessageId: messageId, sentAt: now, error: null, lockedUntil: null, updatedAt: now })
      .where(and(eq(whatsappDeliveries.id, id), eq(whatsappDeliveries.status, "processing")))
  },

  async scheduleRetry(id, error, nextAttemptAt, now) {
    await db
      .update(whatsappDeliveries)
      .set({ status: "pending", error, nextAttemptAt, lockedUntil: null, updatedAt: now })
      .where(and(eq(whatsappDeliveries.id, id), eq(whatsappDeliveries.status, "processing")))
  },

  async markFailed(id, error, now) {
    await db
      .update(whatsappDeliveries)
      .set({ status: "failed", error, lockedUntil: null, updatedAt: now })
      .where(and(eq(whatsappDeliveries.id, id), eq(whatsappDeliveries.status, "processing")))
  },

  async markSkipped(id, reason, now) {
    await db
      .update(whatsappDeliveries)
      .set({ status: "skipped", error: reason, lockedUntil: null, updatedAt: now })
      .where(and(eq(whatsappDeliveries.id, id), eq(whatsappDeliveries.status, "processing")))
  },

  async requeueFailed(businessId, id, now, expiresAt) {
    const rows = await db
      .update(whatsappDeliveries)
      .set({ status: "pending", attempts: 0, nextAttemptAt: now, expiresAt, error: null, lockedUntil: null, updatedAt: now })
      .where(
        and(
          eq(whatsappDeliveries.id, id),
          eq(whatsappDeliveries.businessId, businessId),
          eq(whatsappDeliveries.status, "failed"),
          sql`${whatsappDeliveries.event} <> 'test'`
        )
      )
      .returning({ id: whatsappDeliveries.id })
    return rows.length > 0
  },
}

const deps: QueueDeps = {
  store,
  sender: { isConfigured: isWhatsappConfigured, send: sendWhatsappTemplate },
  log: (message, error) => console.error(message, error),
}

function formatWhen(instant: Date) {
  const local = localParts(instant)
  return `${local.date.split("-").reverse().join("/")} às ${local.time}`
}

async function loadSnapshot(businessId: string, appointmentId: string): Promise<AppointmentSnapshot | null> {
  const [row] = await db
    .select({
      businessName: businesses.name,
      displayName: businesses.displayName,
      clientName: clients.name,
      serviceName: services.name,
      professionalName: professionals.name,
      startsAt: appointments.startsAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .innerJoin(clients, and(eq(clients.id, appointments.clientId), eq(clients.businessId, appointments.businessId)))
    .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, appointments.businessId)))
    .innerJoin(
      professionals,
      and(eq(professionals.id, appointments.professionalId), eq(professionals.businessId, appointments.businessId))
    )
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId)))
    .limit(1)
  if (!row) return null
  return {
    appointmentId,
    businessId,
    businessName: row.displayName || row.businessName,
    clientName: row.clientName,
    serviceName: row.serviceName,
    professionalName: row.professionalName,
    startsAt: row.startsAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Enfileira o aviso ao proprietário (gravado como pending dentro da requisição) e tenta enviá-lo logo
 * após a resposta. Se essa tentativa não acontecer ou falhar, o cron /api/cron/whatsapp reprocessa.
 * Nunca lança erro: o agendamento nunca depende do WhatsApp.
 */
export async function enqueueAppointmentNotification(input: { businessId: string; appointmentId: string; event: NotificationEvent }) {
  const result = await enqueueOwnerNotification(deps, {
    businessId: input.businessId,
    event: input.event,
    loadSnapshot: () => loadSnapshot(input.businessId, input.appointmentId),
    formatWhen,
  })
  if (result.status !== "queued") return result

  const job = () =>
    processQueue(deps, { id: result.id, limit: 1 }).catch((error) => console.error("[whatsapp] envio imediato falhou", error))
  try {
    after(job)
  } catch {
    void job()
  }
  return result
}

export function processWhatsappQueue(limit = 50) {
  return processQueue(deps, { limit })
}

export async function retryWhatsappDelivery(businessId: string, id: string) {
  try {
    return await retryFailedDelivery(deps, businessId, id)
  } catch (error) {
    if (isMissingTable(error)) return false
    throw error
  }
}

export interface DeliveryListItem {
  id: string
  event: string
  status: string
  attempts: number
  error: string | null
  createdAt: string
  sentAt: string | null
}

export async function listRecentDeliveries(businessId: string, limit = 10): Promise<DeliveryListItem[]> {
  try {
    const rows = await db
      .select({
        id: whatsappDeliveries.id,
        event: whatsappDeliveries.event,
        status: whatsappDeliveries.status,
        attempts: whatsappDeliveries.attempts,
        error: whatsappDeliveries.error,
        createdAt: whatsappDeliveries.createdAt,
        sentAt: whatsappDeliveries.sentAt,
      })
      .from(whatsappDeliveries)
      .where(eq(whatsappDeliveries.businessId, businessId))
      .orderBy(desc(whatsappDeliveries.createdAt))
      .limit(limit)
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    }))
  } catch (error) {
    if (isMissingTable(error)) return []
    throw error
  }
}

/** Envio de teste disparado pelo proprietário. Síncrono e fora da fila (o proprietário vê o resultado na hora). */
export async function sendWhatsappTest(businessId: string, businessName: string, phone: string) {
  const to = toWhatsappNumber(phone)
  if (!to) return { ok: false as const, reason: "invalid_phone" as const, error: "Número inválido." }
  const result = await sendWhatsappTemplate({ to, event: "test", params: [businessName] })
  const now = new Date()
  try {
    await db.insert(whatsappDeliveries).values({
      businessId,
      appointmentId: null,
      event: "test",
      toPhone: to,
      params: [businessName],
      status: result.ok ? "sent" : result.reason === "not_configured" ? "skipped" : "failed",
      attempts: 1,
      maxAttempts: 1,
      expiresAt: now,
      lastAttemptAt: now,
      sentAt: result.ok ? now : null,
      providerMessageId: result.ok ? result.messageId : null,
      error: result.ok ? null : result.error,
    })
    await db
      .update(businessWhatsappSettings)
      .set({ lastTestAt: now, lastTestStatus: result.ok ? "sent" : result.reason === "not_configured" ? "not_configured" : "failed" })
      .where(eq(businessWhatsappSettings.businessId, businessId))
  } catch (error) {
    if (!isMissingTable(error)) console.error("[whatsapp] falha ao registrar teste", error)
  }
  return result
}
