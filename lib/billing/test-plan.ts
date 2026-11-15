/**
 * Regras do plano de teste (migration 011).
 * - Temporariamente, o plano de teste fica visível e contratável por qualquer pessoa no autoatendimento.
 * - BILLING_TEST_REPEAT_EMAILS: autorização explícita para contratar o teste de novo no mesmo estabelecimento.
 * Lista separada por vírgula; comparação sem diferenciar maiúsculas.
 */
type Env = Record<string, string | undefined>

export function parseEmailList(raw: string | null | undefined) {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  )
}

const listed = (email: string | null | undefined, raw: string | undefined) =>
  Boolean(email) && parseEmailList(raw).has(String(email).trim().toLowerCase())

export function canRepeatTestPlan(email: string | null | undefined, env: Env = process.env) {
  return listed(email, env.BILLING_TEST_REPEAT_EMAILS)
}

/** Plano de teste aberto a todos; demais planos ocultos nunca aparecem no autoatendimento. */
export function isPlanAvailableTo(plan: { isHidden: boolean; isTest: boolean }) {
  if (plan.isTest) return true
  return !plan.isHidden
}
