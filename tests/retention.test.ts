import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"

import { allowBookingForPhone, PUBLIC_BOOKING_LIMITS, type QueryExec } from "@/lib/booking-guard"
import { hashPhoneForRateLimit, legacyPhoneRateLimitKeys, phoneRateLimitKeys, rateLimitSecret } from "@/lib/rate-limit-keys"
import { deleteBatchSql, RETENTION_TABLES, RETENTION_TASKS, runRetentionCleanup } from "@/lib/retention"

const BASE_SQL = fs.readFileSync(path.join(process.cwd(), "tests", "billing.test.ts"), "utf8").match(/const BASE_SQL = `([\s\S]*?)`/)![1]
const SCRIPTS_DIR = path.join(process.cwd(), "scripts")
const TEMPLATES = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]

async function freshDb() {
  const pg = new PGlite({ extensions: { btree_gist } })
  await pg.exec(BASE_SQL)
  for (const file of fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith(".sql") && !TEMPLATES.includes(f)).sort()) {
    await pg.exec(fs.readFileSync(path.join(SCRIPTS_DIR, file), "utf8"))
  }
  const exec: QueryExec = { query: async (sql, params) => ({ rows: (await pg.query(sql, params)).rows }) }
  return { pg, exec }
}

const NOW = new Date("2026-11-18T12:00:00Z")
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60_000)
const SECRET = "test-secret"

const PROTECTED_TABLES = [
  "clients",
  "appointments",
  "payments",
  "expenses",
  "billing_transactions",
  "billing_webhook_events",
  "admin_audit_log",
] as const

describe("política de retenção", () => {
  test("só tabelas técnicas temporárias entram na limpeza", () => {
    const forbidden = [...PROTECTED_TABLES, "subscriptions", "subscription_events", "legal_acceptances", "businesses", "user"]
    for (const task of RETENTION_TASKS) {
      assert.ok((RETENTION_TABLES as readonly string[]).includes(task.table))
      const sql = deleteBatchSql(task, 10)
      for (const table of forbidden) assert.doesNotMatch(sql, new RegExp(`\\b${table}\\b`))
    }
  })
})

describe("limpeza automática (Postgres real)", () => {
  let pg: PGlite
  let exec: QueryExec
  let businessId: string
  const ids: Record<string, string> = {}

  before(async () => {
    ;({ pg, exec } = await freshDb())
    const one = async (sql: string, params: unknown[] = []) => (await pg.query<{ id: string }>(sql, params)).rows[0]?.id
    businessId = (await one(`insert into businesses (name, slug) values ('Salão', 'salao') returning id`))!
    const userId = "user-1"
    await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1, 'Dono', 'dono@x.com', true)`, [userId])
    const professionalId = await one(`insert into professionals (business_id, name) values ($1, 'Ana') returning id`, [businessId])
    const serviceId = await one(
      `insert into services (business_id, name, price_cents, duration_min) values ($1, 'Corte', 5000, 30) returning id`,
      [businessId]
    )
    const clientId = await one(
      `insert into clients (business_id, name, phone, phone_normalized, created_at) values ($1, 'Bia', '(11) 99999-0000', '11999990000', $2) returning id`,
      [businessId, daysAgo(900)]
    )
    await pg.query(
      `insert into appointments (business_id, professional_id, service_id, client_id, starts_at, ends_at, status)
       values ($1, $2, $3, $4, $5, $5::timestamptz + interval '30 minutes', 'completed')`,
      [businessId, professionalId, serviceId, clientId, daysAgo(800)]
    )
    await pg.query(`insert into payments (business_id, method, amount_cents) values ($1, 'pix', 5000)`, [businessId])
    await pg.query(`insert into expenses (business_id, date, amount_cents, description) values ($1, '2024-01-10', 900, 'Luz')`, [businessId])
    await pg.query(
      `insert into billing_transactions (business_id, gateway, gateway_transaction_id, amount_cents, status, created_at)
       values ($1, 'asaas', 'pay_1', 4990, 'approved', $2)`,
      [businessId, daysAgo(700)]
    )
    await pg.query(
      `insert into billing_webhook_events (gateway, event_id, event_type, payload, received_at) values ('asaas', 'evt_1', 'PAYMENT_RECEIVED', '{}', $1)`,
      [daysAgo(700)]
    )
    await pg.query(
      `insert into admin_audit_log (actor_user_id, actor_email, action, target_type, created_at) values ('u1', 'a@x.com', 'suspend', 'business', $1)`,
      [daysAgo(700)]
    )

    // Rate limit: janela vencida há 2 h (sai), vencida há 10 min (fica pela folga), vigente (fica).
    await pg.query(`insert into app_rate_limits (key, count, reset_at) values ('old', 3, $1), ('grace', 1, $2), ('live', 1, $3)`, [
      new Date(NOW.getTime() - 2 * 60 * 60_000),
      new Date(NOW.getTime() - 10 * 60_000),
      new Date(NOW.getTime() + 60 * 60_000),
    ])

    const invite = (label: string, expires: Date, extra: { accepted?: Date; revoked?: Date } = {}) =>
      one(
        `insert into invitations (business_id, email, role, token_hash, invited_by, expires_at, accepted_at, revoked_at)
         values ($1, $2, 'professional', $3, $7, $4, $5, $6) returning id`,
        [businessId, `${label}@x.com`, `hash-${label}`, expires, extra.accepted ?? null, extra.revoked ?? null, userId]
      ).then((id) => (ids[`invite:${label}`] = id!))
    await invite("expired-long-ago", daysAgo(40))
    await invite("expired-recently", daysAgo(5))
    await invite("revoked-long-ago", daysAgo(-3), { revoked: daysAgo(45) })
    await invite("accepted-long-ago", daysAgo(400), { accepted: daysAgo(405) })
    await invite("pending", daysAgo(-5))

    const whatsapp = (label: string, status: string, updatedAt: Date, expiresAt: Date) =>
      one(
        `insert into whatsapp_deliveries (business_id, event, to_phone, status, updated_at, expires_at)
         values ($1, 'new_booking', '5511999990000', $2, $3, $4) returning id`,
        [businessId, status, updatedAt, expiresAt]
      ).then((id) => (ids[`wa:${label}`] = id!))
    await whatsapp("sent-old", "sent", daysAgo(31), daysAgo(24))
    await whatsapp("failed-old", "failed", daysAgo(40), daysAgo(33))
    await whatsapp("skipped-old", "skipped", daysAgo(60), daysAgo(53))
    await whatsapp("sent-recent", "sent", daysAgo(3), daysAgo(-4))
    await whatsapp("failed-recent", "failed", daysAgo(10), daysAgo(3))
    await whatsapp("pending-stale", "pending", daysAgo(40), daysAgo(35))
    await whatsapp("pending-live", "pending", daysAgo(1), daysAgo(-6))
    await whatsapp("processing-old", "processing", daysAgo(40), daysAgo(35))

    const subscriptionId = await one(
      `insert into push_subscriptions (business_id, user_id, endpoint, p256dh, auth) values ($1, $2, 'https://push.example/1', 'k', 'a') returning id`,
      [businessId, userId]
    )
    const push = (label: string, status: string, updatedAt: Date, expiresAt: Date) =>
      one(
        `insert into push_deliveries (business_id, subscription_id, event, payload, dedupe_key, status, updated_at, expires_at)
         values ($1, $2, 'new_booking', '{"title":"x"}', $3, $4, $5, $6) returning id`,
        [businessId, subscriptionId, `dk-${label}`, status, updatedAt, expiresAt]
      ).then((id) => (ids[`push:${label}`] = id!))
    await push("sent-old", "sent", daysAgo(31), daysAgo(30))
    await push("sent-recent", "sent", daysAgo(2), daysAgo(1))
    await push("processing-old", "processing", daysAgo(40), daysAgo(39))
  })

  const exists = async (table: string, id: string) => (await pg.query(`select 1 from ${table} where id = $1`, [id])).rows.length === 1

  test("remove o que venceu, preserva o restante e não toca em dados de negócio", async () => {
    const counts = async () =>
      Object.fromEntries(
        await Promise.all(
          PROTECTED_TABLES.map(async (t) => [t, Number((await pg.query<{ n: number }>(`select count(*)::int n from ${t}`)).rows[0].n)])
        )
      )
    const before = await counts()
    for (const t of PROTECTED_TABLES) assert.equal(before[t], 1, `${t} deveria ter 1 linha antes`)

    const summary = await runRetentionCleanup(exec, { now: NOW, batchSize: 2 })

    assert.deepEqual(
      Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.status])),
      { rate_limits: "ok", invitations: "ok", whatsapp_deliveries: "ok", push_deliveries: "ok" }
    )
    assert.equal(summary.rate_limits.deleted, 1)
    assert.equal(summary.invitations.deleted, 2)
    assert.equal(summary.whatsapp_deliveries.deleted, 4)
    assert.equal(summary.push_deliveries.deleted, 1)

    const keys = (await pg.query<{ key: string }>(`select key from app_rate_limits order by key`)).rows.map((r) => r.key)
    assert.deepEqual(keys, ["grace", "live"])

    assert.equal(await exists("invitations", ids["invite:expired-long-ago"]), false)
    assert.equal(await exists("invitations", ids["invite:revoked-long-ago"]), false)
    assert.equal(await exists("invitations", ids["invite:expired-recently"]), true)
    assert.equal(await exists("invitations", ids["invite:accepted-long-ago"]), true)
    assert.equal(await exists("invitations", ids["invite:pending"]), true)

    for (const gone of ["sent-old", "failed-old", "skipped-old", "pending-stale"]) {
      assert.equal(await exists("whatsapp_deliveries", ids[`wa:${gone}`]), false, gone)
    }
    for (const kept of ["sent-recent", "failed-recent", "pending-live", "processing-old"]) {
      assert.equal(await exists("whatsapp_deliveries", ids[`wa:${kept}`]), true, kept)
    }
    assert.equal(await exists("push_deliveries", ids["push:sent-old"]), false)
    assert.equal(await exists("push_deliveries", ids["push:sent-recent"]), true)
    assert.equal(await exists("push_deliveries", ids["push:processing-old"]), true)

    assert.deepEqual(await counts(), before)

    const again = await runRetentionCleanup(exec, { now: NOW })
    assert.ok(Object.values(again).every((r) => r.deleted === 0), "segunda execução não remove nada")
  })

  test("tabela ausente não interrompe as demais tarefas", async () => {
    const { pg: bare } = { pg: new PGlite() }
    await bare.exec(`create table app_rate_limits (key text primary key, count int not null, reset_at timestamptz not null)`)
    await bare.query(`insert into app_rate_limits values ('old', 1, now() - interval '1 day')`)
    const summary = await runRetentionCleanup({ query: async (sql, params) => ({ rows: (await bare.query(sql, params)).rows }) })
    assert.deepEqual(summary.rate_limits, { deleted: 1, status: "ok" })
    assert.equal(summary.invitations.status, "missing_table")
    assert.equal(summary.push_deliveries.status, "missing_table")
  })

  test("log de erro não contém dados da linha", async () => {
    const messages: string[] = []
    const failing: QueryExec = {
      query: async () => {
        throw Object.assign(new Error('violates constraint: phone "11999990000"'), { code: "23503" })
      },
    }
    const summary = await runRetentionCleanup(failing, { log: (m) => messages.push(m) })
    assert.ok(Object.values(summary).every((r) => r.status === "error"))
    assert.equal(messages.length, 4)
    for (const m of messages) assert.doesNotMatch(m, /1199999/)
  })
})

describe("rate limit por telefone com hash", () => {
  const phone = "11988887777"
  let pg: PGlite
  let exec: QueryExec
  const businessId = "00000000-0000-0000-0000-000000000001"

  before(async () => {
    ;({ pg, exec } = await freshDb())
  })

  test("o hash é estável, depende do segredo e não contém o telefone", () => {
    const a = hashPhoneForRateLimit(businessId, phone, SECRET)
    assert.equal(a, hashPhoneForRateLimit(businessId, phone, SECRET))
    assert.notEqual(a, hashPhoneForRateLimit(businessId, phone, "outro-segredo"))
    assert.notEqual(a, hashPhoneForRateLimit("outro-negocio", phone, SECRET))
    const keys = phoneRateLimitKeys(businessId, phone, SECRET)
    assert.ok(!keys.short.includes(phone) && !keys.daily.includes(phone))
  })

  test("segredo obrigatório em produção", () => {
    assert.throws(() => rateLimitSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv))
    assert.equal(rateLimitSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: "s" } as NodeJS.ProcessEnv), "s")
  })

  test("novas chaves não gravam o telefone em texto puro", async () => {
    assert.equal(await allowBookingForPhone(exec, businessId, phone, SECRET), true)
    const { rows } = await pg.query<{ key: string }>(`select key from app_rate_limits`)
    assert.equal(rows.length, 2)
    for (const r of rows) assert.ok(!r.key.includes(phone), r.key)
  })

  test("tentativas vigentes no formato antigo continuam contando", async () => {
    const other = "11977776666"
    const legacy = legacyPhoneRateLimitKeys(businessId, other)
    const max = PUBLIC_BOOKING_LIMITS.phoneShort.max
    await pg.query(
      `insert into app_rate_limits (key, count, reset_at) values ($1, $2, now() + interval '1 hour'), ($3, $2, now() + interval '1 day')`,
      [legacy.short, max - 1, legacy.daily]
    )
    assert.equal(await allowBookingForPhone(exec, businessId, other, SECRET), true)
    assert.equal(await allowBookingForPhone(exec, businessId, other, SECRET), false)

    const nobody = (await pg.query<{ n: number }>(`select count(*)::int n from app_rate_limits where key like '%' || $1 || '%' and key not in ($2, $3)`, [other, legacy.short, legacy.daily])).rows[0].n
    assert.equal(nobody, 0, "nenhuma chave nova com telefone em texto puro")
  })

  test("chaves antigas vencidas não bloqueiam e são removidas pela limpeza", async () => {
    const third = "11966665555"
    const legacy = legacyPhoneRateLimitKeys(businessId, third)
    await pg.query(`insert into app_rate_limits (key, count, reset_at) values ($1, 99, now() - interval '2 hours')`, [legacy.short])
    assert.equal(await allowBookingForPhone(exec, businessId, third, SECRET), true)
    await runRetentionCleanup(exec)
    const { rows } = await pg.query(`select 1 from app_rate_limits where key = $1`, [legacy.short])
    assert.equal(rows.length, 0)
  })
})
