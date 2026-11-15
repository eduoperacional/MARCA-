import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { computeBillingAccess } from "@/lib/billing/access"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import {
  cancelOwnSubscription,
  changeOwnPlan,
  listPublicPlans,
  startCheckout,
  type CheckoutGateway,
} from "@/lib/billing/self-service"
import { isPlanAvailableTo } from "@/lib/billing/test-plan"
import { GATEWAY_CANCEL_MAX_ATTEMPTS, runBillingMaintenance } from "@/lib/billing/subscriptions"
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
  test("002 a 011 executam em sequência: 6 planos comerciais + 1 de teste", async () => {
    const rows = await db.select().from(schema.plans)
    assert.equal(rows.length, 7)
    assert.deepEqual(rows.filter((p) => p.isTest).map((p) => p.code), ["teste-5"])
  })

  test("são idempotentes (execução repetida não falha)", async () => {
    const dir = path.join(process.cwd(), "scripts")
    for (const file of [
      "006-super-admin.sql",
      "008-checkout-assinaturas.sql",
      "009-fila-cancelamento-gateway.sql",
      "010-enfileirar-trials-expirados.sql",
      "011-plano-teste-oculto.sql",
    ]) {
      await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
    }
    assert.equal((await db.select().from(schema.plans)).length, 7)
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

describe("cron: fila de cancelamentos no Asaas", () => {
  const MIN = 60_000

  async function expiredTrial() {
    const { result } = await checkout(new Date(Date.now() - 10 * DAY))
    const sub = result.subscription
    await db.update(schema.subscriptions).set({ trialEndsAt: new Date(Date.now() - 5 * DAY) }).where(eq(schema.subscriptions.id, sub.id))
    return sub
  }

  function cancelGateway(behavior: (id: string) => Promise<void> = async () => {}) {
    const calls: string[] = []
    return {
      calls,
      gateway: {
        async cancelSubscription(id: string) {
          calls.push(id)
          await behavior(id)
        },
      },
    }
  }

  async function events(subId: string, type: string) {
    const rows = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, subId))
    return rows.filter((r) => r.type === type)
  }

  test("falha de comunicação fica pendente, registra tentativa e erro, e é concluída na execução seguinte", async () => {
    const sub = await expiredTrial()
    const t0 = new Date()
    const failing = cancelGateway(async () => {
      throw new Error("fetch failed: ECONNRESET")
    })
    const first = await runBillingMaintenance(db, t0, failing.gateway)
    let row = await getSub(sub.id)
    assert.equal(row.status, "expired")
    assert.equal(row.gatewayCancelStatus, "pending")
    assert.equal(row.gatewayCancelAttempts, 1)
    assert.match(row.gatewayCancelLastError ?? "", /ECONNRESET/)
    assert.ok(first.gatewayCancel.failedAttempts >= 1)
    assert.ok(first.gatewayCancel.pending >= 1)
    const failures = await events(sub.id, "gateway_cancel_failed")
    assert.equal(failures.length, 1)
    assert.equal(failures[0].details.willRetry, true)

    const ok = cancelGateway()
    const second = await runBillingMaintenance(db, new Date(t0.getTime() + 11 * MIN), ok.gateway)
    row = await getSub(sub.id)
    assert.equal(row.gatewayCancelStatus, "done")
    assert.equal(row.gatewayCancelAttempts, 2)
    assert.equal(row.gatewayCancelLastError, null)
    assert.ok(row.gatewayCanceledAt)
    assert.ok(second.gatewayCancel.concluded >= 1)
    assert.equal((await events(sub.id, "gateway_canceled")).length, 1)

    const again = cancelGateway()
    await runBillingMaintenance(db, new Date(t0.getTime() + 30 * MIN), again.gateway)
    assert.ok(!again.calls.includes(sub.gatewaySubscriptionId!), "cancelamento confirmado não pode ser repetido")
    assert.equal((await getSub(sub.id)).gatewayCancelAttempts, 2)
  })

  test("não repete a tentativa dentro da janela de reserva (evita chamada duplicada)", async () => {
    const sub = await expiredTrial()
    const t0 = new Date()
    await runBillingMaintenance(db, t0, cancelGateway(async () => Promise.reject(new Error("timeout"))).gateway)
    const soon = cancelGateway()
    await runBillingMaintenance(db, new Date(t0.getTime() + 2 * MIN), soon.gateway)
    assert.ok(!soon.calls.includes(sub.gatewaySubscriptionId!))
    assert.equal((await getSub(sub.id)).gatewayCancelAttempts, 1)
  })

  test("execuções simultâneas do cron cancelam cada assinatura uma única vez", async () => {
    const sub = await expiredTrial()
    const slow = cancelGateway(() => new Promise((resolve) => setTimeout(resolve, 30)))
    const now = new Date()
    await Promise.all([runBillingMaintenance(db, now, slow.gateway), runBillingMaintenance(db, now, slow.gateway)])
    assert.equal(slow.calls.filter((id) => id === sub.gatewaySubscriptionId).length, 1)
    const row = await getSub(sub.id)
    assert.equal(row.gatewayCancelStatus, "done")
    assert.equal(row.gatewayCancelAttempts, 1)
  })

  test("assinatura já removida no Asaas (404) é tratada como concluída", async () => {
    const sub = await expiredTrial()
    const gone = cancelGateway(async () => {
      throw Object.assign(new Error("Assinatura não encontrada"), { status: 404 })
    })
    const out = await runBillingMaintenance(db, new Date(), gone.gateway)
    const row = await getSub(sub.id)
    assert.equal(row.gatewayCancelStatus, "done")
    assert.ok(out.gatewayCancel.concluded >= 1)
    assert.equal((await events(sub.id, "gateway_canceled"))[0].details.alreadyRemoved, true)
  })

  test("esgota as tentativas, marca como falha definitiva e para de chamar o Asaas", async () => {
    const sub = await expiredTrial()
    const failing = cancelGateway(async () => {
      throw new Error("Asaas respondeu 500")
    })
    const t0 = Date.now()
    let last
    for (let i = 0; i < GATEWAY_CANCEL_MAX_ATTEMPTS; i++) {
      last = await runBillingMaintenance(db, new Date(t0 + i * 11 * MIN), failing.gateway)
    }
    let row = await getSub(sub.id)
    assert.equal(row.gatewayCancelStatus, "failed")
    assert.equal(row.gatewayCancelAttempts, GATEWAY_CANCEL_MAX_ATTEMPTS)
    assert.ok(last!.gatewayCancel.failed >= 1)
    const failures = await events(sub.id, "gateway_cancel_failed")
    assert.equal(failures.length, GATEWAY_CANCEL_MAX_ATTEMPTS)
    const final = failures.filter((f) => f.details.willRetry === false)
    assert.equal(final.length, 1)
    assert.equal(final[0].details.attempt, GATEWAY_CANCEL_MAX_ATTEMPTS)

    const later = cancelGateway()
    await runBillingMaintenance(db, new Date(t0 + 200 * MIN), later.gateway)
    assert.ok(!later.calls.includes(sub.gatewaySubscriptionId!))
    row = await getSub(sub.id)
    assert.equal(row.gatewayCancelAttempts, GATEWAY_CANCEL_MAX_ATTEMPTS)
  })

  test("sem Asaas configurado a fila é preservada para a próxima execução", async () => {
    const sub = await expiredTrial()
    const out = await runBillingMaintenance(db, new Date())
    const row = await getSub(sub.id)
    assert.equal(row.gatewayCancelStatus, "pending")
    assert.equal(row.gatewayCancelAttempts, 0)
    assert.ok(out.gatewayCancel.pending >= 1)
    await runBillingMaintenance(db, new Date(), cancelGateway().gateway)
    assert.equal((await getSub(sub.id)).gatewayCancelStatus, "done")
  })

  test("pagamento tardio com cancelamento pendente reativa e retira da fila", async () => {
    const sub = await expiredTrial()
    const t0 = new Date()
    await runBillingMaintenance(db, t0, cancelGateway(async () => Promise.reject(new Error("timeout"))).gateway)
    assert.equal((await getSub(sub.id)).gatewayCancelStatus, "pending")

    await webhook(paymentEvent("PAYMENT_RECEIVED", sub, `pay_${crypto.randomUUID()}`))
    const reopened = await getSub(sub.id)
    assert.equal(reopened.status, "active")
    assert.equal(reopened.gatewayCancelStatus, null)

    const later = cancelGateway()
    await runBillingMaintenance(db, new Date(t0.getTime() + 11 * MIN), later.gateway)
    assert.ok(!later.calls.includes(sub.gatewaySubscriptionId!), "assinatura paga não pode ser cancelada no Asaas")
  })

  test("pagamento tardio não reativa se já existe outra assinatura contratada; cancelamento segue na fila", async () => {
    const sub = await expiredTrial()
    const t0 = new Date()
    await runBillingMaintenance(db, t0, cancelGateway(async () => Promise.reject(new Error("timeout"))).gateway)
    await db.insert(schema.subscriptions).values({
      businessId: sub.businessId,
      planId: sub.planId,
      status: "active",
      priceCents: sub.priceCents,
      billingInterval: sub.billingInterval,
    })

    await webhook(paymentEvent("PAYMENT_RECEIVED", sub, `pay_${crypto.randomUUID()}`))
    const row = await getSub(sub.id)
    assert.equal(row.status, "expired")
    assert.equal(row.gatewayCancelStatus, "pending")

    const later = cancelGateway()
    await runBillingMaintenance(db, new Date(t0.getTime() + 11 * MIN), later.gateway)
    assert.ok(later.calls.includes(sub.gatewaySubscriptionId!))
    assert.equal((await getSub(sub.id)).gatewayCancelStatus, "done")
  })

  test("cancelamento agendado pelo dono não entra na fila (já foi cancelado no Asaas)", async () => {
    const { result } = await checkout()
    const sub = result.subscription
    await db
      .update(schema.subscriptions)
      .set({ status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: new Date(Date.now() - DAY) })
      .where(eq(schema.subscriptions.id, sub.id))
    const gw = cancelGateway()
    await runBillingMaintenance(db, new Date(), gw.gateway)
    const row = await getSub(sub.id)
    assert.equal(row.status, "canceled")
    assert.equal(row.gatewayCancelStatus, null)
    assert.ok(!gw.calls.includes(sub.gatewaySubscriptionId!))
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

describe("plano de teste interno (011)", () => {
  const TESTER = "tester@marcai.com"

  function withEnv(vars: Record<string, string | undefined>) {
    const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
    Object.assign(process.env, vars)
    for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]
    return () => {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }

  async function testCheckout(email = TESTER, business?: Awaited<ReturnType<typeof newBusiness>>) {
    const plan = await planByCode("teste-5")
    const { gateway, calls } = fakeGateway()
    const b = business ?? (await newBusiness())
    const result = await startCheckout(db, gateway, {
      business: b,
      user: { id: "u-test", email },
      planId: plan.id,
      billingType: "PIX",
      cpfCnpj: "12345678909",
    })
    return { business: b, plan, calls, result }
  }

  test("migration 011 não altera preços nem visibilidade de Start, Pro e Elite", async () => {
    const rows = await db.select().from(schema.plans)
    const commercial = rows.filter((p) => !p.isTest)
    assert.equal(commercial.length, 6)
    assert.ok(commercial.every((p) => !p.isHidden))
    const test5 = rows.find((p) => p.code === "teste-5")!
    assert.equal(test5.priceCents, 500)
    assert.equal(test5.trialDays, 0)
    assert.equal(test5.isHidden, true)
  })

  test("listagem esconde o plano para e-mails não liberados e mostra para os liberados", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: ` ${TESTER.toUpperCase()} , outro@x.com` })
    try {
      const anon = await listPublicPlans(db, null)
      const other = await listPublicPlans(db, "cliente@x.com")
      const tester = await listPublicPlans(db, TESTER)
      assert.ok(!anon.some((p) => p.isTest))
      assert.ok(!other.some((p) => p.isTest))
      assert.ok(tester.some((p) => p.code === "teste-5"))
      assert.equal(tester.filter((p) => !p.isTest).length, other.length)
    } finally {
      restore()
    }
  })

  test("sem BILLING_TEST_EMAILS ninguém vê o plano de teste", () => {
    assert.equal(isPlanAvailableTo({ isHidden: true, isTest: true }, TESTER, {}), false)
    assert.equal(isPlanAvailableTo({ isHidden: false, isTest: false }, null, {}), true)
    assert.equal(isPlanAvailableTo({ isHidden: true, isTest: false }, TESTER, { BILLING_TEST_EMAILS: TESTER }), false)
  })

  test("checkout recusa no servidor e-mail não liberado, mesmo com o planId correto", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: TESTER })
    try {
      await assert.rejects(testCheckout("intruso@x.com"), /Plano indisponível/)
    } finally {
      restore()
    }
  })

  test("cobrança imediata e única: sem trial e com maxPayments: 1", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: TESTER })
    try {
      const { calls, result } = await testCheckout()
      const create = calls.find((c) => c.op === "createSubscription")!.args[0] as Record<string, unknown>
      assert.equal(create.maxPayments, 1)
      assert.equal(create.value, 5)
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
      assert.equal(create.nextDueDate, today)
      assert.equal(result.subscription.trialEndsAt, null)
    } finally {
      restore()
    }
  })

  test("planos comerciais continuam com trial e sem maxPayments", async () => {
    const { calls, result } = await checkout()
    const create = calls.find((c) => c.op === "createSubscription")!.args[0] as Record<string, unknown>
    assert.equal("maxPayments" in create, false)
    assert.ok(result.subscription.trialEndsAt)
  })

  test("pagamento da cobrança única agenda o fim e a rotina diária encerra o acesso", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: TESTER })
    try {
      const { business, result } = await testCheckout()
      const sub = result.subscription
      await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_${crypto.randomUUID()}`, { value: 5 }))
      const paid = await getSub(sub.id)
      assert.equal(paid.status, "active")
      assert.equal(paid.cancelAtPeriodEnd, true)
      assert.ok(paid.currentPeriodEnd)

      await runBillingMaintenance(db, new Date(paid.currentPeriodEnd!.getTime() + 60_000))
      const ended = await getSub(sub.id)
      assert.equal(ended.status, "canceled")
      assert.equal(computeBillingAccess(business as never, ended as never, new Date(paid.currentPeriodEnd!.getTime() + 60_000)).allowed, false)
    } finally {
      restore()
    }
  })

  test("SUBSCRIPTION_INACTIVATED do Asaas antes do pagamento não encerra a assinatura de teste", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: TESTER })
    try {
      const { result } = await testCheckout()
      const sub = result.subscription
      const before = await getSub(sub.id)
      await webhook({ id: `evt_${crypto.randomUUID()}`, event: "SUBSCRIPTION_INACTIVATED", subscription: { id: sub.gatewaySubscriptionId, externalReference: sub.id } })
      const after = await getSub(sub.id)
      assert.equal(after.status, before.status)
      assert.equal(after.endedAt, null)
    } finally {
      restore()
    }
  })

  test("o mesmo estabelecimento não contrata o teste de novo sem autorização explícita", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: TESTER, BILLING_TEST_REPEAT_EMAILS: undefined })
    try {
      const { business, result } = await testCheckout()
      const sub = result.subscription
      await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_${crypto.randomUUID()}`, { value: 5 }))
      const paid = await getSub(sub.id)
      await runBillingMaintenance(db, new Date(paid.currentPeriodEnd!.getTime() + 60_000))

      await assert.rejects(testCheckout(TESTER, business), /já foi utilizado/)

      process.env.BILLING_TEST_REPEAT_EMAILS = TESTER
      const again = await testCheckout(TESTER, business)
      assert.ok(again.result.subscription.gatewaySubscriptionId)
    } finally {
      restore()
    }
  })

  test("assinante comercial não troca para o plano de teste, mesmo com e-mail liberado", async () => {
    const restore = withEnv({ BILLING_TEST_EMAILS: TESTER })
    try {
      const { result } = await checkout()
      const test5 = await planByCode("teste-5")
      const { gateway, calls } = fakeGateway()
      await assert.rejects(
        changeOwnPlan(db, gateway, await getSub(result.subscription.id), test5.id, { userId: "u1", source: "owner" }),
        /Plano indisponível/
      )
      assert.equal(calls.length, 0)
    } finally {
      restore()
    }
  })
})
