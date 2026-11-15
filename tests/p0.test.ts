import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { allowBookingForPhone, allowBookingFromIp, consumeRateLimit, isPublicBookingBlocked, type QueryExec } from "@/lib/booking-guard"
import { persistProfessional, persistService } from "@/lib/catalog-links"
import * as schema from "@/lib/db/schema"
import type { Permission } from "@/lib/permissions"
import { BLOCK_NO_PERMISSION, canManageTimeBlock, insertTimeBlock, removeTimeBlock, type BlockActor } from "@/lib/time-blocks"

const BASE_SQL = fs.readFileSync(path.join(process.cwd(), "tests", "billing.test.ts"), "utf8").match(/const BASE_SQL = `([\s\S]*?)`/)![1]

let pg: PGlite
let db: BillingDb
let exec: QueryExec

before(async () => {
  pg = new PGlite()
  await pg.exec(BASE_SQL)
  const dir = path.join(process.cwd(), "scripts")
  const templates = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !templates.includes(f)).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
  }
  db = drizzle(pg, { schema }) as unknown as BillingDb
  exec = { query: (sql, params) => pg.query(sql, params) }
})

async function newBusiness() {
  const [b] = await db.insert(schema.businesses).values({ name: "Teste", slug: `b-${crypto.randomUUID()}`, openingHours: [] }).returning()
  return b
}

async function newProfessional(businessId: string, name = "Ana") {
  const [p] = await db.insert(schema.professionals).values({ businessId, name, workSchedule: [] }).returning()
  return p
}

async function newService(businessId: string, name = "Corte") {
  const [s] = await db.insert(schema.services).values({ businessId, name, priceCents: 5000, durationMin: 30 }).returning()
  return s
}

async function linksOf(where: { professionalId?: string; serviceId?: string }) {
  const rows = await db.select().from(schema.professionalServices)
  return rows.filter(
    (r) => (!where.professionalId || r.professionalId === where.professionalId) && (!where.serviceId || r.serviceId === where.serviceId)
  )
}

const profValues = (name: string) => ({ name, color: "#7B3FF2", workSchedule: [], active: true })
const serviceValues = (name: string) => ({ name, category: "Geral", priceCents: 5000, durationMin: 30, active: true })

describe("vínculos profissional/serviço entre tenants", () => {
  test("editar profissional de outro tenant é recusado e não remove vínculos alheios", async () => {
    const a = await newBusiness()
    const b = await newBusiness()
    const profB = await newProfessional(b.id)
    const servB = await newService(b.id)
    await db.insert(schema.professionalServices).values({ professionalId: profB.id, serviceId: servB.id })

    const result = await persistProfessional(db, a.id, { id: profB.id, values: profValues("Invasor"), serviceIds: [] })
    assert.equal(result.ok, false)
    assert.equal((await linksOf({ professionalId: profB.id })).length, 1)
    const [unchanged] = await db.select().from(schema.professionals).where(eq(schema.professionals.id, profB.id))
    assert.equal(unchanged.name, "Ana")
  })

  test("editar serviço de outro tenant é recusado e não remove vínculos alheios", async () => {
    const a = await newBusiness()
    const b = await newBusiness()
    const profB = await newProfessional(b.id)
    const servB = await newService(b.id)
    await db.insert(schema.professionalServices).values({ professionalId: profB.id, serviceId: servB.id })

    const result = await persistService(db, a.id, { id: servB.id, values: serviceValues("Invasor"), professionalIds: [] })
    assert.equal(result.ok, false)
    assert.equal((await linksOf({ serviceId: servB.id })).length, 1)
  })

  test("IDs de outro tenant são descartados ao vincular", async () => {
    const a = await newBusiness()
    const b = await newBusiness()
    const servA = await newService(a.id)
    const servB = await newService(b.id)

    const created = await persistProfessional(db, a.id, { values: profValues("Bia"), serviceIds: [servA.id, servB.id, "nao-uuid"] })
    assert.ok(created.ok)
    const links = await linksOf({ professionalId: created.id })
    assert.deepEqual(links.map((l) => l.serviceId), [servA.id])
  })

  test("editar substitui os vínculos do próprio tenant", async () => {
    const a = await newBusiness()
    const prof = await newProfessional(a.id)
    const s1 = await newService(a.id, "S1")
    const s2 = await newService(a.id, "S2")
    await db.insert(schema.professionalServices).values({ professionalId: prof.id, serviceId: s1.id })

    const result = await persistProfessional(db, a.id, { id: prof.id, values: profValues("Ana 2"), serviceIds: [s2.id, s2.id] })
    assert.ok(result.ok)
    assert.deepEqual((await linksOf({ professionalId: prof.id })).map((l) => l.serviceId), [s2.id])

    const svc = await persistService(db, a.id, { id: s1.id, values: serviceValues("S1b"), professionalIds: [prof.id] })
    assert.ok(svc.ok)
    assert.equal((await linksOf({ professionalId: prof.id })).length, 2)
  })
})

describe("bloqueios de horário por permissão", () => {
  const actor = (businessId: string, permissions: Permission[], professionalId: string | null): BlockActor => ({
    businessId,
    permissions: new Set(permissions),
    professionalId,
  })
  const window = { startsAt: new Date("2026-12-01T13:00:00Z"), endsAt: new Date("2026-12-01T14:00:00Z"), reason: null }

  test("regra de permissão", () => {
    assert.equal(canManageTimeBlock(actor("x", ["agenda.view_all"], null), null), true)
    assert.equal(canManageTimeBlock(actor("x", ["availability.manage_own"], "p1"), "p1"), true)
    assert.equal(canManageTimeBlock(actor("x", ["availability.manage_own"], "p1"), "p2"), false)
    assert.equal(canManageTimeBlock(actor("x", ["availability.manage_own"], "p1"), null), false)
    assert.equal(canManageTimeBlock(actor("x", ["availability.manage_own"], null), null), false)
    assert.equal(canManageTimeBlock(actor("x", [], "p1"), "p1"), false)
  })

  test("profissional cria e remove só na própria agenda", async () => {
    const a = await newBusiness()
    const own = await newProfessional(a.id, "Própria")
    const other = await newProfessional(a.id, "Outra")
    const me = actor(a.id, ["availability.manage_own"], own.id)

    assert.deepEqual(await insertTimeBlock(db, me, { ...window, professionalId: other.id }), { ok: false, error: BLOCK_NO_PERMISSION })
    assert.deepEqual(await insertTimeBlock(db, me, { ...window, professionalId: null }), { ok: false, error: BLOCK_NO_PERMISSION })
    assert.deepEqual(await insertTimeBlock(db, me, { ...window, professionalId: own.id }), { ok: true })

    const manager = actor(a.id, ["agenda.view_all"], null)
    assert.deepEqual(await insertTimeBlock(db, manager, { ...window, professionalId: other.id }), { ok: true })

    const blocks = await db.select().from(schema.timeBlocks).where(eq(schema.timeBlocks.businessId, a.id))
    const otherBlock = blocks.find((b) => b.professionalId === other.id)!
    const ownBlock = blocks.find((b) => b.professionalId === own.id)!
    assert.deepEqual(await removeTimeBlock(db, me, otherBlock.id), { ok: false, error: BLOCK_NO_PERMISSION })
    assert.deepEqual(await removeTimeBlock(db, me, ownBlock.id), { ok: true })
    assert.deepEqual(await removeTimeBlock(db, manager, otherBlock.id), { ok: true })
  })

  test("não acessa bloqueios ou profissionais de outro tenant", async () => {
    const a = await newBusiness()
    const b = await newBusiness()
    const profB = await newProfessional(b.id)
    const manager = actor(a.id, ["agenda.view_all"], null)
    assert.equal((await insertTimeBlock(db, manager, { ...window, professionalId: profB.id })).ok, false)

    await insertTimeBlock(db, actor(b.id, ["agenda.view_all"], null), { ...window, professionalId: profB.id })
    const [blockB] = await db.select().from(schema.timeBlocks).where(eq(schema.timeBlocks.businessId, b.id))
    assert.equal((await removeTimeBlock(db, manager, blockB.id)).ok, false)
    assert.equal((await db.select().from(schema.timeBlocks).where(eq(schema.timeBlocks.id, blockB.id))).length, 1)
  })
})

describe("agendamento público", () => {
  test("estabelecimento suspenso fica bloqueado", async () => {
    const b = await newBusiness()
    assert.equal(await isPublicBookingBlocked(db, b), false)
    await db.insert(schema.businessSuspensions).values({ businessId: b.id, reason: "teste", suspendedBy: "admin" })
    assert.equal(await isPublicBookingBlocked(db, b), true)
  })

  test("assinatura vencida bloqueia somente com BILLING_ENFORCEMENT=on", async () => {
    const [b] = await db
      .insert(schema.businesses)
      .values({ name: "Antigo", slug: `b-${crypto.randomUUID()}`, openingHours: [], createdAt: new Date(Date.now() - 400 * 86_400_000) })
      .returning()
    const previous = process.env.BILLING_ENFORCEMENT
    try {
      delete process.env.BILLING_ENFORCEMENT
      assert.equal(await isPublicBookingBlocked(db, b), false)
      process.env.BILLING_ENFORCEMENT = "on"
      assert.equal(await isPublicBookingBlocked(db, b), true)
    } finally {
      if (previous === undefined) delete process.env.BILLING_ENFORCEMENT
      else process.env.BILLING_ENFORCEMENT = previous
    }
  })

  test("rate limit atômico por chave", async () => {
    const key = `t-${crypto.randomUUID()}`
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeRateLimit(exec, key, 3, 60)))
    assert.equal(results.filter(Boolean).length, 3)
  })

  test("limites por IP e por telefone", async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}-${crypto.randomUUID()}`
    const ipResults = []
    for (let i = 0; i < 12; i++) ipResults.push(await allowBookingFromIp(exec, ip))
    assert.equal(ipResults.filter(Boolean).length, 10)

    const b = await newBusiness()
    const phoneResults = []
    for (let i = 0; i < 5; i++) phoneResults.push(await allowBookingForPhone(exec, b.id, "5511999990000"))
    assert.equal(phoneResults.filter(Boolean).length, 3)
    assert.equal(await allowBookingForPhone(exec, (await newBusiness()).id, "5511999990000"), true)
  })
})
