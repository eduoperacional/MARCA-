import assert from "node:assert/strict"
import { describe, test } from "node:test"

import pg from "pg"

import { normalizeSslMode } from "@/lib/db/connection-string"

const BASE = "postgresql://user:p%40ss@ep-x-pooler.sa-east-1.aws.neon.tech/neondb"

describe("normalizeSslMode", () => {
  for (const mode of ["prefer", "require", "verify-ca"]) {
    test(`${mode} vira verify-full preservando os demais parâmetros`, () => {
      const out = normalizeSslMode(`${BASE}?sslmode=${mode}&channel_binding=require`)!
      const url = new URL(out)
      assert.equal(url.searchParams.get("sslmode"), "verify-full")
      assert.equal(url.searchParams.get("channel_binding"), "require")
      assert.equal(url.password, "p%40ss")
      assert.equal(url.hostname, "ep-x-pooler.sa-east-1.aws.neon.tech")
    })
  }

  test("o pg mantém TLS verificado e não emite o aviso de segurança", () => {
    const warnings: string[] = []
    const original = process.emitWarning
    process.emitWarning = ((w: string | Error) => {
      warnings.push(String(w))
    }) as typeof process.emitWarning
    try {
      const client = new pg.Client({ connectionString: normalizeSslMode(`${BASE}?sslmode=require`) })
      const ssl = (client as unknown as { ssl: boolean | { rejectUnauthorized?: boolean } }).ssl
      assert.ok(ssl)
      assert.notEqual(typeof ssl === "object" ? ssl.rejectUnauthorized : undefined, false)
    } finally {
      process.emitWarning = original
    }
    assert.deepEqual(warnings.filter((w) => w.includes("SECURITY WARNING")), [])
  })

  test("não altera verify-full, disable, ausência de sslmode nem uselibpqcompat", () => {
    for (const s of [
      `${BASE}?sslmode=verify-full`,
      `${BASE}?sslmode=disable`,
      BASE,
      `${BASE}?uselibpqcompat=true&sslmode=require`,
    ]) {
      assert.equal(normalizeSslMode(s), s)
    }
  })

  test("valores vazios ou inválidos passam intactos", () => {
    assert.equal(normalizeSslMode(undefined), undefined)
    assert.equal(normalizeSslMode(""), "")
    assert.equal(normalizeSslMode("not a url"), "not a url")
  })
})
