import type { BillingInterval, SubscriptionStatus, TransactionStatus } from "@/lib/db/schema"

export type Tone = "brand" | "success" | "warning" | "danger" | "muted"

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  trialing: { label: "Trial", tone: "brand" },
  active: { label: "Ativa", tone: "success" },
  awaiting_payment: { label: "Aguardando pagamento", tone: "warning" },
  payment_pending: { label: "Pagamento pendente", tone: "warning" },
  past_due: { label: "Atrasada", tone: "danger" },
  canceled: { label: "Cancelada", tone: "muted" },
  expired: { label: "Expirada", tone: "muted" },
  suspended: { label: "Suspensa", tone: "danger" },
}

export const SUBSCRIPTION_STATUSES = Object.keys(SUBSCRIPTION_STATUS) as SubscriptionStatus[]

export const TRANSACTION_STATUS: Record<TransactionStatus, { label: string; tone: Tone }> = {
  approved: { label: "Aprovado", tone: "success" },
  pending: { label: "Pendente", tone: "warning" },
  declined: { label: "Recusado", tone: "danger" },
  charged_back: { label: "Estornado", tone: "danger" },
  refunded: { label: "Reembolsado", tone: "muted" },
}

export const TRANSACTION_STATUSES = Object.keys(TRANSACTION_STATUS) as TransactionStatus[]

export const INTERVAL_LABEL: Record<BillingInterval, string> = { month: "Mensal", year: "Anual" }

export const PLAN_FEATURES: Record<string, string> = {
  online_booking: "Agendamento online",
  reports: "Relatórios",
  finance: "Financeiro",
  team: "Equipe e permissões",
  automations: "Automações",
  custom_branding: "Marca personalizada",
}

/** Família do plano de entrada; os demais planos incluem tudo o que ele oferece. */
export const BASE_PLAN_FAMILY = "start"

/**
 * Recursos do núcleo do sistema, já disponíveis em todos os planos. Uso apenas comercial:
 * não altera `plans.features` nem as permissões; os diferenciais de Pro e Elite seguem
 * sendo relatórios, financeiro, equipe, automações e marca personalizada.
 */
export const PLAN_CORE_BENEFITS = [
  "Agendamento online com link personalizado",
  "Agenda diária, semanal e mensal",
  "Bloqueio de horários e intervalos",
  "Cadastro e histórico de clientes",
  "Catálogo de serviços com preço e duração",
  "Painel com a visão geral do dia",
]

/** Lista de benefícios exibida na vitrine de planos a partir das features cadastradas. */
export function describePlanFeatures(family: string, features: string[], hasBasePlan: boolean): string[] {
  const labels = features.filter((f) => f !== "online_booking").map((f) => PLAN_FEATURES[f] ?? f)
  if (family === BASE_PLAN_FAMILY) return [...PLAN_CORE_BENEFITS, ...labels]
  if (hasBasePlan) return ["Tudo do plano Start", ...labels]
  return features.map((f) => PLAN_FEATURES[f] ?? f)
}

export const PLAN_LIMITS: Record<"professionals" | "services" | "members", string> = {
  professionals: "Profissionais ativos",
  services: "Serviços ativos",
  members: "Usuários da equipe",
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card: "Cartão de crédito",
  pix: "Pix",
  boleto: "Boleto",
  debit_card: "Cartão de débito",
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "business.suspend": "Suspendeu acesso",
  "business.reactivate": "Reativou acesso",
  "business.partner_benefit_grant": "Concedeu benefício de parceiro de divulgação",
  "business.partner_benefit_revoke": "Revogou benefício de parceiro de divulgação",
  "business.note": "Registrou observação",
  "subscription.change_plan": "Alterou plano",
  "subscription.courtesy": "Concedeu cortesia",
  "subscription.cancel": "Cancelou assinatura",
  "plan.create": "Criou plano",
  "plan.update": "Editou plano",
  "plan.toggle": "Ativou/desativou plano",
  "data.export": "Exportou dados",
}
