import { normalizePhone, normalizeWhatsappPhone } from "@/lib/phone"

export type WhatsappEvent = "new_booking" | "cancellation" | "reschedule" | "test"

/**
 * Modelos de mensagem (templates) a criar e aprovar na Meta: categoria "Utility", idioma pt_BR.
 * Regras seguidas para reduzir reprovação: no máximo 4 variáveis, texto fixo bem maior que as
 * variáveis, nenhuma variável no início ou no fim do texto e nenhuma variável adjacente a outra.
 * O nome pode ser sobrescrito por variável de ambiente sem alterar o código.
 */
export const WHATSAPP_TEMPLATES: Record<
  WhatsappEvent,
  { envName: string; defaultName: string; body: string; example: string[] }
> = {
  new_booking: {
    envName: "WHATSAPP_TEMPLATE_NEW_BOOKING",
    defaultName: "marcai_novo_agendamento",
    body:
      "Você recebeu um novo agendamento em {{1}}.\n\nCliente: {{2}}\nServiço: {{3}}\nData e horário: {{4}}\n\n" +
      "Os detalhes estão disponíveis no painel do MARCAÍ.",
    example: ["Barbearia do Centro", "Maria Silva", "Corte feminino com João", "20/11/2026 às 14:30"],
  },
  cancellation: {
    envName: "WHATSAPP_TEMPLATE_CANCELLATION",
    defaultName: "marcai_cancelamento",
    body:
      "Um agendamento foi cancelado em {{1}}.\n\nCliente: {{2}}\nServiço: {{3}}\nHorário liberado: {{4}}\n\n" +
      "O horário já está disponível para novos agendamentos no MARCAÍ.",
    example: ["Barbearia do Centro", "Maria Silva", "Corte feminino com João", "20/11/2026 às 14:30"],
  },
  reschedule: {
    envName: "WHATSAPP_TEMPLATE_RESCHEDULE",
    defaultName: "marcai_reagendamento",
    body:
      "Um agendamento foi remarcado em {{1}}.\n\nCliente: {{2}}\nServiço: {{3}}\nNovo horário: {{4}}\n\n" +
      "Confira a agenda atualizada no painel do MARCAÍ.",
    example: ["Barbearia do Centro", "Maria Silva", "Corte feminino com João", "22/11/2026 às 10:00"],
  },
  test: {
    envName: "WHATSAPP_TEMPLATE_TEST",
    defaultName: "marcai_teste",
    body:
      "Este é um teste do MARCAÍ. Os avisos de agendamento de {{1}} serão enviados para este número.\n\n" +
      "Se você não solicitou este teste, ignore esta mensagem.",
    example: ["Barbearia do Centro"],
  },
}

/** Destino aceito pela API: 55 + DDD + número. Aceita qualquer formato de entrada. */
export function toWhatsappNumber(value: string | null | undefined) {
  const national = normalizeWhatsappPhone(value)
  return national ? `55${national}` : null
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
