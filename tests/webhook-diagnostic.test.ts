import assert from "node:assert/strict"
import { test } from "node:test"

import { checkWebhookToken, tokenFingerprint } from "../lib/billing/webhook"
import { diagnoseWebhookToken, handleWebhookTokenDiagnostic } from "../lib/billing/webhook-diagnostic"

const TOKEN = "tok_diagnostico_0123456789abcdefghijklmnop"
const RUNTIME = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "01394d6aabbccdd" }

const allow = async () => true
const deny = async () => false

test("diagnóstico: rota recusa com 404 quem não é admin autorizado, sem expor nada", async () => {
  const res = await handleWebhookTokenDiagnostic(deny, { ...RUNTIME, ASAAS_WEBHOOK_TOKEN: TOKEN })
  assert.equal(res.status, 404)
  assert.equal(res.headers.get("cache-control"), "no-store")
  const body = await res.text()
  assert.ok(!body.includes(TOKEN))
  assert.ok(!body.includes(tokenFingerprint(TOKEN)))
})

test("diagnóstico: o token do Asaas no cabeçalho não autoriza a rota", async () => {
  let called = false
  const res = await handleWebhookTokenDiagnostic(
    async () => {
      called = true
      return false
    },
    { ...RUNTIME, ASAAS_WEBHOOK_TOKEN: TOKEN }
  )
  assert.equal(called, true)
  assert.equal(res.status, 404)
})

test("diagnóstico: admin recebe só validação, comprimento, fingerprint, ambiente e commit", async () => {
  const res = await handleWebhookTokenDiagnostic(allow, { ...RUNTIME, ASAAS_WEBHOOK_TOKEN: TOKEN })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("cache-control"), "no-store")
  const text = await res.text()
  assert.ok(!text.includes(TOKEN), "o token nunca aparece na resposta")
  const body = JSON.parse(text)
  assert.deepEqual(Object.keys(body).sort(), ["ambiente", "commit", "tokenBruto", "tokenNormalizado"])
  assert.deepEqual(Object.keys(body.tokenBruto).sort(), ["comprimento", "fingerprint", "validacao"])
  const expected = { validacao: "aprovado", comprimento: TOKEN.length, fingerprint: tokenFingerprint(TOKEN) }
  assert.deepEqual(body.tokenBruto, expected)
  assert.deepEqual(body.tokenNormalizado, expected)
  assert.equal(body.ambiente, "production")
  assert.equal(body.commit, "01394d6")
})

test("diagnóstico: token salvo com aspas reprova o bruto e aprova o normalizado", () => {
  const result = diagnoseWebhookToken({ ...RUNTIME, ASAAS_WEBHOOK_TOKEN: `"${TOKEN}"` })
  assert.equal(result.tokenBruto.validacao, "reprovado")
  assert.equal(result.tokenBruto.comprimento, TOKEN.length + 2)
  assert.equal(result.tokenNormalizado.validacao, "aprovado")
  assert.equal(result.tokenNormalizado.comprimento, TOKEN.length)
  assert.equal(result.tokenNormalizado.fingerprint, tokenFingerprint(TOKEN))
})

test("diagnóstico: prefixo, espaços e invisíveis só passam depois de normalizados", () => {
  for (const saved of [`ASAAS_WEBHOOK_TOKEN=${TOKEN}`, ` ${TOKEN}\n`, `\uFEFF${TOKEN}\u200B`]) {
    const result = diagnoseWebhookToken({ ...RUNTIME, ASAAS_WEBHOOK_TOKEN: saved })
    assert.equal(result.tokenBruto.validacao, "reprovado", JSON.stringify(saved))
    assert.equal(result.tokenNormalizado.validacao, "aprovado", JSON.stringify(saved))
    assert.equal(result.tokenNormalizado.fingerprint, tokenFingerprint(TOKEN))
  }
})

test("diagnóstico: sem ASAAS_WEBHOOK_TOKEN tudo reprova e não há fingerprint", () => {
  for (const value of [undefined, "", "   "]) {
    const result = diagnoseWebhookToken({ ASAAS_WEBHOOK_TOKEN: value })
    assert.equal(result.tokenBruto.validacao, "reprovado")
    assert.equal(result.tokenNormalizado.validacao, "reprovado")
    assert.equal(result.tokenNormalizado.comprimento, 0)
    assert.equal(result.tokenNormalizado.fingerprint, null)
    assert.equal(result.ambiente, "desconhecido")
    assert.equal(result.commit, "local")
  }
})

test("diagnóstico: o resultado é o mesmo da validação usada pelo webhook", () => {
  const saved = `"${TOKEN}"`
  const result = diagnoseWebhookToken({ ASAAS_WEBHOOK_TOKEN: saved })
  assert.equal(checkWebhookToken(saved, saved) === "ok", result.tokenBruto.validacao === "aprovado")
  assert.equal(checkWebhookToken(TOKEN, saved) === "ok", result.tokenNormalizado.validacao === "aprovado")
})
