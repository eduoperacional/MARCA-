import "server-only"

import { db } from "@/lib/db"
import { notifications } from "@/lib/db/schema"

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

/** Registra uma notificação interna para a equipe do estabelecimento. */
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
}
