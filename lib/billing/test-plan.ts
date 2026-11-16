/**
 * Regras de visibilidade no autoatendimento (migrations 011 e 012).
 * O plano de teste interno (teste-5) foi descontinuado: não aparece e não pode ser contratado.
 * Assinaturas de teste já existentes continuam sendo tratadas pelo webhook até o encerramento.
 */
export function isPlanAvailableTo(plan: { isHidden: boolean; isTest: boolean }) {
  return !plan.isTest && !plan.isHidden
}
