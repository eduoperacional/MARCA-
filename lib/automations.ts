import "server-only"

import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { enqueueAppointmentNotification } from "@/lib/whatsapp/service"

export type NotificationType =
  | "appointment_created"
  | "online_booking"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "payment_received"

/**
 * Canal de mensagens para clientes (WhatsApp, SMS, e-mail). Nenhum provedor está conectado:
 * quando houver um, implemente esta interface e retorne-o em `getMessagingProvider`.
 */
export interface MessagingProvider {
  name: string
  send(message: { to: string; body: string }): Promise<void>
}

export function getMessagingProvider(): MessagingProvider | null {
  return null
}

export function getMessagingStatus() {
  const provider = getMessagingProvider()
  return { connected: provider !== null, providerName: provider?.name ?? null }
}

export async function sendClientMessage(to: string, body: string) {
  const provider = getMessagingProvider()
  if (!provider) return { sent: false as const, reason: "not_configured" as const }
  await provider.send({ to, body })
  return { sent: true as const }
}

const WHATSAPP_EVENT: Partial<Record<NotificationType, "new_booking" | "cancellation" | "reschedule">> = {
  appointment_created: "new_booking",
  online_booking: "new_booking",
  appointment_cancelled: "cancellation",
  appointment_rescheduled: "reschedule",
}

/**
 * Registra uma notificação interna para a equipe e, quando aplicável, agenda o envio por
 * WhatsApp ao proprietário (fila persistente). O enfileiramento nunca lança erro e o envio
 * acontece depois da resposta ou pelo cron, sem interromper o fluxo do agendamento.
 */
export async function notify(input: {
  businessId: string
  type: NotificationType
  title: string
  body?: string
  appointmentId?: string
}) {
  await db.insert(notifications).values({
    businessId: input.businessId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    appointmentId: input.appointmentId ?? null,
  })

  const event = WHATSAPP_EVENT[input.type]
  if (!event || !input.appointmentId) return
  await enqueueAppointmentNotification({ businessId: input.businessId, appointmentId: input.appointmentId, event })
}
