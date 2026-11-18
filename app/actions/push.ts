"use server"

import { revalidatePath } from "next/cache"

import { fail } from "@/lib/actions/result"
import { authorize, NO_PERMISSION } from "@/lib/business"
import type { PushPreferences } from "@/lib/push/queue"
import {
  isMissingTable,
  isPushConfigured,
  REMINDER_LEAD_OPTIONS,
  saveBusinessPushSettings as saveBusinessSettings,
  savePushPreferences as savePreferences,
  sendPushTest,
} from "@/lib/push/service"
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit"

const UNAVAILABLE = "As notificações push ainda não estão disponíveis. Execute o script 017 no banco de dados."

/** Preferências pessoais: cada membro decide o que recebe nos próprios dispositivos. */
export async function savePushPreferences(input: PushPreferences) {
  const access = await authorize()
  if (!access) return fail(NO_PERMISSION)
  if (!(await rateLimit(`push-prefs:${access.user.id}`, 30, 60))) return fail(RATE_LIMITED)
  try {
    await savePreferences(access.business.id, access.user.id, {
      enabled: Boolean(input.enabled),
      sound: Boolean(input.sound),
      notifyNewBooking: Boolean(input.notifyNewBooking),
      notifyCancellation: Boolean(input.notifyCancellation),
      notifyReschedule: Boolean(input.notifyReschedule),
      notifyReminder: Boolean(input.notifyReminder),
    })
  } catch (error) {
    if (isMissingTable(error)) return fail(UNAVAILABLE)
    throw error
  }
  revalidatePath("/painel/configuracoes")
  return { ok: true as const }
}

/** Regra de lembretes do estabelecimento: exige permissão de configurações. */
export async function saveReminderSettings(input: { remindersEnabled: boolean; reminderLeadMin: number }) {
  const access = await authorize("settings.manage")
  if (!access) return fail(NO_PERMISSION)
  const lead = Number(input.reminderLeadMin)
  if (!(REMINDER_LEAD_OPTIONS as readonly number[]).includes(lead)) return fail("Escolha uma antecedência válida.")
  try {
    await saveBusinessSettings(access.business.id, { remindersEnabled: Boolean(input.remindersEnabled), reminderLeadMin: lead })
  } catch (error) {
    if (isMissingTable(error)) return fail(UNAVAILABLE)
    throw error
  }
  revalidatePath("/painel/configuracoes")
  return { ok: true as const }
}

export async function sendPushTestAction() {
  const access = await authorize()
  if (!access) return fail(NO_PERMISSION)
  if (!isPushConfigured()) return fail("O envio de notificações push ainda não foi configurado no servidor.")
  if (!(await rateLimit(`push-test:${access.user.id}`, 5, 60 * 10))) return fail(RATE_LIMITED)
  try {
    const business = access.business
    const result = await sendPushTest(business.id, access.user.id, business.displayName || business.name)
    revalidatePath("/painel/configuracoes")
    if (!result.devices) return fail("Ative as notificações neste dispositivo antes de enviar um teste.")
    if (!result.sent) return fail("Não conseguimos entregar o teste. Reative as notificações neste dispositivo e tente de novo.")
    return { ok: true as const, sent: result.sent, devices: result.devices }
  } catch (error) {
    if (isMissingTable(error)) return fail(UNAVAILABLE)
    throw error
  }
}
