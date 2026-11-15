import type { SubscriptionRow } from "@/lib/db/schema"

const DAY = 86_400_000

/** Dias de teste para estabelecimentos que ainda não contrataram nenhum plano. */
export const DEFAULT_TRIAL_DAYS = Number(process.env.BILLING_TRIAL_DAYS ?? 14)
/** Tolerância após o fim do trial ou do período pago antes de bloquear. */
export const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS ?? 3)

/**
 * Com BILLING_ENFORCEMENT diferente de "on" ninguém é bloqueado: o painel só exibe avisos.
 * Permite publicar o fluxo sem travar estabelecimentos que já usam o sistema.
 */
export function isBillingEnforced() {
  return process.env.BILLING_ENFORCEMENT === "on"
}

export type BillingAccessState =
  | "courtesy"
  | "trial"
  | "active"
  | "canceling"
  | "awaiting_payment"
  | "past_due_grace"
  | "trial_grace"
  | "blocked_no_plan"
  | "blocked_unpaid"
  | "blocked_suspended"

export type BillingAccess = {
  state: BillingAccessState
  allowed: boolean
  /** Quando o acesso deixa de valer sem um pagamento confirmado. */
  until: Date | null
  /** Aviso a exibir no painel (null quando tudo está em dia). */
  notice: string | null
}

type BusinessLike = { createdAt: Date }
type SubLike = Pick<
  SubscriptionRow,
  "status" | "trialEndsAt" | "currentPeriodEnd" | "courtesyUntil" | "cancelAtPeriodEnd"
>

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)

/**
 * Regra única de acesso ao painel. Só pagamento confirmado pelo webhook muda o status para
 * "active" e estende currentPeriodEnd; nada que o navegador envie altera este resultado.
 */
export function computeBillingAccess(
  business: BusinessLike,
  sub: SubLike | null,
  now = new Date(),
  trialDays = DEFAULT_TRIAL_DAYS
): BillingAccess {
  const implicitTrialEnd = addDays(business.createdAt, trialDays)
  const paidThrough = sub?.currentPeriodEnd ?? null
  const paidValid = paidThrough !== null && paidThrough > now

  if (sub?.courtesyUntil && sub.courtesyUntil > now) {
    return { state: "courtesy", allowed: true, until: sub.courtesyUntil, notice: null }
  }

  if (!sub) {
    if (implicitTrialEnd > now) {
      return { state: "trial", allowed: true, until: implicitTrialEnd, notice: "trial" }
    }
    return { state: "blocked_no_plan", allowed: false, until: null, notice: "Seu período de teste terminou." }
  }

  switch (sub.status) {
    case "active": {
      if (sub.cancelAtPeriodEnd) return { state: "canceling", allowed: true, until: paidThrough, notice: "canceling" }
      // Renovação ainda não confirmada: tolerância curta após o fim do período pago.
      if (paidThrough && !paidValid) {
        const graceEnd = addDays(paidThrough, GRACE_DAYS)
        if (graceEnd > now) return { state: "past_due_grace", allowed: true, until: graceEnd, notice: "past_due" }
        return { state: "blocked_unpaid", allowed: false, until: null, notice: "Pagamento da renovação não confirmado." }
      }
      return { state: "active", allowed: true, until: paidThrough, notice: null }
    }
    case "trialing": {
      const trialEnd = sub.trialEndsAt ?? implicitTrialEnd
      if (trialEnd > now) return { state: "trial", allowed: true, until: trialEnd, notice: "trial" }
      const graceEnd = addDays(trialEnd, GRACE_DAYS)
      if (graceEnd > now) return { state: "trial_grace", allowed: true, until: graceEnd, notice: "trial_ended" }
      return { state: "blocked_unpaid", allowed: false, until: null, notice: "O teste terminou e o pagamento não foi confirmado." }
    }
    case "awaiting_payment":
    case "payment_pending": {
      if (paidValid) return { state: "awaiting_payment", allowed: true, until: paidThrough, notice: "payment_pending" }
      if (implicitTrialEnd > now) return { state: "awaiting_payment", allowed: true, until: implicitTrialEnd, notice: "payment_pending" }
      return { state: "blocked_unpaid", allowed: false, until: null, notice: "Aguardando a confirmação do pagamento." }
    }
    case "past_due": {
      const base = paidThrough ?? (implicitTrialEnd > now ? implicitTrialEnd : null)
      const graceEnd = base ? addDays(base, GRACE_DAYS) : null
      if (graceEnd && graceEnd > now) return { state: "past_due_grace", allowed: true, until: graceEnd, notice: "past_due" }
      return { state: "blocked_unpaid", allowed: false, until: null, notice: "Há uma cobrança em atraso." }
    }
    case "suspended":
      return { state: "blocked_suspended", allowed: false, until: null, notice: "Assinatura suspensa." }
    default:
      return { state: "blocked_no_plan", allowed: false, until: null, notice: "Nenhuma assinatura ativa." }
  }
}
