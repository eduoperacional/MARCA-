import "server-only"

import { and, eq } from "drizzle-orm"

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
import { localParts } from "@/lib/time"
import { isWhatsappConfigured, sendWhatsappTemplate, type SendResult } from "@/lib/whatsapp/cloud-api"
import { toWhatsappNumber, type WhatsappEvent } from "@/lib/whatsapp/templates"

export interface WhatsappSettings {
  phone: string | null
  enabled: boolean
  notifyNewBooking: boolean
  notifyCancellation: boolean
  notifyReschedule: boolean
  lastTestAt: string | null
  lastTestStatus: string | null
}

const DEFAULTS: WhatsappSettings = {
  phone: null,
  enabled: true,
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

export async function upsertWhatsappSettings(
  businessId: string,
  values: Partial<Omit<WhatsappSettings, "lastTestAt">> & { lastTestAt?: Date | null }
) {
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

async function logDelivery(entry: {
  businessId: string
  appointmentId: string | null
  event: WhatsappEvent
  toPhone: string
  result: SendResult | { ok: false; reason: "skipped"; error: string }
}) {
  try {
    await db.insert(whatsappDeliveries).values({
      businessId: entry.businessId,
      appointmentId: entry.appointmentId,
      event: entry.event,
      toPhone: entry.toPhone,
      status: entry.result.ok ? "sent" : entry.result.reason === "not_configured" || entry.result.reason === "skipped" ? "skipped" : "failed",
      providerMessageId: entry.result.ok ? entry.result.messageId : null,
      error: entry.result.ok ? null : entry.result.error,
    })
  } catch (error) {
    if (!isMissingTable(error)) console.error("[whatsapp] falha ao registrar envio", error)
  }
}

const EVENT_PREF: Record<Exclude<WhatsappEvent, "test">, keyof WhatsappSettings> = {
  new_booking: "notifyNewBooking",
  cancellation: "notifyCancellation",
  reschedule: "notifyReschedule",
}

/**
 * Envia ao proprietário a notificação de um agendamento. Nunca lança erro: qualquer falha
 * é registrada e o fluxo de agendamento segue normalmente.
 */
export async function notifyOwnerWhatsapp(input: {
  businessId: string
  appointmentId: string
  event: Exclude<WhatsappEvent, "test">
}) {
  try {
    const { available, settings } = await getWhatsappSettings(input.businessId)
    if (!available || !settings.enabled || !settings[EVENT_PREF[input.event]]) return
    const to = toWhatsappNumber(settings.phone)
    if (!to) return

    const [row] = await db
      .select({
        businessName: businesses.name,
        displayName: businesses.displayName,
        clientName: clients.name,
        serviceName: services.name,
        professionalName: professionals.name,
        startsAt: appointments.startsAt,
      })
      .from(appointments)
      .innerJoin(businesses, eq(businesses.id, appointments.businessId))
      .innerJoin(clients, and(eq(clients.id, appointments.clientId), eq(clients.businessId, appointments.businessId)))
      .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, appointments.businessId)))
      .innerJoin(
        professionals,
        and(eq(professionals.id, appointments.professionalId), eq(professionals.businessId, appointments.businessId))
      )
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.businessId, input.businessId)))
      .limit(1)
    if (!row) return

    const local = localParts(row.startsAt)
    const params = [
      row.displayName || row.businessName,
      row.clientName,
      row.serviceName,
      row.professionalName,
      local.date.split("-").reverse().join("/"),
      local.time,
    ]
    const result = await sendWhatsappTemplate({ to, event: input.event, params })
    if (!result.ok && result.reason !== "not_configured") console.error("[whatsapp] envio falhou", result.error)
    await logDelivery({ businessId: input.businessId, appointmentId: input.appointmentId, event: input.event, toPhone: to, result })
  } catch (error) {
    console.error("[whatsapp] erro inesperado ao notificar", error)
  }
}

/** Envio de teste disparado pelo proprietário. Retorna o resultado real do provedor. */
export async function sendWhatsappTest(businessId: string, businessName: string, phone: string) {
  const to = toWhatsappNumber(phone)
  if (!to) return { ok: false as const, reason: "invalid_phone" as const, error: "Número inválido." }
  const result = await sendWhatsappTemplate({ to, event: "test", params: [businessName] })
  await logDelivery({ businessId, appointmentId: null, event: "test", toPhone: to, result })
  await upsertWhatsappSettings(businessId, {
    lastTestAt: new Date(),
    lastTestStatus: result.ok ? "sent" : result.reason === "not_configured" ? "not_configured" : "failed",
  }).catch(() => false)
  return result
}
