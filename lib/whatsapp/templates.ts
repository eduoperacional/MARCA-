import { normalizePhone } from "@/lib/phone"

export type WhatsappEvent = "new_booking" | "cancellation" | "reschedule" | "test"

/**
 * Modelos de mensagem (templates) que precisam ser criados e aprovados na Meta, categoria "Utility",
 * idioma pt_BR. O nome pode ser sobrescrito por variável de ambiente sem alterar o código.
 * O texto em `body` é o conteúdo exato a cadastrar no WhatsApp Manager.
 */
export const WHATSAPP_TEMPLATES: Record<WhatsappEvent, { envName: string; defaultName: string; body: string }> = {
  new_booking: {
    envName: "WHATSAPP_TEMPLATE_NEW_BOOKING",
    defaultName: "marcai_novo_agendamento",
    body: "Novo agendamento em {{1}}: {{2}} marcou {{3}} com {{4}} para {{5}} às {{6}}.",
  },
  cancellation: {
    envName: "WHATSAPP_TEMPLATE_CANCELLATION",
    defaultName: "marcai_cancelamento",
    body: "Agendamento cancelado em {{1}}: {{2}} - {{3}} com {{4}}, que seria em {{5}} às {{6}}. O horário foi liberado.",
  },
  reschedule: {
    envName: "WHATSAPP_TEMPLATE_RESCHEDULE",
    defaultName: "marcai_reagendamento",
    body: "Agendamento remarcado em {{1}}: {{2}} - {{3}} com {{4}} agora é em {{5}} às {{6}}.",
  },
  test: {
    envName: "WHATSAPP_TEMPLATE_TEST",
    defaultName: "marcai_teste",
    body: "Teste do MARCAÍ: as notificações de {{1}} chegarão neste WhatsApp.",
  },
}

/** Converte um telefone brasileiro (com DDD) para o formato aceito pela API: 55 + DDD + número. */
export function toWhatsappNumber(value: string | null | undefined) {
  const digits = normalizePhone(value ?? "")
  if (digits.length !== 10 && digits.length !== 11) return null
  return `55${digits}`
}

/** Parâmetros de template não podem ter quebras de linha, tabulações ou mais de 4 espaços seguidos. */
export function cleanTemplateParam(value: string) {
  const text = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200)
  return text || "-"
}

export function buildTemplatePayload(input: { to: string; templateName: string; language: string; params: string[] }) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.language },
      components: input.params.length
        ? [{ type: "body", parameters: input.params.map((text) => ({ type: "text", text: cleanTemplateParam(text) })) }]
        : [],
    },
  }
}

/** Máscara de exibição enquanto o usuário digita: (11) 98888-7777. */
export function maskBrazilPhone(value: string) {
  const d = normalizePhone(value).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
