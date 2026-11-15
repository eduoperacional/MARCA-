/**
 * Regras do plano de teste interno (migration 011).
 * - BILLING_TEST_EMAILS: e-mails que podem ver e contratar planos de teste.
 * - BILLING_TEST_REPEAT_EMAILS: autorização explícita para contratar o teste de novo na mesma conta.
 * Listas separadas por vírgula; comparação sem diferenciar maiúsculas.
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

export function canUseTestPlans(email: string | null | undefined, env: Env = process.env) {
  return listed(email, env.BILLING_TEST_EMAILS)
}

export function canRepeatTestPlan(email: string | null | undefined, env: Env = process.env) {
  return canUseTestPlans(email, env) && listed(email, env.BILLING_TEST_REPEAT_EMAILS)
}

/** Plano de teste só para e-mails liberados; demais planos ocultos nunca aparecem no autoatendimento. */
export function isPlanAvailableTo(
  plan: { isHidden: boolean; isTest: boolean },
  email: string | null | undefined,
  env: Env = process.env
) {
  if (plan.isTest) return canUseTestPlans(email, env)
  return !plan.isHidden
}
