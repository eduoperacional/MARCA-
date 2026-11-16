import assert from "node:assert/strict"
import { test } from "node:test"
import { buildTemplatePayload, cleanTemplateParam, maskBrazilPhone, toWhatsappNumber } from "../lib/whatsapp/templates"

test("toWhatsappNumber aceita celular e fixo com DDD e adiciona 55", () => {
  assert.equal(toWhatsappNumber("(11) 98888-7777"), "5511988887777")
  assert.equal(toWhatsappNumber("1133334444"), "551133334444")
})

test("toWhatsappNumber rejeita números incompletos ou vazios", () => {
  assert.equal(toWhatsappNumber("98888-7777"), null)
  assert.equal(toWhatsappNumber(""), null)
  assert.equal(toWhatsappNumber(null), null)
})

test("maskBrazilPhone formata progressivamente", () => {
  assert.equal(maskBrazilPhone(""), "")
  assert.equal(maskBrazilPhone("11"), "(11")
  assert.equal(maskBrazilPhone("119888"), "(11) 9888")
  assert.equal(maskBrazilPhone("1133334444"), "(11) 3333-4444")
  assert.equal(maskBrazilPhone("11988887777"), "(11) 98888-7777")
  assert.equal(maskBrazilPhone("119888877779999"), "(11) 98888-7777")
})

test("cleanTemplateParam remove quebras de linha e nunca fica vazio", () => {
  assert.equal(cleanTemplateParam("Corte\n\tde   cabelo"), "Corte de cabelo")
  assert.equal(cleanTemplateParam("   "), "-")
})

test("buildTemplatePayload monta o corpo da API oficial", () => {
  const payload = buildTemplatePayload({ to: "5511988887777", templateName: "marcai_teste", language: "pt_BR", params: ["Barbearia"] })
  assert.equal(payload.messaging_product, "whatsapp")
  assert.equal(payload.type, "template")
  assert.equal(payload.template.language.code, "pt_BR")
  assert.deepEqual(payload.template.components, [{ type: "body", parameters: [{ type: "text", text: "Barbearia" }] }])
})
