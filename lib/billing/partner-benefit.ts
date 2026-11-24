type PartnerBenefitBusiness = {
  billingExempt: boolean
  partnerBenefitActive: boolean
}

export function partnerBenefitGrantBlockReason(business: PartnerBenefitBusiness, hasOpenSubscription: boolean) {
  if (business.partnerBenefitActive) return "O benefício de parceiro já está ativo."
  if (business.billingExempt) return "Este estabelecimento já tem isenção de cobrança. Não é necessário conceder benefício de parceiro PRO."
  if (hasOpenSubscription) {
    return "Há uma assinatura ativa ou cancelamento pendente. Preserve a cobrança existente e encerre a assinatura pelo fluxo normal antes de conceder o benefício."
  }
  return null
}
