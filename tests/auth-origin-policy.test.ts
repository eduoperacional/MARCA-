import assert from "node:assert/strict"
import { test } from "node:test"

import {
  getAuthBaseURL,
  getTrustedAuthOrigins,
  LEGACY_PRODUCTION_ORIGIN,
  OFFICIAL_PRODUCTION_ORIGIN,
} from "../lib/auth-origin-policy"

test("production trusts the official and legacy MARCAÍ origins, not arbitrary domains", () => {
  const origins = getTrustedAuthOrigins({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "marcai-ruby.vercel.app",
  })

  assert.deepEqual(origins, [
    OFFICIAL_PRODUCTION_ORIGIN,
    LEGACY_PRODUCTION_ORIGIN,
    "https://marcai-ruby.vercel.app",
  ])
  assert.equal(origins.includes("https://attacker.example"), false)
  assert.equal(getAuthBaseURL({ VERCEL_ENV: "production" }), OFFICIAL_PRODUCTION_ORIGIN)
})

test("preview trusts only its exact deployment origin and uses it as base URL", () => {
  const env = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_URL: "marcai-git-fix-auth.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "marcai-ruby.vercel.app",
  }

  assert.deepEqual(getTrustedAuthOrigins(env), ["https://marcai-git-fix-auth.vercel.app"])
  assert.equal(getAuthBaseURL(env), "https://marcai-git-fix-auth.vercel.app")
  assert.equal(getTrustedAuthOrigins(env).includes(OFFICIAL_PRODUCTION_ORIGIN), false)
})

test("development preserves localhost and exact v0 runtime origins", () => {
  assert.deepEqual(
    getTrustedAuthOrigins({ NODE_ENV: "development", V0_RUNTIME_URL: "https://preview.example" }),
    ["http://localhost:3000", "https://preview.example"],
  )
  assert.equal(getAuthBaseURL({ NODE_ENV: "development", V0_RUNTIME_URL: "https://preview.example" }), "https://preview.example")
})

test("production canonical origin takes precedence over a stale Better Auth URL", () => {
  assert.equal(
    getAuthBaseURL({ BETTER_AUTH_URL: LEGACY_PRODUCTION_ORIGIN, VERCEL_ENV: "production" }),
    OFFICIAL_PRODUCTION_ORIGIN,
  )
  assert.equal(getAuthBaseURL({ BETTER_AUTH_URL: "https://auth.example", VERCEL_ENV: "preview" }), "https://auth.example")
})
