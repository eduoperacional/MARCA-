import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { isOverlapError } from "@/lib/actions/result"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { BLOCKING_STATUSES, findSlotConflict, reserveSlot, reserveWithAnyProfessional } from "@/lib/booking-core"
import * as schema from "@/lib/db/schema"
import type { AppointmentStatus } from "@/lib/types"

const BASE_SQL = fs.readFileSync(path.join(process.cwd(), "tests", "billing.test.ts"), "utf8").match(/const BASE_SQL = `([\s\S]*?)`/)![1]
const SCRIPTS_DIR = path.join(process.cwd(), "scripts")
const MIGRATION = "016-agendamentos-sem-sobreposicao.sql"
const TEMPLATES = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]
const migrationSql = () => fs.readFileSync(path.join(SCRIPTS_DIR, MIGRATION), "utf8")

async function freshDb({ withMigration }: { withMigration: boolean }) {
  const pg = new PGlite({ extensions: { btree_gist } })
  await pg.exec(BASE_SQL)
  for (const file of fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith(".sql") && !TEMPLATES.includes(f)).sort()) {
    if (!withMigration && file === MIGRATION) continue
    await pg.exec(fs.readFileSync(path.join(SCRIPTS_DIR, file), "utf8"))
  }
  return { pg, db: drizzle(pg, { schema }) as unknown as BillingDb }
}

const at = (time: string) => new Date(`2026-12-01T${time}:00Z`)

let db: BillingDb

before(async () => {
  ;({ db } = await freshDb({ withMigration: true }))
})

function newAgenda(professionals = 1) {
  return {
    businessId: crypto.randomUUID(),
    professionalIds: Array.from({ length: professionals }, () => crypto.randomUUID()),
  }
}

async function insertAppointment(
  executor: Pick<BillingDb, "insert">,
  values: { businessId: string; professionalId: string; start: string; end: string; status?: AppointmentStatus }
) {
  const [row] = await executor
    .insert(schema.appointments)
    .values({
      businessId: values.businessId,
      professionalId: values.professionalId,
      clientId: crypto.randomUUID(),
      serviceId: crypto.randomUUID(),
      startsAt: at(values.start),
      endsAt: at(values.end),
      status: values.status ?? "confirmed",
    })
    .returning()
  return row
}

async function expectOverlap(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(isOverlapError(error), `esperava 23P01, recebeu ${String(error)}`)
    return true
  })
}

async function appointmentsOf(businessId: string) {
  return db.select().from(schema.appointments).where(eq(schema.appointments.businessId, businessId))
}

describe("constraint appointments_no_overlap (banco)", () => {
  test("os status que bloqueiam no banco são os mesmos da aplicação", () => {
    const sqlStatuses = migrationSql().match(/WHERE \(%I IN \(([^)]*)\)\)/)![1].replace(/'/g, "").split(/,\s*/)
    assert.deepEqual([...sqlStatuses].sort(), [...BLOCKING_STATUSES].sort())
  })

  for (const status of BLOCKING_STATUSES) {
    test(`agendamento "${status}" impede outro no mesmo horário do mesmo profissional`, async () => {
      const { businessId, professionalIds: [pro] } = newAgenda()
      await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30", status })
      await expectOverlap(insertAppointment(db, { businessId, professionalId: pro, start: "09:15", end: "09:45" }))
    })
  }

  test("horários encostados não conflitam (intervalo semiaberto)", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30" })
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:30", end: "10:00" })
    await insertAppointment(db, { businessId, professionalId: pro, start: "08:30", end: "09:00" })
    assert.equal((await appointmentsOf(businessId)).length, 3)
  })

  test("profissionais diferentes podem atender no mesmo horário", async () => {
    const { businessId, professionalIds: [a, b] } = newAgenda(2)
    await insertAppointment(db, { businessId, professionalId: a, start: "09:00", end: "10:00" })
    await insertAppointment(db, { businessId, professionalId: b, start: "09:00", end: "10:00" })
    assert.equal((await appointmentsOf(businessId)).length, 2)
  })

  test("cancelado e não compareceu liberam o horário", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30", status: "cancelled" })
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30", status: "no_show" })
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30", status: "pending" })
    assert.equal((await appointmentsOf(businessId)).length, 3)
  })

  test("reabrir um cancelado cujo horário já foi ocupado é recusado pelo banco", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    const cancelled = await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30", status: "cancelled" })
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30" })
    await expectOverlap(
      db.update(schema.appointments).set({ status: "pending" }).where(eq(schema.appointments.id, cancelled.id))
    )
  })

  test("remarcar para cima de outro agendamento é recusado pelo banco", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    await insertAppointment(db, { businessId, professionalId: pro, start: "10:00", end: "10:30" })
    const moving = await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30" })
    await expectOverlap(
      db.update(schema.appointments).set({ startsAt: at("10:15"), endsAt: at("10:45") }).where(eq(schema.appointments.id, moving.id))
    )
  })
})

describe("reserveSlot (aplicação)", () => {
  test("detecta conflito com agendamento e com bloqueio da agenda", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30" })
    await db.insert(schema.timeBlocks).values({ businessId, professionalId: null, startsAt: at("12:00"), endsAt: at("13:00") })

    const request = (start: string, end: string) => ({ businessId, professionalId: pro, startsAt: at(start), endsAt: at(end) })
    assert.equal(await findSlotConflict(db, request("09:10", "09:40")), "appointment")
    assert.equal(await findSlotConflict(db, request("12:30", "13:30")), "block")
    assert.equal(await findSlotConflict(db, request("09:30", "12:00")), null)
  })

  test("remarcação no próprio horário (ou sobrepondo a si mesma) é permitida", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    const own = await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30" })
    const result = await reserveSlot(
      db,
      { businessId, professionalId: pro, startsAt: at("09:15"), endsAt: at("09:45"), excludeAppointmentId: own.id },
      (tx) => tx.update(schema.appointments).set({ startsAt: at("09:15"), endsAt: at("09:45") }).where(eq(schema.appointments.id, own.id))
    )
    assert.equal(result.ok, true)
  })

  test("remarcação para horário de outro cliente é recusada sem alterar nada", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    await insertAppointment(db, { businessId, professionalId: pro, start: "10:00", end: "10:30" })
    const moving = await insertAppointment(db, { businessId, professionalId: pro, start: "09:00", end: "09:30" })
    const result = await reserveSlot(
      db,
      { businessId, professionalId: pro, startsAt: at("10:00"), endsAt: at("10:30"), excludeAppointmentId: moving.id },
      (tx) => tx.update(schema.appointments).set({ startsAt: at("10:00"), endsAt: at("10:30") }).where(eq(schema.appointments.id, moving.id))
    )
    assert.deepEqual(result, { ok: false, conflict: "appointment" })
    const [unchanged] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, moving.id))
    assert.equal(unchanged.startsAt.toISOString(), at("09:00").toISOString())
  })

  test("10 reservas simultâneas no mesmo horário: exatamente 1 é aceita", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserveSlot(db, { businessId, professionalId: pro, startsAt: at("14:00"), endsAt: at("14:30") }, (tx) =>
          insertAppointment(tx, { businessId, professionalId: pro, start: "14:00", end: "14:30", status: "pending" })
        )
      )
    )
    assert.equal(results.filter((r) => r.ok).length, 1)
    assert.equal((await appointmentsOf(businessId)).length, 1)
  })

  test("se a checagem ficar desatualizada, a constraint vira conflito e a transação é desfeita", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    const result = await reserveSlot(db, { businessId, professionalId: pro, startsAt: at("15:00"), endsAt: at("15:30") }, async (tx) => {
      await insertAppointment(tx, { businessId, professionalId: pro, start: "15:00", end: "15:30" })
      return insertAppointment(tx, { businessId, professionalId: pro, start: "15:10", end: "15:40" })
    })
    assert.deepEqual(result, { ok: false, conflict: "appointment" })
    assert.equal((await appointmentsOf(businessId)).length, 0)
  })

  test('"qualquer profissional": reservas simultâneas são distribuídas sem duplicar ninguém', async () => {
    const { businessId, professionalIds } = newAgenda(2)
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        reserveWithAnyProfessional(db, professionalIds, { businessId, startsAt: at("16:00"), endsAt: at("16:30") }, (tx, professionalId) =>
          insertAppointment(tx, { businessId, professionalId, start: "16:00", end: "16:30", status: "pending" })
        )
      )
    )
    const accepted = results.filter((r) => r.ok)
    assert.equal(accepted.length, 2)
    assert.deepEqual(new Set(accepted.map((r) => r.ok && r.professionalId)), new Set(professionalIds))
  })

  test("intervalo inválido é rejeitado antes de tocar no banco", async () => {
    const { businessId, professionalIds: [pro] } = newAgenda()
    await assert.rejects(reserveSlot(db, { businessId, professionalId: pro, startsAt: at("10:00"), endsAt: at("10:00") }, async () => 1))
  })
})

describe("script 016 em bancos existentes", () => {
  test("aborta sem alterar nada quando já existem conflitos, e aplica depois que são resolvidos", async () => {
    const { pg, db: legacy } = await freshDb({ withMigration: false })
    const businessId = crypto.randomUUID()
    const professionalId = crypto.randomUUID()
    const first = await insertAppointment(legacy, { businessId, professionalId, start: "09:00", end: "09:30" })
    await insertAppointment(legacy, { businessId, professionalId, start: "09:15", end: "09:45", status: "completed" })

    await assert.rejects(pg.exec(migrationSql()), /se sobrepõem/)
    await pg.exec("ROLLBACK")
    const constraint = await pg.query("SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'")
    assert.equal(constraint.rows.length, 0)
    assert.equal((await legacy.select().from(schema.appointments)).length, 2)

    await legacy.update(schema.appointments).set({ status: "cancelled" }).where(eq(schema.appointments.id, first.id))
    await pg.exec(migrationSql())
    await pg.exec(migrationSql())
    const applied = await pg.query("SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'")
    assert.equal(applied.rows.length, 1)
    assert.equal((await legacy.select().from(schema.appointments)).length, 2)
  })

  test("aborta se appointments for uma view sobre outra tabela que não agendamentos", async () => {
    const pg = new PGlite({ extensions: { btree_gist } })
    await pg.exec("CREATE TABLE base_real (id uuid); CREATE VIEW appointments AS SELECT * FROM base_real;")
    await assert.rejects(pg.exec(migrationSql()), /não lê somente public\.agendamentos/)
  })

  describe("formato de produção: view appointments sobre a tabela agendamentos", () => {
    const PRODUCTION_SHAPE = `
      CREATE TABLE agendamentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        id_do_negocio uuid NOT NULL,
        id_do_cliente uuid,
        id_do_servico uuid,
        id_profissional uuid NOT NULL,
        comeca_em timestamptz NOT NULL,
        termina_em timestamptz NOT NULL,
        preco_centavos integer,
        metodo_de_pagamento text,
        status text NOT NULL DEFAULT 'pending',
        notas text,
        fonte text,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      );
      CREATE VIEW appointments AS
        SELECT id, id_do_negocio AS business_id, id_do_cliente AS client_id, id_do_servico AS service_id,
               id_profissional AS professional_id, comeca_em AS starts_at, termina_em AS ends_at, status
        FROM agendamentos;`

    const insertViaView = (pg: PGlite, b: string, p: string, start: string, end: string, status = "confirmed") =>
      pg.query(
        "INSERT INTO appointments (business_id, professional_id, starts_at, ends_at, status) VALUES ($1, $2, $3, $4, $5)",
        [b, p, at(start).toISOString(), at(end).toISOString(), status]
      )

    async function productionDb() {
      const pg = new PGlite({ extensions: { btree_gist } })
      await pg.exec(PRODUCTION_SHAPE)
      return pg
    }

    test("cria a regra na tabela física e barra conflitos gravados pela view do app", async () => {
      const pg = await productionDb()
      const [b, p] = [crypto.randomUUID(), crypto.randomUUID()]
      await insertViaView(pg, b, p, "09:00", "09:30")
      await insertViaView(pg, b, p, "09:00", "09:30", "cancelled")

      await pg.exec(migrationSql())
      await pg.exec(migrationSql())

      const constraint = await pg.query<{ tabela: string }>(
        "SELECT conrelid::regclass::text AS tabela FROM pg_constraint WHERE conname = 'appointments_no_overlap'"
      )
      assert.deepEqual(constraint.rows, [{ tabela: "agendamentos" }])

      await assert.rejects(insertViaView(pg, b, p, "09:15", "09:45"), (error: unknown) => {
        assert.ok(isOverlapError(error), `esperava 23P01, recebeu ${String(error)}`)
        return true
      })
      await insertViaView(pg, b, p, "09:30", "10:00")
      await insertViaView(pg, b, p, "09:00", "09:30", "no_show")
      await insertViaView(pg, b, crypto.randomUUID(), "09:00", "09:30")
      const total = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM agendamentos")
      assert.equal(total.rows[0].n, 5)
    })

    test("aborta sem alterar nada se agendamentos já tiver conflitos", async () => {
      const pg = await productionDb()
      const [b, p] = [crypto.randomUUID(), crypto.randomUUID()]
      await insertViaView(pg, b, p, "09:00", "09:30")
      await insertViaView(pg, b, p, "09:10", "09:40", "in_progress")
      await assert.rejects(pg.exec(migrationSql()), /1 par\(es\) de agendamentos já se sobrepõem/)
      await pg.exec("ROLLBACK")
      const constraint = await pg.query("SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'")
      assert.equal(constraint.rows.length, 0)
    })

    test("aborta se houver status desconhecidos (não presume o significado)", async () => {
      const pg = await productionDb()
      await insertViaView(pg, crypto.randomUUID(), crypto.randomUUID(), "09:00", "09:30", "agendado")
      await assert.rejects(pg.exec(migrationSql()), /status desconhecidos: agendado/)
    })

    test("aborta se a view mapear colunas de forma diferente da esperada", async () => {
      const pg = new PGlite({ extensions: { btree_gist } })
      await pg.exec(
        PRODUCTION_SHAPE.replace("comeca_em AS starts_at, termina_em AS ends_at", "criado_em AS starts_at, termina_em AS ends_at")
      )
      await assert.rejects(pg.exec(migrationSql()), /não mapeia as colunas como esperado/)
    })
  })

  test("aborta se as colunas não forem as esperadas (não presume nomes)", async () => {
    const pg = new PGlite({ extensions: { btree_gist } })
    await pg.exec(
      "CREATE TABLE appointments (id uuid, id_do_negocio uuid, id_profissional uuid, comeca_em timestamptz, termina_em timestamptz, status text);"
    )
    await assert.rejects(pg.exec(migrationSql()), /não tem as colunas esperadas: business_id uuid, professional_id uuid, starts_at/)
  })
})
