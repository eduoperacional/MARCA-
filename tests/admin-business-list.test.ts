import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { businessBillingStatus, PARTNER_BENEFIT_STATUS, SUBSCRIPTION_STATUS } from "@/lib/admin/labels"
import { PARTNER_STATUS_FILTER, queryBusinessList, type BusinessListFilters } from "@/lib/admin/business-list"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import * as schema from "@/lib/db/schema"

const BASE_SQL = fs
  .readFileSync(path.join(process.cwd(), "tests/billing.test.ts"), "utf8")
  .match(/const BASE_SQL = `([\s\S]*?)`/)![1]

let db: BillingDb

before(async () => {
  const pg = new PGlite({ extensions: { btree_gist } })
  await pg.exec(BASE_SQL)
  const dir = path.join(process.cwd(), "scripts")
  const templates = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !templates.includes(f)).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
  }
  db = drizzle(pg, { schema }) as unknown as BillingDb
})

async function newBusiness(name: string, values: Partial<typeof schema.businesses.$inferInsert> = {}) {
  const [b] = await db
    .insert(schema.businesses)
    .values({ name, slug: `b-${crypto.randomUUID()}`, openingHours: [], ...values })
    .returning()
  return b
}

async function planByCode(code: string) {
  const [p] = await db.select().from(schema.plans).where(eq(schema.plans.code, code)).limit(1)
  return p
}

async function addSubscription(businessId: string, planCode: string, status: schema.SubscriptionStatus) {
  const plan = await planByCode(planCode)
  await db.insert(schema.subscriptions).values({
    businessId,
    planId: plan.id,
    status,
    priceCents: plan.priceCents,
    billingInterval: plan.billingInterval,
  })
}

const find = async (filters: BusinessListFilters, id: string) =>
  (await queryBusinessList(db, filters)).rows.find((r) => r.id === id)

describe("listagem /admin/estabelecimentos com benefício de parceiro ELITE", () => {
  test("parceiro sem assinatura aparece com plano ELITE e status de benefício gratuito", async () => {
    const elite = await planByCode("elite")
    const b = await newBusiness("Camille Silva Beauty", { partnerBenefitActive: true, partnerBenefitGrantedAt: new Date() })
    const row = await find({ q: "Camille", page: 1 }, b.id)
    assert.ok(row)
    assert.equal(row.plan_name, elite.name)
    assert.equal(row.partner_benefit_active, true)
    assert.equal(row.subscription_id, null)
    assert.deepEqual(
      businessBillingStatus({ partnerBenefitActive: row.partner_benefit_active, subscriptionStatus: row.subscription_status }),
      PARTNER_BENEFIT_STATUS
    )
    assert.doesNotMatch(PARTNER_BENEFIT_STATUS.label, /^Ativa$|Sem assinatura/)
  })

  test("parceiro com assinatura antiga encerrada continua exibido como ELITE gratuito", async () => {
    const b = await newBusiness("Parceiro com histórico", { partnerBenefitActive: true })
    await addSubscription(b.id, "pro", "canceled")
    const row = await find({ page: 1 }, b.id)
    assert.equal(row?.plan_name, (await planByCode("elite")).name)
    assert.equal(
      businessBillingStatus({ partnerBenefitActive: row!.partner_benefit_active, subscriptionStatus: row!.subscription_status }).label,
      PARTNER_BENEFIT_STATUS.label
    )
  })

  test("filtros de plano e status reconhecem o benefício sem confundi-lo com assinatura", async () => {
    const partner = await newBusiness("Filtro parceiro", { partnerBenefitActive: true })
    const none = await newBusiness("Filtro sem assinatura")

    assert.ok(await find({ plan: "elite", page: 1 }, partner.id))
    assert.ok(await find({ status: PARTNER_STATUS_FILTER, page: 1 }, partner.id))
    assert.equal(await find({ status: "none", page: 1 }, partner.id), undefined)
    assert.equal(await find({ status: "active", page: 1 }, partner.id), undefined)

    assert.ok(await find({ status: "none", page: 1 }, none.id))
    assert.equal(await find({ status: PARTNER_STATUS_FILTER, page: 1 }, none.id), undefined)
  })

  test("assinaturas pagas, trials e benefício revogado mantêm o comportamento atual", async () => {
    const paid = await newBusiness("Cliente pagante PRO")
    await addSubscription(paid.id, "pro", "active")
    const trial = await newBusiness("Cliente em trial")
    await addSubscription(trial.id, "pro", "trialing")
    const revoked = await newBusiness("Parceiro revogado", { partnerBenefitActive: false, partnerBenefitRevokedAt: new Date() })
    const exempt = await newBusiness("Isento de cobrança", { billingExempt: true })

    const pro = await planByCode("pro")
    const paidRow = await find({ page: 1 }, paid.id)
    assert.equal(paidRow?.plan_name, pro.name)
    assert.equal(paidRow?.subscription_status, "active")
    assert.deepEqual(businessBillingStatus({ partnerBenefitActive: false, subscriptionStatus: "active" }), SUBSCRIPTION_STATUS.active)
    assert.ok(await find({ status: "active", plan: "pro", page: 1 }, paid.id))
    assert.equal(await find({ plan: "elite", page: 1 }, paid.id), undefined)

    assert.equal((await find({ status: "trialing", page: 1 }, trial.id))?.subscription_status, "trialing")

    for (const id of [revoked.id, exempt.id]) {
      const row = await find({ status: "none", page: 1 }, id)
      assert.equal(row?.plan_name, null)
      assert.equal(businessBillingStatus({ partnerBenefitActive: row!.partner_benefit_active, subscriptionStatus: null }).label, "Sem assinatura")
    }
  })

  test("a listagem não cria assinatura para o parceiro", async () => {
    const b = await newBusiness("Parceiro somente leitura", { partnerBenefitActive: true })
    await queryBusinessList(db, { page: 1 })
    const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, b.id))
    assert.equal(subs.length, 0)
  })
})
