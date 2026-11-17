import assert from "node:assert/strict"
import { test } from "node:test"

import { isAuthorizedCronRequest } from "../lib/cron-auth"

const URL = "https://example.com/api/cron/whatsapp"
const SECRET = "segredo-de-teste"

function get(headers?: Record<string, string>) {
  return new Request(URL, { method: "GET", headers })
}

test("aceita GET com Authorization: Bearer CRON_SECRET", () => {
  assert.equal(isAuthorizedCronRequest(get({ Authorization: `Bearer ${SECRET}` }), SECRET), true)
})

test("recusa chamada sem cabeçalho Authorization", () => {
  assert.equal(isAuthorizedCronRequest(get(), SECRET), false)
})

test("recusa segredo incorreto ou com tamanho diferente", () => {
  assert.equal(isAuthorizedCronRequest(get({ Authorization: "Bearer errado" }), SECRET), false)
  assert.equal(isAuthorizedCronRequest(get({ Authorization: `Bearer ${SECRET}x` }), SECRET), false)
  assert.equal(isAuthorizedCronRequest(get({ Authorization: SECRET }), SECRET), false)
})

test("recusa tudo quando CRON_SECRET não está configurado", () => {
  assert.equal(isAuthorizedCronRequest(get({ Authorization: "Bearer " }), undefined), false)
  assert.equal(isAuthorizedCronRequest(get({ Authorization: "Bearer " }), ""), false)
})
