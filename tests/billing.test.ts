import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { computeBillingAccess } from "@/lib/billing/access"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { cancelOwnSubscription, startCheckout, type CheckoutGateway } from "@/lib/billing/self-service"
import { runBillingMaintenance } from "@/lib/billing/subscriptions"
import { handleAsaasWebhook } from "@/lib/billing/webhook"
import * as schema from "@/lib/db/schema"

const TOKEN = "token-de-teste-123"
const DAY = 86_400_000

// Tabelas de domínio criadas antes da 002 (originalmente criadas pelo setup inicial do projeto).
const BASE_SQL = `
CREATE TABLE businesses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  segment text, phone text, address text, opening_hours jsonb NOT NULL DEFAULT '[]', slot_interval_min int NOT NULL DEFAULT 15,
  online_booking_enabled boolean NOT NULL DEFAULT true, min_advance_min int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE professionals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, name text NOT NULL,
  photo_url text, phone text, email text, specialties text, color text NOT NULL DEFAULT '#7B3FF2',
  work_schedule jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, name text NOT NULL,
  category text NOT NULL DEFAULT 'Geral', description text, price_cents int NOT NULL, duration_min int NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE professional_services (professional_id uuid NOT NULL, service_id uuid NOT NULL, PRIMARY KEY (professional_id, service_id));
CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, name text NOT NULL,
  phone text NOT NULL, phone_normalized text NOT NULL, email text, birth_date date, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, client_id uuid NOT NULL,
  service_id uuid NOT NULL, professional_id uuid NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  price_cents int NOT NULL DEFAULT 0, payment_method text, status text NOT NULL DEFAULT 'pending', notes text,
  source text NOT NULL DEFAULT 'admin', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, appointment_id uuid,
  amount_cents int NOT NULL, method text NOT NULL, paid_at timestamptz NOT NULL DEFAULT now(), notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, description text NOT NULL,
  category text NOT NULL DEFAULT 'Outros', amount_cents int NOT NULL, date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE time_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, professional_id uuid,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, type text NOT NULL,
  title text NOT NULL, body text, appointment_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
`

type Call = { op: string; args: unknown[] }

/** Gateway falso: registra as chamadas e nunca acessa a rede do Asaas. */
function fakeGateway(opts: { failCancel?: boolean } = {}) {
  const calls: Call[] = []
  let n = 0
  const gateway: CheckoutGateway = {
    async findCustomerByReference(...args) {
      calls.push({ op: "findCustomerByReference", args })
      return null
    },
    async createCustomer(...args) {
      calls.push({ op: "createCustomer", args })
      return { id: `cus_${++n}_${crypto.randomUUID().slice(0, 8)}` }
    },
    async updateCustomer(...args) {
      calls.push({ op: "updateCustomer", args })
      return { id: args[0] }
    },
    async createSubscription(...args) {
      calls.push({ op: "createSubscription", args })
      return { id: `sub_${++n}_${crypto.randomUUID().slice(0, 8)}` }
    },
    async updateSubscription(...args) {
      calls.push({ op: "updateSubscription", args })
      return {}
    },
    async cancelSubscription(...args) {
      calls.push({ op: "cancelSubscription", args })
      if (opts.failCancel) throw new Error("Asaas indisponível")
      return {}
    },
    async listSubscriptionPayments(...args) {
      calls.push({ op: "listSubscriptionPayments", args })
      return [{ id: `pay_open_${args[0]}`, status: "PENDING", dueDate: "2026-12-01", value: 49.9, invoiceUrl: "https://asaas/i/1" }]
    },
  }
  return { gateway, calls }
}

let db: BillingDb
let pg: PGlite

before(async () => {
  pg = new PGlite()
  await pg.exec(BASE_SQL)
  const dir = path.join(process.cwd(), "scripts")
  // 004 e 007 são modelos manuais que exigem o e-mail de um usuário real.
  const templates = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !templates.includes(f)).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
  }
  db = drizzle(pg, { schema }) as unknown as BillingDb
})

async function newBusiness(createdAt = new Date()) {
  const [b] = await db
    .insert(schema.businesses)
    .values({ name: "Barbearia Teste", slug: `b-${crypto.randomUUID()}`, openingHours: [], createdAt })
    .returning()
  return b
}

async function planByCode(code: string) {
  const [p] = await db.select().from(schema.plans).where(eq(schema.plans.code, code)).limit(1)
  return p
}

async function anyPlan() {
  const [p] = await db.select().from(schema.plans).where(eq(schema.plans.isActive, true)).limit(1)
  return p
}

async function getSub(id: string) {
  const [s] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id))
  return s
}

function webhook(body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token !== null) headers["asaas-access-token"] = token
  return handleAsaasWebhook(
    db,
    new Request("http://localhost/api/webhooks/asaas", { method: "POST", headers, body: JSON.stringify(body) }),
    TOKEN
  )
}

function paymentEvent(event: string, sub: { id: string; gatewaySubscriptionId: string | null }, paymentId: string, extra = {}) {
  return {
    id: `evt_${crypto.randomUUID()}`,
    event,
    dateCreated: "2026-11-15 10:00:00",
    payment: {
      id: paymentId,
      subscription: sub.gatewaySubscriptionId,
      externalReference: sub.id,
      value: 49.9,
      billingType: "PIX",
      dueDate: "2026-11-15",
      confirmedDate: "2026-11-15",
      ...extra,
    },
  }
}

async function checkout(createdAt = new Date()) {
  const business = await newBusiness(createdAt)
  const plan = await anyPlan()
  const { gateway, calls } = fakeGateway()
  const result = await startCheckout(db, gateway, {
    business,
    user: { id: "u1", email: "dono@teste.com" },
    planId: plan.id,
    billingType: "PIX",
    cpfCnpj: "12345678909",
  })
  return { business, plan, gateway, calls, result }
}

describe("migrations", () => {
  test("002 a 008 executam em sequência e criam 6 planos", async () => {
    const rows = await db.select().from(schema.plans)
    assert.equal(rows.length, 6)
  })

  test("são idempotentes (execução repetida não falha)", async () => {
    const dir = path.join(process.cwd(), "scripts")
    for (const file of ["006-super-admin.sql", "008-checkout-assinaturas.sql"]) {
      await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
    }
    assert.equal((await db.select().from(schema.plans)).length, 6)
  })
})

describe("checkout", () => {
  test("cria cliente e assinatura no Asaas com valor, ciclo e referência corretos", async () => {
    const { business, plan, calls, result } = await checkout()
    const customer = calls.find((c) => c.op === "createCustomer")!.args[0] as Record<string, unknown>
    assert.equal(customer.externalReference, business.id)
    assert.equal(customer.cpfCnpj, "12345678909")

    const created = calls.find((c) => c.op === "createSubscription")!.args[0] as Record<string, unknown>
    assert.equal(created.value, plan.priceCents / 100)
    assert.equal(created.cycle, plan.billingInterval === "year" ? "YEARLY" : "MONTHLY")
    assert.equal(created.externalReference, result.subscription.id)
    assert.equal(created.billingType, "PIX")

    const sub = await getSub(result.subscription.id)
    assert.equal(sub.businessId, business.id)
    assert.equal(sub.planId, plan.id)
    assert.equal(sub.priceCents, plan.priceCents)
    assert.equal(sub.billingInterval, plan.billingInterval)
    assert.match(sub.gatewayCustomerId ?? "", /^cus_1_/)
    assert.ok(sub.gatewaySubscriptionId)
    assert.equal(sub.status, "trialing")
    assert.ok(result.pendingTransactionId, "cobrança em aberto registrada como pendente")
  })

  test("bloqueia segunda contratação para o mesmo estabelecimento", async () => {
    const { business, plan, gateway } = await checkout()
    await assert.rejects(
      startCheckout(db, gateway, { business, user: { id: "u1", email: "a@a.com" }, planId: plan.id, billingType: "PIX", cpfCnpj: "12345678909" }),
      /assinatura em andamento/
    )
  })

  test("falha no Asaas desfaz a assinatura local", async () => {
    const business = await newBusiness()
    const plan = await anyPlan()
    const { gateway } = fakeGateway()
    gateway.createSubscription = async () => {
      throw new Error("Asaas fora")
    }
    await assert.rejects(
      startCheckout(db, gateway, { business, user: { id: "u1", email: "a@a.com" }, planId: plan.id, billingType: "PIX", cpfCnpj: "12345678909" })
    )
    const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, business.id))
    assert.equal(rows.filter((r) => r.status !== "canceled" && r.status !== "expired").length, 0)
  })
})

describe("webhook: autenticação e validação", () => {
  test("sem token retorna 401", async () => {
    assert.equal((await webhook({ id: "x", event: "PAYMENT_CREATED" }, null)).status, 401)
  })
  test("token errado retorna 401", async () => {
    assert.equal((await webhook({ id: "x", event: "PAYMENT_CREATED" }, "errado")).status, 401)
  })
  test("token não configurado no servidor retorna 401", async () => {
    const res = await handleAsaasWebhook(
      db,
      new Request("http://x", { method: "POST", headers: { "asaas-access-token": TOKEN }, body: "{}" }),
      undefined
    )
    assert.equal(res.status, 401)
  })
  test("payload inválido retorna 400", async () => {
    assert.equal((await webhook({ foo: 1 })).status, 400)
  })
  test("cobrança avulsa (fora de assinatura) é ignorada sem erro", async () => {
    const res = await webhook({ id: "evt_avulsa", event: "PAYMENT_RECEIVED", payment: { id: "pay_avulsa", value: 10 } })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).result, "ignored")
  })
})

describe("webhook: eventos de pagamento", () => {
  test("PAYMENT_CONFIRMED ativa a assinatura e aprova a cobrança; reenvio é idempotente", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    const evt = paymentEvent("PAYMENT_CONFIRMED", sub, "pay_c1")

    const res = await webhook(evt)
    assert.equal((await res.json()).result, "processed")
    const after = await getSub(sub.id)
    assert.equal(after.status, "active")
    assert.ok(after.currentPeriodEnd && after.currentPeriodEnd > new Date())

    const [tx] = await db.select().from(schema.billingTransactions).where(eq(schema.billingTransactions.gatewayTransactionId, "pay_c1"))
    assert.equal(tx.status, "approved")
    assert.equal(tx.amountCents, 4990)
    assert.equal(tx.paymentMethod, "pix")

    const dup = await (await webhook(evt)).json()
    assert.equal(dup.duplicate, true)
    const events = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, sub.id))
    assert.equal(events.filter((e) => e.type === "activated").length, 1)
  })

  test("PAYMENT_RECEIVED após CONFIRMED não gera renovação duplicada", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, "pay_r1"))
    const periodEnd = (await getSub(sub.id)).currentPeriodEnd
    await webhook(paymentEvent("PAYMENT_RECEIVED", sub, "pay_r1"))
    assert.deepEqual((await getSub(sub.id)).currentPeriodEnd, periodEnd)
    const events = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, sub.id))
    assert.equal(events.filter((e) => e.type === "renewed").length, 0)
  })

  test("PAYMENT_REFUNDED marca a cobrança como estornada", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, "pay_e1"))
    await webhook(paymentEvent("PAYMENT_REFUNDED", sub, "pay_e1"))
    const [tx] = await db.select().from(schema.billingTransactions).where(eq(schema.billingTransactions.gatewayTransactionId, "pay_e1"))
    assert.equal(tx.status, "refunded")
    assert.equal(tx.refundedCents, 4990)
  })

  test("PAYMENT_OVERDUE leva a assinatura para past_due e restringe após a carência", async () => {
    const { result } = await checkout(new Date(Date.now() - 30 * DAY))
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_OVERDUE", sub, "pay_o1"))
    const after = await getSub(sub.id)
    assert.equal(after.status, "past_due")
  })

  test("evento que chega antes do vínculo é reprocessado ao vincular", async () => {
    const business = await newBusiness()
    const plan = await anyPlan()
    const { gateway } = fakeGateway()
    const original = gateway.createSubscription
    gateway.createSubscription = async (input) => {
      const created = await original(input)
      // Webhook chega enquanto o checkout ainda não gravou o ID da assinatura do Asaas.
      await webhook({
        id: "evt_corrida",
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_corrida", subscription: created.id, value: 49.9, billingType: "PIX", dueDate: "2026-11-15" },
      })
      return created
    }
    const { subscription } = await startCheckout(db, gateway, {
      business, user: { id: "u1", email: "a@a.com" }, planId: plan.id, billingType: "PIX", cpfCnpj: "12345678909",
    })
    assert.equal((await getSub(subscription.id)).status, "active")
  })
})

describe("webhook: eventos de assinatura", () => {
  test("SUBSCRIPTION_INACTIVATED encerra a assinatura", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook({ id: `evt_${crypto.randomUUID()}`, event: "SUBSCRIPTION_INACTIVATED", subscription: { id: sub.gatewaySubscriptionId, externalReference: sub.id } })
    const after = await getSub(sub.id)
    assert.equal(after.status, "canceled")
    assert.ok(after.endedAt)
  })

  test("SUBSCRIPTION_DELETED encerra a assinatura", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook({ id: `evt_${crypto.randomUUID()}`, event: "SUBSCRIPTION_DELETED", subscription: { id: sub.gatewaySubscriptionId, externalReference: sub.id } })
    assert.equal((await getSub(sub.id)).status, "canceled")
  })
})

describe("cancelamento pelo dono", () => {
  test("cancelamento no fim do período mantém o acesso mesmo se o webhook chegar durante a chamada", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_${crypto.randomUUID()}`))
    const active = await getSub(sub.id)

    const { gateway } = fakeGateway()
    gateway.cancelSubscription = async () => {
      await webhook({ id: `evt_${crypto.randomUUID()}`, event: "SUBSCRIPTION_DELETED", subscription: { id: active.gatewaySubscriptionId, externalReference: sub.id } })
      return {}
    }
    await cancelOwnSubscription(db, gateway, active, "period_end", { userId: "u1", source: "owner" }, "teste")
    const after = await getSub(sub.id)
    assert.equal(after.status, "active")
    assert.equal(after.cancelAtPeriodEnd, true)
  })

  test("falha no Asaas desfaz o cancelamento agendado", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_${crypto.randomUUID()}`))
    const active = await getSub(sub.id)
    const { gateway } = fakeGateway({ failCancel: true })
    await assert.rejects(cancelOwnSubscription(db, gateway, active, "period_end", { userId: "u1", source: "owner" }, "teste"))
    assert.equal((await getSub(sub.id)).cancelAtPeriodEnd, false)
  })
})

describe("cron de cobrança", () => {
  test("expira trial vencido sem pagamento e cancela no Asaas", async () => {
    const { result } = await checkout(new Date(Date.now() - 10 * DAY))
    const sub = result.subscription
    await db.update(schema.subscriptions).set({ trialEndsAt: new Date(Date.now() - 5 * DAY) }).where(eq(schema.subscriptions.id, sub.id))
    const { gateway, calls } = fakeGateway()
    const out = await runBillingMaintenance(db, new Date(), gateway)
    assert.ok(out.updated >= 1)
    assert.equal((await getSub(sub.id)).status, "expired")
    assert.ok(calls.some((c) => c.op === "cancelSubscription" && c.args[0] === sub.gatewaySubscriptionId))
  })

  test("pagamento tardio reativa um trial expirado", async () => {
    const { result } = await checkout(new Date(Date.now() - 10 * DAY))
    const sub = result.subscription
    await db
      .update(schema.subscriptions)
      .set({ status: "expired", endedAt: new Date() })
      .where(eq(schema.subscriptions.id, sub.id))
    await webhook(paymentEvent("PAYMENT_RECEIVED", sub, `pay_${crypto.randomUUID()}`))
    const after = await getSub(sub.id)
    assert.equal(after.status, "active")
    assert.equal(after.endedAt, null)
  })

  test("encerra cancelamento agendado após o fim do período", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await db
      .update(schema.subscriptions)
      .set({ status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: new Date(Date.now() - DAY) })
      .where(eq(schema.subscriptions.id, sub.id))
    await runBillingMaintenance(db, new Date())
    assert.equal((await getSub(sub.id)).status, "canceled")
  })
})

describe("permissões de acesso", () => {
  test("assinatura ativa libera; cancelada bloqueia", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_${crypto.randomUUID()}`))
    const active = await getSub(sub.id)
    const business = { createdAt: new Date(Date.now() - 60 * DAY) }
    assert.equal(computeBillingAccess(business as never, active, new Date()).allowed, true)

    const ended = { ...active, status: "canceled" as const, endedAt: new Date() }
    assert.equal(computeBillingAccess(business as never, null, new Date()).allowed, false)
    assert.equal(computeBillingAccess(business as never, ended as never, new Date()).allowed, false)
  })
})

void planByCode
