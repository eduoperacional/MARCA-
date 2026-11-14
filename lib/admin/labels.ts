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
  "business.note": "Registrou observação",
  "subscription.change_plan": "Alterou plano",
  "subscription.courtesy": "Concedeu cortesia",
  "subscription.cancel": "Cancelou assinatura",
  "plan.create": "Criou plano",
  "plan.update": "Editou plano",
  "plan.toggle": "Ativou/desativou plano",
  "data.export": "Exportou dados",
}
