"use server"

import { revalidatePath } from "next/cache"

import { fail, isUuid } from "@/lib/actions/result"
import { authorize, NO_PERMISSION } from "@/lib/business"
import { normalizeWhatsappPhone } from "@/lib/phone"
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit"
import {
  getWhatsappProviderStatus,
  retryWhatsappDelivery,
  saveOwnerWhatsappPreferences,
  sendWhatsappTest,
} from "@/lib/whatsapp/service"

const UNAVAILABLE = "A configuração de WhatsApp ainda não está disponível. Execute o script 015 no banco de dados."

export interface WhatsappSettingsInput {
  phone: string
  enabled: boolean
  notifyNewBooking: boolean
  notifyCancellation: boolean
  notifyReschedule: boolean
}

export async function saveWhatsappSettings(input: WhatsappSettingsInput) {
  const access = await authorize("settings.manage")
  if (!access) return fail(NO_PERMISSION)
  if (!(await rateLimit(`whatsapp-settings:${access.user.id}`, 30, 60))) return fail(RATE_LIMITED)

  const raw = String(input.phone ?? "").trim()
  const phone = normalizeWhatsappPhone(raw)
  if (raw && !phone) return fail("Informe um WhatsApp válido com DDD. Ex.: (11) 98888-7777")
  if (input.enabled && !phone) return fail("Informe o número que vai receber as notificações.")

  const saved = await saveOwnerWhatsappPreferences(access.business.id, {
    phone,
    enabled: Boolean(input.enabled),
    notifyNewBooking: Boolean(input.notifyNewBooking),
    notifyCancellation: Boolean(input.notifyCancellation),
    notifyReschedule: Boolean(input.notifyReschedule),
  })
  if (!saved) return fail(UNAVAILABLE)
  revalidatePath("/painel/configuracoes")
  return { ok: true as const }
}

export async function testWhatsappNotification(phone: string) {
  const access = await authorize("settings.manage")
  if (!access) return fail(NO_PERMISSION)
  if (!(await rateLimit(`whatsapp-test:${access.business.id}`, 5, 60 * 10))) return fail(RATE_LIMITED)
  if (!normalizeWhatsappPhone(phone)) return fail("Informe um WhatsApp válido com DDD antes de testar.")
  if (!getWhatsappProviderStatus().configured) {
    return fail("O envio por WhatsApp ainda não foi ativado pelo MARCAÍ. Seu número fica salvo para quando ativarmos.")
  }

  const business = access.business
  const result = await sendWhatsappTest(business.id, business.displayName || business.name, phone)
  revalidatePath("/painel/configuracoes")
  if (!result.ok) {
    if (result.reason === "invalid_phone") return fail("Número inválido.")
    return fail("Não conseguimos entregar a mensagem de teste. Confira se o número tem WhatsApp ativo e tente novamente.")
  }
  return { ok: true as const }
}

/** Reprocessa uma entrega com falha. Só funciona para entregas do estabelecimento ativo. */
export async function retryWhatsappDeliveryAction(id: string) {
  if (!isUuid(id)) return fail("Entrega inválida.")
  const access = await authorize("settings.manage")
  if (!access) return fail(NO_PERMISSION)
  if (!(await rateLimit(`whatsapp-retry:${access.business.id}`, 20, 60 * 10))) return fail(RATE_LIMITED)
  if (!getWhatsappProviderStatus().configured) return fail("O envio por WhatsApp ainda não foi ativado pelo MARCAÍ.")

  const ok = await retryWhatsappDelivery(access.business.id, id)
  if (!ok) return fail("Esta entrega não pode ser reenviada.")
  revalidatePath("/painel/configuracoes")
  return { ok: true as const }
}
