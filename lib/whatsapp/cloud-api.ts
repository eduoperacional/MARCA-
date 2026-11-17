import "server-only"

import { isRetryableProviderError, type SendResult } from "@/lib/whatsapp/queue"
import { buildTemplatePayload, WHATSAPP_TEMPLATES, type WhatsappEvent } from "@/lib/whatsapp/templates"

export type { SendResult }

/**
 * Cliente da WhatsApp Business Cloud API (oficial, Meta). O MARCAÍ é o remetente único;
 * o proprietário é apenas destinatário. Sem as credenciais abaixo, nada é enviado.
 */
function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return null
  return {
    token,
    phoneNumberId,
    version: process.env.WHATSAPP_API_VERSION || "v23.0",
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR",
  }
}

export function isWhatsappConfigured() {
  return config() !== null
}

export async function sendWhatsappTemplate(input: { to: string; event: WhatsappEvent; params: string[] }): Promise<SendResult> {
  const cfg = config()
  if (!cfg) return { ok: false, reason: "not_configured", error: "Provedor de WhatsApp não configurado.", retryable: false }

  const template = WHATSAPP_TEMPLATES[input.event]
  const templateName = process.env[template.envName] || template.defaultName
  const payload = buildTemplatePayload({ to: input.to, templateName, language: cfg.language, params: input.params })

  try {
    const response = await fetch(`https://graph.facebook.com/${cfg.version}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    const data = (await response.json().catch(() => null)) as {
      messages?: { id?: string }[]
      error?: { message?: string; code?: number; error_data?: { details?: string } }
    } | null
    if (!response.ok) {
      const e = data?.error
      const detail = [e?.code, e?.message, e?.error_data?.details].filter(Boolean).join(" - ")
      return {
        ok: false,
        reason: "provider_error",
        error: (detail || `HTTP ${response.status}`).slice(0, 500),
        retryable: isRetryableProviderError(response.status, e?.code),
      }
    }
    return { ok: true, messageId: data?.messages?.[0]?.id ?? null }
  } catch (error) {
    return { ok: false, reason: "network_error", error: String((error as Error)?.message ?? error).slice(0, 500), retryable: true }
  }
}
