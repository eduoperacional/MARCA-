import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { computeBillingAccess } from "@/lib/billing/access"
import { partnerBenefitGrantBlockReason } from "@/lib/billing/partner-benefit"

describe("benefício de parceiro PRO", () => {
  test("permite concessão somente a estabelecimento elegível e sem assinatura aberta", () => {
    assert.equal(partnerBenefitGrantBlockReason({ billingExempt: false, partnerBenefitActive: false }, false), null)
    assert.match(
      partnerBenefitGrantBlockReason({ billingExempt: false, partnerBenefitActive: false }, true) ?? "",
      /assinatura ativa ou cancelamento pendente/
    )
    assert.match(
      partnerBenefitGrantBlockReason({ billingExempt: true, partnerBenefitActive: false }, false) ?? "",
      /isenção de cobrança/
    )
  })

  test("não permite conceder novamente um benefício ativo", () => {
    assert.match(
      partnerBenefitGrantBlockReason({ billingExempt: false, partnerBenefitActive: true }, false) ?? "",
      /já está ativo/
    )
  })

  test("mantém o painel liberado sem assinatura mesmo após o trial", () => {
    const access = computeBillingAccess(
      { createdAt: new Date("2020-01-01T00:00:00Z"), partnerBenefitActive: true },
      null,
      new Date("2026-11-24T00:00:00Z")
    )

    assert.deepEqual(access, { state: "partner", allowed: true, until: null, notice: null })
  })

  test("benefício revogado retorna às regras normais de acesso", () => {
    const access = computeBillingAccess(
      { createdAt: new Date("2020-01-01T00:00:00Z"), partnerBenefitActive: false },
      null,
      new Date("2026-11-24T00:00:00Z")
    )

    assert.equal(access.allowed, false)
    assert.equal(access.state, "blocked_no_plan")
  })
})
