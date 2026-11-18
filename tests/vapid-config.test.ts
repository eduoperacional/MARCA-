import assert from "node:assert/strict"
import { test } from "node:test"

import { generateVapidKeys, isValidVapidKeys, normalizeVapidKeys, vapidConfigIssues } from "../lib/push/web-push"

const keys = generateVapidKeys()

test("aceita e-mail sem prefixo, MAILTO maiúsculo e valores entre aspas", () => {
  for (const subject of ["contato@marcai.com.br", "MAILTO:contato@marcai.com.br", '"mailto:contato@marcai.com.br"', " 'contato@marcai.com.br' "]) {
    const normalized = normalizeVapidKeys({ publicKey: `"${keys.publicKey}"`, privateKey: ` ${keys.privateKey} `, subject })
    assert.equal(normalized.subject, "mailto:contato@marcai.com.br")
    assert.equal(normalized.publicKey, keys.publicKey)
    assert.equal(normalized.privateKey, keys.privateKey)
    assert.equal(isValidVapidKeys(normalized), true)
  }
})

test("preserva subject https", () => {
  const normalized = normalizeVapidKeys({ ...keys, subject: "https://marcai.com.br" })
  assert.equal(normalized.subject, "https://marcai.com.br")
  assert.equal(isValidVapidKeys(normalized), true)
})

test("lista variáveis ausentes ou inválidas sem expor valores", () => {
  assert.deepEqual(vapidConfigIssues(normalizeVapidKeys({})), [
    "VAPID_PUBLIC_KEY ausente",
    "VAPID_PRIVATE_KEY ausente",
    "VAPID_SUBJECT ausente",
  ])
  const swapped = vapidConfigIssues({ publicKey: keys.privateKey, privateKey: keys.publicKey, subject: "mailto:a@b.com" })
  assert.equal(swapped.length, 2)
  assert.ok(swapped.every((issue) => !issue.includes(keys.privateKey) && !issue.includes(keys.publicKey)))
  assert.deepEqual(vapidConfigIssues(normalizeVapidKeys({ ...keys, subject: "contato@marcai.com.br" })), [])
})
