import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import { GRACE_DAYS, TRIAL_DAYS, businessTrialEnd, computeBillingAccess } from "@/lib/billing/access"
import {
  LAUNCH_PROMO_CODE,
  discountedCents,
  getLaunchPromoStatus,
  isBusinessEligibleForPromo,
  processPromoPriceSync,
  releaseAbandonedPromoReservations,
} from "@/lib/billing/launch-promo"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import {
  brazilDate,
  cancelOwnSubscription,
  changeOwnPlan,
  GATEWAY_ACTIVATION_LEASE_MS,
  getBillingOverview,
  getPlanLimit,
  listPublicPlans,
  processGatewayActivations,
  runBillingCron,
  startCheckout,
  type CheckoutGateway,
} from "@/lib/billing/self-service"
import { isPlanAvailableTo } from "@/lib/billing/test-plan"
import { GATEWAY_CANCEL_MAX_ATTEMPTS, runBillingMaintenance } from "@/lib/billing/subscriptions"
import {
  checkWebhookToken,
  describeWebhookRejection,
  handleAsaasWebhook,
  normalizeWebhookToken,
  tokenFingerprint,
} from "@/lib/billing/webhook"
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
function fakeGateway(
  opts: {
    failCancel?: boolean
    /** Quantas chamadas de createSubscription falham (erro de rede) antes de funcionar. */
    failCreateTimes?: number
    /** Cria no Asaas mas a resposta se perde (timeout) nas primeiras N chamadas. */
    loseCreateResponseTimes?: number
    /** Erro de validação (4xx), que não deve ser repetido na mesma execução. */
    rejectCreate?: boolean
    /** Atraso de createSubscription, para provocar concorrência. */
    createDelayMs?: number
  } = {}
) {
  const calls: Call[] = []
  let n = 0
  let createFailures = opts.failCreateTimes ?? 0
  let lostResponses = opts.loseCreateResponseTimes ?? 0
  const byReference = new Map<string, string>()
  const gateway: CheckoutGateway = {
    async findSubscriptionByReference(...args) {
      calls.push({ op: "findSubscriptionByReference", args })
      const id = byReference.get(args[0])
      return id ? { id } : null
    },
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
      if (opts.createDelayMs) await new Promise((r) => setTimeout(r, opts.createDelayMs))
      if (opts.rejectCreate) throw Object.assign(new Error("Asaas 400: cliente inválido"), { status: 400 })
      if (createFailures > 0) {
        createFailures--
        throw new Error("fetch failed")
      }
      const id = `sub_${++n}_${crypto.randomUUID().slice(0, 8)}`
      if (args[0].externalReference) byReference.set(args[0].externalReference, id)
      if (lostResponses > 0) {
        lostResponses--
        throw new Error("The operation was aborted due to timeout")
      }
      return { id }
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
  pg = new PGlite({ extensions: { btree_gist } })
  await pg.exec(BASE_SQL)
  const dir = path.join(process.cwd(), "scripts")
  // 004 e 007 são modelos manuais que exigem o e-mail de um usuário real.
  const templates = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !templates.includes(f)).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
  }
  db = drizzle(pg, { schema }) as unknown as BillingDb
  // A 019 cria a campanha ativa; os testes anteriores à promoção usam preço integral.
  await pg.exec("UPDATE promo_campaigns SET is_active = false")
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

/** Contrata sem avançar o tempo: durante o trial nada é criado no Asaas. */
async function trialCheckout(createdAt = new Date(), planId?: string, billingType: "PIX" | "BOLETO" | "CREDIT_CARD" = "PIX") {
  const business = await newBusiness(createdAt)
  const plan = planId ? (await db.select().from(schema.plans).where(eq(schema.plans.id, planId)))[0] : await anyPlan()
  const { gateway, calls } = fakeGateway()
  const result = await startCheckout(db, gateway, {
    business,
    user: { id: "u1", email: "dono@teste.com" },
    planId: plan.id,
    billingType,
    cpfCnpj: "12345678909",
  })
  return { business, plan, gateway, calls, result }
}

/** Chamadas ao Asaas referentes a uma assinatura local específica. */
function callsFor(calls: Call[], subId: string, op = "createSubscription") {
  return calls.filter((c) => c.op === op && (c.args[0] as { externalReference?: string })?.externalReference === subId)
}

/** Contrata e, se estiver no trial, executa o cron no último instante do trial (assinatura criada no Asaas). */
async function checkout(createdAt = new Date()) {
  const ctx = await trialCheckout(createdAt)
  let subscription = ctx.result.subscription
  if (subscription.gatewayActivationStatus === "pending") {
    await processGatewayActivations(db, ctx.gateway, subscription.trialEndsAt!, { retryDelayMs: 0 })
    subscription = await getSub(subscription.id)
  }
  return { ...ctx, result: { ...ctx.result, subscription } }
}

describe("migrations", () => {
  test("002 a 012 executam em sequência: 6 planos comerciais ativos + teste-5 desativado", async () => {
    const rows = await db.select().from(schema.plans)
    assert.equal(rows.length, 7)
    assert.deepEqual(rows.filter((p) => p.isTest).map((p) => p.code), ["teste-5"])
    assert.equal(rows.find((p) => p.code === "teste-5")!.isActive, false)
    assert.equal(rows.filter((p) => !p.isTest && p.isActive).length, 6)
  })

  test("são idempotentes (execução repetida não falha)", async () => {
    const dir = path.join(process.cwd(), "scripts")
    for (const file of [
      "006-super-admin.sql",
      "008-checkout-assinaturas.sql",
      "009-fila-cancelamento-gateway.sql",
      "010-enfileirar-trials-expirados.sql",
      "011-plano-teste-oculto.sql",
      "012-descontinuar-plano-teste.sql",
      "023-beneficio-parceiro-pro.sql",
    ]) {
      await pg.exec(fs.readFileSync(path.join(dir, file), "utf8"))
    }
    assert.equal((await db.select().from(schema.plans)).length, 7)
  })
})

describe("benefício de parceiro no billing", () => {
  test("oferece o plano PRO sem assinatura, fatura ou chamadas ao Asaas; revogação volta ao fluxo normal", async () => {
    const business = await newBusiness(new Date("2020-01-01T00:00:00Z"))
    await db.update(schema.businesses).set({ partnerBenefitActive: true, partnerBenefitCategory: "promotion_partner" }).where(eq(schema.businesses.id, business.id))

    const pro = await planByCode("pro")
    assert.ok(pro)
    const overview = await getBillingOverview(db, business.id)
    assert.equal(overview.subscription, null)
    assert.equal(overview.plan?.id, pro.id)
    assert.deepEqual(overview.plan?.features, pro.features)
    assert.deepEqual(overview.pending, [])
    assert.equal(await getPlanLimit(db, business.id, "professionals"), pro.limits.professionals)
    assert.equal(await getPlanLimit(db, business.id, "services"), pro.limits.services)
    assert.equal(await getPlanLimit(db, business.id, "members"), pro.limits.members)

    const { gateway, calls } = fakeGateway()
    await assert.rejects(
      startCheckout(db, gateway, {
        business,
        user: { id: "u1", email: "parceiro@teste.com" },
        planId: pro.id,
        billingType: "PIX",
        cpfCnpj: "12345678909",
      }),
      /benefício ativo de parceiro PRO/
    )
    assert.equal(calls.length, 0, "nenhuma chamada de cliente, assinatura ou cobrança ao Asaas")
    assert.equal((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, business.id))).length, 0)
    assert.equal((await db.select().from(schema.billingTransactions).where(eq(schema.billingTransactions.businessId, business.id))).length, 0)

    await db.update(schema.businesses).set({ partnerBenefitActive: false }).where(eq(schema.businesses.id, business.id))
    const access = computeBillingAccess({ ...business, partnerBenefitActive: false }, null, new Date("2026-11-24T00:00:00Z"))
    assert.equal(access.allowed, false)
    assert.equal(access.state, "blocked_no_plan")
  })
})

describe("checkout", () => {
  test("no trial: cria só o cliente no Asaas e registra plano, valor e forma de pagamento escolhidos", async () => {
    const { business, plan, calls, result } = await trialCheckout()
    const customer = calls.find((c) => c.op === "createCustomer")!.args[0] as Record<string, unknown>
    assert.equal(customer.externalReference, business.id)
    assert.equal(customer.cpfCnpj, "12345678909")

    assert.equal(calls.filter((c) => c.op === "createSubscription").length, 0, "nenhuma assinatura/cobrança no Asaas")
    assert.equal(calls.filter((c) => c.op === "listSubscriptionPayments").length, 0)
    assert.equal(result.pendingTransactionId, null, "nenhum Pix/boleto para pagar")

    const sub = await getSub(result.subscription.id)
    assert.equal(sub.businessId, business.id)
    assert.equal(sub.planId, plan.id)
    assert.equal(sub.priceCents, plan.priceCents)
    assert.equal(sub.billingInterval, plan.billingInterval)
    assert.equal(sub.gatewayBillingType, "PIX")
    assert.match(sub.gatewayCustomerId ?? "", /^cus_1_/)
    assert.equal(sub.gatewaySubscriptionId, null)
    assert.equal(sub.gatewayActivationStatus, "pending")
    assert.equal(sub.status, "trialing")
    assert.equal(sub.trialEndsAt!.getTime(), businessTrialEnd(business).getTime())
  })

  test("após o trial: contratação cria a assinatura no Asaas na hora (sem novo trial)", async () => {
    const { plan, calls, result } = await trialCheckout(new Date(Date.now() - 10 * DAY))
    const created = callsFor(calls, result.subscription.id)
    assert.equal(created.length, 1)
    const input = created[0].args[0] as Record<string, unknown>
    assert.equal(input.value, plan.priceCents / 100)
    assert.equal(input.nextDueDate, brazilDate(new Date()))
    assert.ok(result.subscription.gatewaySubscriptionId)
    assert.ok(result.pendingTransactionId)
  })

  test("bloqueia segunda contratação para o mesmo estabelecimento", async () => {
    const { business, plan, gateway } = await checkout()
    await assert.rejects(
      startCheckout(db, gateway, { business, user: { id: "u1", email: "a@a.com" }, planId: plan.id, billingType: "PIX", cpfCnpj: "12345678909" }),
      /assinatura em andamento/
    )
  })

  test("após o trial: falha no Asaas desfaz a assinatura local", async () => {
    const business = await newBusiness(new Date(Date.now() - 10 * DAY))
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
  test("token correto passa da autenticação", async () => {
    const res = await webhook({ id: "evt_auth_ok", event: "PAYMENT_RECEIVED", payment: { id: "pay_auth_ok", value: 10 } })
    assert.equal(res.status, 200)
  })
  test("token com espaço ou quebra de linha nas pontas é aceito", async () => {
    const res = await handleAsaasWebhook(
      db,
      new Request("http://x", {
        method: "POST",
        headers: { "asaas-access-token": ` ${TOKEN} ` },
        body: JSON.stringify({ id: "evt_auth_trim", event: "PAYMENT_RECEIVED", payment: { id: "pay_auth_trim", value: 10 } }),
      }),
      `${TOKEN}\n`
    )
    assert.equal(res.status, 200)
  })
  test("classifica o motivo da recusa sem depender do valor do token", () => {
    assert.equal(checkWebhookToken(TOKEN, TOKEN), "ok")
    assert.equal(checkWebhookToken(null, TOKEN), "header_missing")
    assert.equal(checkWebhookToken("   ", TOKEN), "token_mismatch")
    assert.equal(checkWebhookToken("errado", TOKEN), "token_mismatch")
    assert.equal(checkWebhookToken(TOKEN, undefined), "server_token_missing")
    assert.equal(checkWebhookToken(TOKEN, "  "), "server_token_missing")
  })
  test("log da recusa não contém o token", async () => {
    const logs: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "))
    try {
      await webhook({ id: "x", event: "PAYMENT_CREATED" }, "token-recebido-secreto")
    } finally {
      console.error = original
    }
    assert.ok(logs.some((l) => l.includes("token_mismatch")))
    assert.ok(logs.every((l) => !l.includes("token-recebido-secreto") && !l.includes(TOKEN)))
  })
  test("aceita variável salva com aspas, invisíveis ou com o nome da variável colado", () => {
    assert.equal(checkWebhookToken(TOKEN, `"${TOKEN}"`), "ok")
    assert.equal(checkWebhookToken(TOKEN, `'${TOKEN}'`), "ok")
    assert.equal(checkWebhookToken(TOKEN, `\uFEFF${TOKEN}\u200B`), "ok")
    assert.equal(checkWebhookToken(TOKEN, `ASAAS_WEBHOOK_TOKEN="${TOKEN}"\n`), "ok")
  })
  test("normalização não afrouxa a validação", () => {
    assert.equal(checkWebhookToken(`${TOKEN}x`, TOKEN), "token_mismatch")
    assert.equal(checkWebhookToken(TOKEN.slice(1), TOKEN), "token_mismatch")
    assert.equal(checkWebhookToken(`"${TOKEN}`, TOKEN), "token_mismatch")
    assert.equal(checkWebhookToken(TOKEN, '""'), "server_token_missing")
    assert.equal(checkWebhookToken("", TOKEN), "header_missing")
    assert.equal(checkWebhookToken(null, TOKEN), "header_missing")
  })
  test("cabeçalho recebido é comparado sem normalização", () => {
    const rejected = [
      `"${TOKEN}"`,
      `'${TOKEN}'`,
      `ASAAS_WEBHOOK_TOKEN=${TOKEN}`,
      `ASAAS_WEBHOOK_TOKEN="${TOKEN}"`,
      `\u200B${TOKEN}`,
      `${TOKEN}\uFEFF`,
      `${TOKEN}\u2060`,
      `\u00EF\u00BB\u00BF${TOKEN}`,
      ` ${TOKEN}`,
      `${TOKEN}\n`,
      "ASAAS_WEBHOOK_TOKEN=",
    ]
    for (const header of rejected) {
      assert.equal(checkWebhookToken(header, TOKEN), "token_mismatch", JSON.stringify(header))
    }
    assert.equal(checkWebhookToken(TOKEN, TOKEN), "ok")
  })
  test("webhook com cabeçalho prefixado ou com invisíveis retorna 401 sem processar", async () => {
    const original = console.error
    const logs: string[] = []
    console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "))
    try {
      // HTTP headers are Latin-1: a UTF-8 BOM sent by the client arrives as "ï»¿".
      for (const header of [`ASAAS_WEBHOOK_TOKEN=${TOKEN}`, `"${TOKEN}"`, `\u00EF\u00BB\u00BF${TOKEN}`]) {
        const response = await webhook({ id: `evt-${header.length}`, event: "PAYMENT_CREATED" }, header)
        assert.equal(response.status, 401)
      }
    } finally {
      console.error = original
    }
    assert.ok(logs.some((l) => l.includes("suspeitas=prefixo_variavel")))
    assert.ok(logs.some((l) => l.includes("suspeitas=aspas")))
    assert.equal(logs.filter((l) => l.includes("token_mismatch")).length, 3)
    assert.ok(logs.every((l) => !l.includes(TOKEN)))
  })
  test("normalizeWebhookToken informa os ajustes feitos", () => {
    assert.deepEqual(normalizeWebhookToken(` "${TOKEN}"\n`), { value: TOKEN, adjustments: ["espacos", "aspas"] })
    assert.deepEqual(normalizeWebhookToken(TOKEN), { value: TOKEN, adjustments: [] })
  })
  test("diagnóstico mostra tamanho, fingerprint e deploy sem revelar o token", () => {
    const received = "token-recebido-secreto-com-mais-de-32-caracteres"
    const line = describeWebhookRejection("token_mismatch", received, `"${TOKEN}"`, {
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "abcdef1234567",
    })
    assert.ok(line.includes(`recebido len=${received.length} fp=${tokenFingerprint(received)} suspeitas=nenhuma`))
    assert.ok(line.includes(`esperado len=${TOKEN.length} fp=${tokenFingerprint(TOKEN)} ajustes=aspas`))
    assert.ok(line.includes("env=production deploy=abcdef1"))
    assert.ok(!line.includes(received))
    assert.ok(!line.includes(TOKEN))
    assert.match(tokenFingerprint(TOKEN), /^[0-9a-f]{8}$/)
    assert.ok(describeWebhookRejection("header_missing", null, TOKEN, {}).includes("recebido ausente"))
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
    const business = await newBusiness(new Date(Date.now() - 10 * DAY))
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

  for (const event of ["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]) {
    test(`${event} não altera assinatura isenta e continua processando RB Barber`, async () => {
      const studio = await checkout()
      const rb = await checkout()
      const studioSub = studio.result.subscription
      const rbSub = rb.result.subscription

      await db.update(schema.businesses).set({ billingExempt: true }).where(eq(schema.businesses.id, studio.business.id))
      await db.update(schema.businesses).set({ name: "RB Barber", slug: `rb-${rb.business.id}` }).where(eq(schema.businesses.id, rb.business.id))
      await db.update(schema.subscriptions).set({ priceCents: 500 }).where(eq(schema.subscriptions.id, rbSub.id))

      const before = await getSub(studioSub.id)
      await webhook({
        id: `evt_${crypto.randomUUID()}`,
        event,
        subscription: { id: studioSub.gatewaySubscriptionId, externalReference: studioSub.id },
      })
      await webhook({
        id: `evt_${crypto.randomUUID()}`,
        event,
        subscription: { id: rbSub.gatewaySubscriptionId, externalReference: rbSub.id },
      })

      const after = await getSub(studioSub.id)
      assert.equal(after.status, before.status)
      assert.equal(after.canceledAt?.getTime(), before.canceledAt?.getTime())
      assert.equal(after.endedAt?.getTime(), before.endedAt?.getTime())
      assert.equal(after.currentPeriodEnd?.getTime(), before.currentPeriodEnd?.getTime())
      assert.equal(after.cancelAtPeriodEnd, before.cancelAtPeriodEnd)

      const [studioBusiness] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, studio.business.id))
      assert.equal(studioBusiness.billingExempt, true)
      assert.equal(computeBillingAccess(studioBusiness, after, new Date()).allowed, true)

      const [rbBusiness] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, rb.business.id))
      const rbAfter = await getSub(rbSub.id)
      assert.equal(rbBusiness.billingExempt, false)
      assert.equal(rbAfter.status, "canceled")
      assert.ok(rbAfter.endedAt)
      assert.equal(rbAfter.priceCents, 500)
    })
  }
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
    await db
      .update(schema.subscriptions)
      .set({ status: "trialing", trialEndsAt: new Date(Date.now() - 5 * DAY) })
      .where(eq(schema.subscriptions.id, sub.id))
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
    await db
      .update(schema.subscriptions)
      .set({ status: "trialing", trialEndsAt: new Date(Date.now() - 5 * DAY) })
      .where(eq(schema.subscriptions.id, sub.id))
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
  test("isenção persistente mantém acesso após trial vencido e inadimplência", () => {
    const business = { createdAt: new Date(Date.now() - 90 * DAY), billingExempt: true }
    const pastDue = {
      status: "past_due" as const,
      trialEndsAt: new Date(Date.now() - 80 * DAY),
      currentPeriodEnd: new Date(Date.now() - 60 * DAY),
      courtesyUntil: null,
      cancelAtPeriodEnd: false,
    }
    const access = computeBillingAccess(business, pastDue, new Date())
    assert.equal(access.state, "exempt")
    assert.equal(access.allowed, true)
    assert.equal(access.until, null)
    assert.equal(access.notice, null)
  })

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


describe("isenção permanente Studio Bella", () => {
  test("checkout recusa novas assinaturas sem chamar o Asaas", async () => {
    const business = await newBusiness()
    await db.update(schema.businesses).set({ billingExempt: true }).where(eq(schema.businesses.id, business.id))
    const plan = await anyPlan()
    const { gateway, calls } = fakeGateway()

    await assert.rejects(
      startCheckout(db, gateway, {
        business,
        user: { id: "u-studio", email: "studio@example.test" },
        planId: plan.id,
        billingType: "PIX",
        cpfCnpj: "12345678909",
      }),
      /isento de cobrança/
    )
    assert.equal(calls.length, 0)
  })

  test("trial isento não é ativado no Asaas e não expira pelo cron", async () => {
    const context = await trialCheckout()
    const sub = context.result.subscription
    await db.update(schema.businesses).set({ billingExempt: true }).where(eq(schema.businesses.id, context.business.id))
    await db.update(schema.subscriptions).set({ trialEndsAt: new Date(Date.now() - 30 * DAY) }).where(eq(schema.subscriptions.id, sub.id))

    await processGatewayActivations(db, context.gateway, new Date(Date.now() + 30 * DAY), { retryDelayMs: 0 })
    assert.equal(context.calls.filter((call) => call.op === "createSubscription").length, 0)
    assert.equal((await getSub(sub.id)).gatewayActivationStatus, "pending")

    await runBillingMaintenance(db, new Date(Date.now() + 30 * DAY))
    assert.equal((await getSub(sub.id)).status, "trialing")
    assert.equal(computeBillingAccess({ createdAt: context.business.createdAt, billingExempt: true }, await getSub(sub.id), new Date(Date.now() + 30 * DAY)).allowed, true)
  })

  test("parceiro PRO não é ativado no Asaas durante o trial", async () => {
    const context = await trialCheckout()
    const sub = context.result.subscription
    await db.update(schema.businesses).set({ partnerBenefitActive: true }).where(eq(schema.businesses.id, context.business.id))
    await db.update(schema.subscriptions).set({ trialEndsAt: new Date(Date.now() - 30 * DAY) }).where(eq(schema.subscriptions.id, sub.id))

    const summary = await processGatewayActivations(db, context.gateway, new Date(Date.now() + 30 * DAY), { retryDelayMs: 0 })
    assert.equal(context.calls.filter((call) => call.op === "createSubscription").length, 0)
    assert.equal(summary.pending, 0)
    assert.equal((await getSub(sub.id)).gatewayActivationStatus, "pending")
    assert.equal(computeBillingAccess({ createdAt: context.business.createdAt, partnerBenefitActive: true }, await getSub(sub.id), new Date(Date.now() + 30 * DAY)).state, "partner")
  })

  test("webhooks registram o pagamento, mas não renovam nem alteram a assinatura isenta", async () => {
    const { business, result } = await checkout()
    const sub = result.subscription
    const prior = await getSub(sub.id)
    await db.update(schema.businesses).set({ billingExempt: true }).where(eq(schema.businesses.id, business.id))

    const paymentId = `pay_exempt_${crypto.randomUUID()}`
    const response = await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, paymentId))
    assert.equal((await response.json()).result, "processed")
    const after = await getSub(sub.id)
    assert.equal(after.status, prior.status)
    assert.equal(after.currentPeriodEnd, prior.currentPeriodEnd)
    const [transaction] = await db
      .select()
      .from(schema.billingTransactions)
      .where(eq(schema.billingTransactions.gatewayTransactionId, paymentId))
    assert.equal(transaction.status, "approved")
  })

  test("SQL operacional isola Studio Bella e enfileira apenas a assinatura dela", async () => {
    const studio = await newBusiness()
    const rb = await newBusiness()
    await db.update(schema.businesses).set({ name: "Studio Bella", slug: "studio-bella" }).where(eq(schema.businesses.id, studio.id))
    await db.update(schema.businesses).set({ name: "RB Barber", slug: `rb-${rb.id}` }).where(eq(schema.businesses.id, rb.id))
    const studioCheckout = await checkout()
    const rbCheckout = await checkout()
    await db.update(schema.subscriptions).set({ businessId: studio.id, gatewaySubscriptionId: "asaas_studio_bella" }).where(eq(schema.subscriptions.id, studioCheckout.result.subscription.id))
    await db.update(schema.subscriptions).set({ businessId: rb.id, gatewaySubscriptionId: "asaas_rb_barber", priceCents: 500 }).where(eq(schema.subscriptions.id, rbCheckout.result.subscription.id))
    await db.insert(schema.promoRedemptions).values({
      campaignCode: "lancamento",
      businessId: studio.id,
      subscriptionId: studioCheckout.result.subscription.id,
      status: "reserved",
      discountPercent: 30,
      discountedCycles: 2,
      reservedAt: new Date(Date.now() - 30 * DAY),
      expiresAt: new Date(Date.now() - 20 * DAY),
      priceSyncStatus: "pending",
    })
    const sqlPath = path.join(process.cwd(), "scripts/manual/studio-bella-billing-exemption.sql")

    await pg.exec(fs.readFileSync(sqlPath, "utf8"))

    const [studioAfter] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, studio.id))
    const [rbAfter] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, rb.id))
    const studioSub = await getSub(studioCheckout.result.subscription.id)
    const rbSub = await getSub(rbCheckout.result.subscription.id)
    assert.equal(studioAfter.billingExempt, true)
    assert.equal(studioSub.gatewayCancelStatus, "pending")
    assert.equal(rbAfter.billingExempt, false)
    assert.equal(rbSub.gatewayCancelStatus, null)
    assert.equal(rbSub.priceCents, 500)

    assert.equal(await releaseAbandonedPromoReservations(db, new Date()), 0)
    const [reservation] = await db.select().from(schema.promoRedemptions).where(eq(schema.promoRedemptions.businessId, studio.id))
    assert.equal(reservation.status, "reserved")
    const priceUpdates: string[] = []
    await processPromoPriceSync(db, { async updateSubscription(id) { priceUpdates.push(id) } })
    assert.deepEqual(priceUpdates, [])

    const calls: string[] = []
    await runBillingMaintenance(db, new Date(), { async cancelSubscription(id) { calls.push(id) } })
    assert.ok(calls.includes("asaas_studio_bella"))
    assert.ok(!calls.includes("asaas_rb_barber"))
    assert.equal((await getSub(studioSub.id)).status, "trialing")
    assert.equal((await getSub(rbSub.id)).gatewayCancelStatus, null)
  })
})

describe("regra comercial: 7 dias grátis", () => {
  async function contract(opts: { createdAt?: Date; planId?: string; billingType?: "PIX" | "BOLETO" | "CREDIT_CARD"; now?: Date } = {}) {
    const business = await newBusiness(opts.createdAt ?? new Date())
    const planId = opts.planId ?? (await anyPlan()).id
    const { gateway, calls } = fakeGateway()
    const result = await startCheckout(db, gateway, {
      business,
      user: { id: "u1", email: "dono@teste.com" },
      planId,
      billingType: opts.billingType ?? "PIX",
      cpfCnpj: "12345678909",
      now: opts.now,
    })
    const subId = result.subscription.id
    if (result.subscription.gatewayActivationStatus === "pending") {
      assert.equal(callsFor(calls, subId).length, 0, "nada é criado no Asaas durante o trial")
      // Cron executado exatamente no fim do trial.
      await processGatewayActivations(db, gateway, result.subscription.trialEndsAt!, { retryDelayMs: 0 })
    }
    const created = callsFor(calls, subId)[0].args[0] as Record<string, unknown>
    return { business, gateway, calls, created, result }
  }

  test("TRIAL_DAYS é 7 e o fim do trial é 7 dias após o cadastro", () => {
    const createdAt = new Date("2026-11-10T12:00:00Z")
    assert.equal(TRIAL_DAYS, 7)
    assert.equal(businessTrialEnd({ createdAt }).getTime(), createdAt.getTime() + 7 * DAY)
  })

  test("cadastro novo: trial de 7 dias e primeira cobrança do Asaas agendada para o 7º dia", async () => {
    const createdAt = new Date()
    const { created, result } = await contract({ createdAt })
    const expectedEnd = new Date(createdAt.getTime() + 7 * DAY)
    assert.equal(result.subscription.status, "trialing")
    assert.equal(result.subscription.trialEndsAt!.getTime(), expectedEnd.getTime())
    assert.equal(created.nextDueDate, brazilDate(expectedEnd))
    assert.equal("maxPayments" in created, false, "assinatura recorrente, não cobrança única")
  })

  test("contratar no 5º dia não reinicia o prazo: cobrança continua no 7º dia do cadastro", async () => {
    const createdAt = new Date(Date.now() - 5 * DAY)
    const { created, result } = await contract({ createdAt })
    const expectedEnd = new Date(createdAt.getTime() + 7 * DAY)
    assert.equal(result.subscription.trialEndsAt!.getTime(), expectedEnd.getTime())
    assert.equal(created.nextDueDate, brazilDate(expectedEnd))
  })

  test("contratação após os 7 dias cobra no mesmo dia, sem novo trial", async () => {
    const now = new Date()
    const { created, result } = await contract({ createdAt: new Date(now.getTime() - 8 * DAY), now })
    assert.equal(result.subscription.trialEndsAt, null)
    assert.equal(created.nextDueDate, brazilDate(now))
  })

  test("acesso: liberado durante os 7 dias e na carência; bloqueado depois, sem pagamento", () => {
    const createdAt = new Date("2026-11-01T12:00:00Z")
    const business = { createdAt }
    assert.equal(computeBillingAccess(business, null, new Date(createdAt.getTime() + 6 * DAY), 7).state, "trial")
    assert.equal(computeBillingAccess(business, null, new Date(createdAt.getTime() + 8 * DAY), 7).allowed, false)

    const trialing = { status: "trialing" as const, trialEndsAt: new Date(createdAt.getTime() + 7 * DAY), currentPeriodEnd: null, courtesyUntil: null, cancelAtPeriodEnd: false }
    assert.equal(computeBillingAccess(business, trialing, new Date(createdAt.getTime() + 6 * DAY), 7).state, "trial")
    assert.equal(computeBillingAccess(business, trialing, new Date(createdAt.getTime() + 8 * DAY), 7).state, "trial_grace")
    assert.equal(
      computeBillingAccess(business, trialing, new Date(createdAt.getTime() + (7 + GRACE_DAYS + 1) * DAY), 7).state,
      "blocked_unpaid"
    )
  })

  test("Start, Pro e Elite (mensal e anual): valor, ciclo e trial de 7 dias corretos", async () => {
    const plans = await listPublicPlans(db)
    assert.equal(plans.length, 6)
    for (const plan of plans) {
      const createdAt = new Date()
      const { created, result } = await contract({ createdAt, planId: plan.id })
      assert.equal(created.value, plan.priceCents / 100)
      assert.equal(created.cycle, plan.billingInterval === "year" ? "YEARLY" : "MONTHLY")
      assert.equal(created.nextDueDate, brazilDate(new Date(createdAt.getTime() + 7 * DAY)))
      assert.equal(result.subscription.planId, plan.id)
      assert.equal(result.subscription.priceCents, plan.priceCents)
    }
  })

  test("a forma de pagamento escolhida (Pix, boleto, cartão) vai para o Asaas", async () => {
    for (const billingType of ["PIX", "BOLETO", "CREDIT_CARD"] as const) {
      const { created } = await contract({ billingType })
      assert.equal(created.billingType, billingType)
    }
  })
})

describe("primeira cobrança após o trial", () => {
  async function trialSub(createdAt = new Date(Date.now() - 6 * DAY)) {
    const { result } = await checkout(createdAt)
    return result.subscription
  }

  async function txs(subId: string) {
    return db.select().from(schema.billingTransactions).where(eq(schema.billingTransactions.subscriptionId, subId))
  }

  test("PAYMENT_CREATED do Asaas registra a primeira cobrança como pendente, sem criar outra", async () => {
    const sub = await trialSub(new Date())
    const before = (await txs(sub.id)).length
    await webhook(paymentEvent("PAYMENT_CREATED", sub, "pay_first_created", { confirmedDate: null }))
    const rows = await txs(sub.id)
    assert.equal(rows.length, before + 1)
    assert.equal(rows.find((t) => t.gatewayTransactionId === "pay_first_created")!.status, "pending")
    assert.equal((await getSub(sub.id)).status, "trialing", "trial segue até o pagamento ou a carência")
  })

  test("confirmação da primeira cobrança ativa a assinatura com período a partir do vencimento", async () => {
    const sub = await trialSub()
    await webhook(paymentEvent("PAYMENT_CREATED", sub, "pay_first_ok"))
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, "pay_first_ok", { dueDate: "2026-11-15" }))
    const after = await getSub(sub.id)
    assert.equal(after.status, "active")
    assert.equal(brazilDate(after.currentPeriodStart!), "2026-11-15")
    assert.ok(after.currentPeriodEnd! > after.currentPeriodStart!)
    const events = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, sub.id))
    assert.equal(events.filter((e) => e.type === "activated").length, 1)
  })

  test("renovação seguinte é registrada como renewed, sem nova cobrança criada pelo sistema", async () => {
    const sub = await trialSub()
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, "pay_cycle_1", { dueDate: "2026-11-15" }))
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, "pay_cycle_2", { dueDate: "2026-12-15", confirmedDate: "2026-12-15" }))
    const events = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, sub.id))
    assert.equal(events.filter((e) => e.type === "renewed").length, 1)
    assert.equal(brazilDate((await getSub(sub.id)).currentPeriodStart!), "2026-12-15")
  })

  test("sem duplicidade: mesma cobrança vista no checkout e no webhook gera um único registro", async () => {
    const sub = await trialSub(new Date())
    const openId = `pay_open_${sub.gatewaySubscriptionId}`
    await webhook(paymentEvent("PAYMENT_CREATED", sub, openId))
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, openId))
    await webhook(paymentEvent("PAYMENT_RECEIVED", sub, openId))
    const rows = (await txs(sub.id)).filter((t) => t.gatewayTransactionId === openId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, "approved")
  })

  test("sem duplicidade: cron repetido depois da ativação não cria outra assinatura", async () => {
    const { gateway, calls, result } = await checkout()
    const sub = result.subscription
    const later = new Date(sub.trialEndsAt!.getTime() + DAY)
    await runBillingCron(db, later, gateway)
    await runBillingCron(db, new Date(later.getTime() + DAY), gateway)
    assert.equal(callsFor(calls, sub.id).length, 1)
  })

  test("sem duplicidade: segunda contratação simultânea do mesmo estabelecimento é recusada", async () => {
    const business = await newBusiness()
    const plan = await anyPlan()
    const { gateway, calls } = fakeGateway()
    const input = { business, user: { id: "u1", email: "a@a.com" }, planId: plan.id, billingType: "PIX" as const, cpfCnpj: "12345678909" }
    const results = await Promise.allSettled([startCheckout(db, gateway, input), startCheckout(db, gateway, input)])
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
    assert.equal(calls.filter((c) => c.op === "createSubscription").length, 0)
    const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, business.id))
    assert.equal(rows.length, 1)
  })
})

describe("cobrança criada pelo cron no fim do trial", () => {
  async function txs(subId: string) {
    return db.select().from(schema.billingTransactions).where(eq(schema.billingTransactions.subscriptionId, subId))
  }

  test("nenhuma cobrança é criada durante os 7 dias, mesmo com o cron rodando todo dia", async () => {
    const { business, gateway, calls, result } = await trialCheckout()
    const sub = result.subscription
    for (let day = 0; day < 7; day++) {
      const at = new Date(sub.trialEndsAt!.getTime() - (7 - day) * DAY + 60_000)
      await runBillingCron(db, at, gateway)
      const row = await getSub(sub.id)
      assert.equal(row.gatewaySubscriptionId, null, `dia ${day + 1}`)
      assert.equal(computeBillingAccess(business, row, at, 7).allowed, true)
    }
    assert.equal(callsFor(calls, sub.id).length, 0)
    assert.equal((await txs(sub.id)).length, 0)
    // Um instante antes do fim ainda não cria.
    await processGatewayActivations(db, gateway, new Date(sub.trialEndsAt!.getTime() - 1), { retryDelayMs: 0 })
    assert.equal(callsFor(calls, sub.id).length, 0)
  })

  test("no término cria a assinatura com o valor, a periodicidade e a forma de pagamento escolhidos", async () => {
    const yearly = (await listPublicPlans(db)).find((p) => p.billingInterval === "year")!
    const { gateway, calls, result } = await trialCheckout(new Date(), yearly.id, "BOLETO")
    const sub = result.subscription
    const summary = await processGatewayActivations(db, gateway, sub.trialEndsAt!, { retryDelayMs: 0 })
    assert.ok(summary.activated >= 1)

    const created = callsFor(calls, sub.id)
    assert.equal(created.length, 1)
    const input = created[0].args[0] as Record<string, unknown>
    assert.equal(input.value, yearly.priceCents / 100)
    assert.equal(input.cycle, "YEARLY")
    assert.equal(input.billingType, "BOLETO")
    assert.equal(input.customer, sub.gatewayCustomerId)
    assert.equal(input.nextDueDate, brazilDate(sub.trialEndsAt!))

    const row = await getSub(sub.id)
    assert.ok(row.gatewaySubscriptionId)
    assert.equal(row.gatewayActivationStatus, "done")
    assert.ok(row.gatewayActivatedAt)
    assert.equal(row.status, "trialing", "aguarda o pagamento da primeira cobrança")
    assert.equal((await txs(sub.id)).filter((t) => t.status === "pending").length, 1, "primeira cobrança registrada")
    const events = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, sub.id))
    assert.equal(events.filter((e) => e.type === "created" && (e.details as { afterTrial?: boolean })?.afterTrial).length, 1)
  })

  test("execuções simultâneas do cron criam uma única assinatura", async () => {
    const { result } = await trialCheckout()
    const sub = result.subscription
    const { gateway, calls } = fakeGateway({ createDelayMs: 30 })
    const runs = await Promise.all(
      [0, 1, 2, 3].map(() => processGatewayActivations(db, gateway, sub.trialEndsAt!, { retryDelayMs: 0 }))
    )
    assert.ok(runs.every((r) => r.failedAttempts === 0))
    assert.equal(callsFor(calls, sub.id).length, 1)
    assert.ok((await getSub(sub.id)).gatewaySubscriptionId)
  })

  test("falha temporária de rede é repetida na mesma execução e se recupera", async () => {
    const { result } = await trialCheckout()
    const sub = result.subscription
    const { gateway, calls } = fakeGateway({ failCreateTimes: 2 })
    await processGatewayActivations(db, gateway, sub.trialEndsAt!, { retryDelayMs: 0 })
    assert.equal(callsFor(calls, sub.id).length, 3)
    assert.ok((await getSub(sub.id)).gatewaySubscriptionId)
  })

  test("timeout após o Asaas criar: a nova tentativa encontra a assinatura e não cria outra", async () => {
    const { result } = await trialCheckout()
    const sub = result.subscription
    const { gateway, calls } = fakeGateway({ loseCreateResponseTimes: 1 })
    await processGatewayActivations(db, gateway, sub.trialEndsAt!, { retryDelayMs: 0 })
    assert.equal(callsFor(calls, sub.id).length, 1)
    assert.ok((await getSub(sub.id)).gatewaySubscriptionId)
  })

  test("Asaas fora do ar: fica pendente, cliente mantém o acesso e a próxima execução conclui", async () => {
    const { business, result } = await trialCheckout()
    const sub = result.subscription
    const end = sub.trialEndsAt!
    const down = fakeGateway({ failCreateTimes: 99 })
    const summary = await processGatewayActivations(db, down.gateway, end, { retryDelayMs: 0 })
    assert.ok(summary.failedAttempts >= 1)
    let row = await getSub(sub.id)
    assert.equal(row.gatewayActivationStatus, "pending")
    assert.equal(row.gatewayActivationAttempts, 1)
    assert.match(row.gatewayActivationLastError ?? "", /fetch failed/)
    const failures = await db.select().from(schema.subscriptionEvents).where(eq(schema.subscriptionEvents.subscriptionId, sub.id))
    assert.equal(failures.filter((e) => e.type === "gateway_activation_failed").length, 1)
    // Sem cobrança gerada, o cliente não é bloqueado por falha nossa, nem depois da carência.
    assert.equal(computeBillingAccess(business, row, new Date(end.getTime() + (GRACE_DAYS + 2) * DAY), 7).allowed, true)

    // Dentro da janela de reserva não tenta de novo (evita chamada duplicada).
    await processGatewayActivations(db, down.gateway, new Date(end.getTime() + 60_000), { retryDelayMs: 0 })
    assert.equal((await getSub(sub.id)).gatewayActivationAttempts, 1)

    const up = fakeGateway()
    await processGatewayActivations(db, up.gateway, new Date(end.getTime() + GATEWAY_ACTIVATION_LEASE_MS + 1), { retryDelayMs: 0 })
    row = await getSub(sub.id)
    assert.ok(row.gatewaySubscriptionId)
    assert.equal(row.gatewayActivationStatus, "done")
    assert.equal(row.gatewayActivationLastError, null)
    assert.equal(callsFor(up.calls, sub.id).length, 1)
  })

  test("erro de validação (4xx) não é repetido na mesma execução", async () => {
    const { result } = await trialCheckout()
    const sub = result.subscription
    const { gateway, calls } = fakeGateway({ rejectCreate: true })
    await processGatewayActivations(db, gateway, sub.trialEndsAt!, { retryDelayMs: 0 })
    assert.equal(callsFor(calls, sub.id).length, 1)
    assert.equal((await getSub(sub.id)).gatewayActivationStatus, "pending")
  })

  test("troca de plano no trial só muda a escolha local; a assinatura nasce com o novo plano", async () => {
    const plans = await listPublicPlans(db)
    const { gateway, calls, result } = await trialCheckout(new Date(), plans[0].id)
    const target = plans.find((p) => p.id !== plans[0].id)!
    await changeOwnPlan(db, gateway, result.subscription, target.id, { userId: "u1", source: "owner" })
    assert.equal(calls.filter((c) => c.op === "updateSubscription").length, 0)
    await processGatewayActivations(db, gateway, result.subscription.trialEndsAt!, { retryDelayMs: 0 })
    const input = callsFor(calls, result.subscription.id)[0].args[0] as Record<string, unknown>
    assert.equal(input.value, target.priceCents / 100)
    assert.equal(input.cycle, target.billingInterval === "year" ? "YEARLY" : "MONTHLY")
  })

  test("cancelamento durante o trial impede a criação da cobrança", async () => {
    const { gateway, calls, result } = await trialCheckout()
    await cancelOwnSubscription(db, gateway, result.subscription, "period_end", { userId: "u1", source: "owner" }, "teste")
    await processGatewayActivations(db, gateway, result.subscription.trialEndsAt!, { retryDelayMs: 0 })
    assert.equal(callsFor(calls, result.subscription.id).length, 0)
    assert.equal(calls.filter((c) => c.op === "cancelSubscription").length, 0)
  })

  test("pagamento confirmado pelo webhook ativa e mantém o acesso", async () => {
    const { business, result } = await checkout()
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_${crypto.randomUUID()}`))
    const row = await getSub(sub.id)
    assert.equal(row.status, "active")
    assert.equal(computeBillingAccess(business, row, new Date(sub.trialEndsAt!.getTime() + 10 * DAY), 7).allowed, true)
  })

  test("sem pagamento: inadimplência, bloqueio após a carência e cancelamento no Asaas", async () => {
    const { business, result } = await checkout()
    const sub = result.subscription
    assert.ok(sub.gatewaySubscriptionId)
    await webhook(paymentEvent("PAYMENT_OVERDUE", sub, `pay_${crypto.randomUUID()}`, { confirmedDate: null }))
    const row = await getSub(sub.id)
    assert.equal(row.status, "past_due")
    const end = sub.trialEndsAt!
    assert.equal(computeBillingAccess(business, row, new Date(end.getTime() + DAY), 7).allowed, true)
    assert.equal(computeBillingAccess(business, row, new Date(end.getTime() + (GRACE_DAYS + 1) * DAY), 7).state, "blocked_unpaid")

    const { gateway, calls } = fakeGateway()
    await runBillingCron(db, new Date(end.getTime() + (GRACE_DAYS + 1) * DAY), gateway)
    assert.equal((await getSub(sub.id)).status, "expired")
    assert.equal(calls.filter((c) => c.op === "cancelSubscription" && c.args[0] === sub.gatewaySubscriptionId).length, 1)
  })
})

describe("inadimplência da primeira cobrança", () => {
  test("PAYMENT_OVERDUE no fim do trial: past_due, acesso na carência e bloqueio depois", async () => {
    const createdAt = new Date(Date.now() - 8 * DAY)
    const { business, result } = await checkout(createdAt)
    const sub = result.subscription
    const trialEnd = new Date(createdAt.getTime() + 7 * DAY)
    await db.update(schema.subscriptions).set({ trialEndsAt: trialEnd }).where(eq(schema.subscriptions.id, sub.id))
    await webhook(paymentEvent("PAYMENT_OVERDUE", sub, "pay_overdue_first", { confirmedDate: null }))
    const row = await getSub(sub.id)
    assert.equal(row.status, "past_due")
    assert.equal(computeBillingAccess(business, row, new Date(trialEnd.getTime() + DAY), 7).state, "past_due_grace")
    assert.equal(computeBillingAccess(business, row, new Date(trialEnd.getTime() + (GRACE_DAYS + 1) * DAY), 7).state, "blocked_unpaid")
  })

  test("past_due vindo do trial expira após a carência e cancela a assinatura no Asaas (para de cobrar)", async () => {
    const { result } = await checkout(new Date(Date.now() - 12 * DAY))
    const sub = result.subscription
    await db.update(schema.subscriptions).set({ trialEndsAt: new Date(Date.now() - 5 * DAY) }).where(eq(schema.subscriptions.id, sub.id))
    await webhook(paymentEvent("PAYMENT_OVERDUE", sub, "pay_overdue_exp", { confirmedDate: null }))
    assert.equal((await getSub(sub.id)).status, "past_due")

    const { gateway, calls } = fakeGateway()
    await runBillingMaintenance(db, new Date(), gateway)
    assert.equal((await getSub(sub.id)).status, "expired")
    assert.equal(calls.filter((c) => c.op === "cancelSubscription" && c.args[0] === sub.gatewaySubscriptionId).length, 1)

    await runBillingMaintenance(db, new Date(Date.now() + 60 * 60_000), gateway)
    assert.equal(
      calls.filter((c) => c.op === "cancelSubscription" && c.args[0] === sub.gatewaySubscriptionId).length,
      1,
      "cancelamento não é repetido"
    )
  })

  test("past_due de assinante que já pagou não é expirado pela regra do trial", async () => {
    const { result } = await checkout(new Date(Date.now() - 60 * DAY))
    const sub = result.subscription
    await db
      .update(schema.subscriptions)
      .set({ trialEndsAt: null, status: "past_due", currentPeriodEnd: new Date(Date.now() - 10 * DAY) })
      .where(eq(schema.subscriptions.id, sub.id))
    await runBillingMaintenance(db, new Date())
    assert.equal((await getSub(sub.id)).status, "past_due")
  })

  test("pagamento atrasado dentro da carência regulariza a assinatura", async () => {
    const { result } = await checkout(new Date(Date.now() - 8 * DAY))
    const sub = result.subscription
    await webhook(paymentEvent("PAYMENT_OVERDUE", sub, "pay_late", { confirmedDate: null }))
    await webhook(paymentEvent("PAYMENT_RECEIVED", sub, "pay_late"))
    assert.equal((await getSub(sub.id)).status, "active")
  })
})

describe("plano de teste interno descontinuado (012)", () => {
  test("migration 012 desativa o teste-5 sem alterar Start, Pro e Elite", async () => {
    const before = await db.select().from(schema.plans)
    await pg.exec(fs.readFileSync(path.join(process.cwd(), "scripts", "012-descontinuar-plano-teste.sql"), "utf8"))
    const after = await db.select().from(schema.plans)
    const test5 = after.find((p) => p.code === "teste-5")!
    assert.equal(test5.isActive, false)
    assert.equal(test5.isHidden, true)
    const pick = (rows: typeof before) =>
      rows
        .filter((p) => !p.isTest)
        .map((p) => ({ code: p.code, interval: p.billingInterval, price: p.priceCents, features: p.features, limits: p.limits, active: p.isActive, hidden: p.isHidden }))
        .sort((a, b) => `${a.code}${a.interval}`.localeCompare(`${b.code}${b.interval}`))
    assert.deepEqual(pick(after), pick(before))
    assert.equal(pick(after).length, 6)
    assert.ok(pick(after).every((p) => p.active && !p.hidden))
  })

  test("teste-5 não aparece na contratação", async () => {
    const plans = await listPublicPlans(db)
    assert.ok(!plans.some((p) => p.code === "teste-5" || p.isTest))
    assert.equal(isPlanAvailableTo({ isHidden: true, isTest: true }), false)
    assert.equal(isPlanAvailableTo({ isHidden: false, isTest: true }), false)
    assert.equal(isPlanAvailableTo({ isHidden: false, isTest: false }), true)
  })

  test("teste-5 não pode ser contratado, mesmo reativado por engano no banco", async () => {
    const test5 = await planByCode("teste-5")
    for (const active of [false, true]) {
      await db.update(schema.plans).set({ isActive: active }).where(eq(schema.plans.id, test5.id))
      const business = await newBusiness()
      const { gateway, calls } = fakeGateway()
      await assert.rejects(
        startCheckout(db, gateway, { business, user: { id: "u", email: "x@x.com" }, planId: test5.id, billingType: "PIX", cpfCnpj: "12345678909" }),
        /Plano indisponível/
      )
      assert.equal(calls.filter((c) => c.op === "createSubscription").length, 0)
    }
    await db.update(schema.plans).set({ isActive: false }).where(eq(schema.plans.id, test5.id))
  })

  test("assinante comercial não troca para o teste-5", async () => {
    const { result } = await checkout()
    const test5 = await planByCode("teste-5")
    const { gateway, calls } = fakeGateway()
    await assert.rejects(
      changeOwnPlan(db, gateway, await getSub(result.subscription.id), test5.id, { userId: "u1", source: "owner" }),
      /Plano indisponível/
    )
    assert.equal(calls.length, 0)
  })

  test("assinatura de teste já existente continua tratada pelo webhook (cobrança única)", async () => {
    const test5 = await planByCode("teste-5")
    const business = await newBusiness()
    const [legacy] = await db
      .insert(schema.subscriptions)
      .values({
        businessId: business.id,
        planId: test5.id,
        status: "awaiting_payment",
        priceCents: 500,
        billingInterval: "month",
        gatewaySubscriptionId: `sub_legacy_${crypto.randomUUID().slice(0, 8)}`,
      })
      .returning()
    await webhook({ id: `evt_${crypto.randomUUID()}`, event: "SUBSCRIPTION_INACTIVATED", subscription: { id: legacy.gatewaySubscriptionId, externalReference: legacy.id } })
    assert.equal((await getSub(legacy.id)).endedAt, null)
    await webhook(paymentEvent("PAYMENT_CONFIRMED", legacy, `pay_${crypto.randomUUID()}`, { value: 5 }))
    const paid = await getSub(legacy.id)
    assert.equal(paid.status, "active")
    assert.equal(paid.cancelAtPeriodEnd, true)
  })
})

describe("promoção de lançamento", () => {
  async function resetPromo() {
    await pg.exec("DELETE FROM promo_redemptions; UPDATE promo_campaigns SET is_active = true WHERE code = 'lancamento'")
  }

  async function promoCheckout(planCode = "start", createdAt = new Date(Date.now() - 10 * DAY)) {
    const business = await newBusiness(createdAt)
    const plan = await planByCode(planCode)
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

  async function redemptionOf(subId: string) {
    const [r] = await db.select().from(schema.promoRedemptions).where(eq(schema.promoRedemptions.subscriptionId, subId))
    return r
  }

  test("019 cria a campanha oficial: 30%, 2 ciclos, 10 vagas, Start/Pro/Elite mensais; é idempotente", async () => {
    await pg.exec(fs.readFileSync(path.join(process.cwd(), "scripts", "019-promocao-lancamento.sql"), "utf8"))
    const [c] = await db.select().from(schema.promoCampaigns).where(eq(schema.promoCampaigns.code, LAUNCH_PROMO_CODE))
    assert.equal(c.discountPercent, 30)
    assert.equal(c.discountedCycles, 2)
    assert.equal(c.maxRedemptions, 10)
    assert.deepEqual(c.planFamilies, ["start", "pro", "elite"])
    assert.deepEqual(c.billingIntervals, ["month"])
    assert.equal(discountedCents(4990, 30), 3493)
  })

  test("contratação após o trial: Asaas cobra 30% a menos e a vaga fica reservada", async () => {
    await resetPromo()
    const { plan, calls, result } = await promoCheckout()
    const input = callsFor(calls, result.subscription.id)[0].args[0] as { value: number }
    assert.equal(input.value, discountedCents(plan.priceCents, 30) / 100)
    const r = await redemptionOf(result.subscription.id)
    assert.equal(r.status, "reserved")
    assert.equal((await getSub(result.subscription.id)).priceCents, plan.priceCents, "preço do plano não é alterado")
  })

  test("contratação no trial: a assinatura criada pelo cron ao fim do trial já sai com desconto", async () => {
    await resetPromo()
    const { plan, gateway, calls, result } = await promoCheckout("pro", new Date())
    assert.equal(callsFor(calls, result.subscription.id).length, 0)
    assert.equal((await redemptionOf(result.subscription.id)).status, "reserved")
    await processGatewayActivations(db, gateway, result.subscription.trialEndsAt!, { retryDelayMs: 0 })
    const input = callsFor(calls, result.subscription.id)[0].args[0] as { value: number }
    assert.equal(input.value, discountedCents(plan.priceCents, 30) / 100)
  })

  test("2 ciclos com desconto (reenvio não conta duas vezes) e depois volta ao preço integral no Asaas", async () => {
    await resetPromo()
    const { plan, result } = await promoCheckout()
    const sub = result.subscription
    const value = discountedCents(plan.priceCents, 30) / 100
    const first = paymentEvent("PAYMENT_CONFIRMED", sub, `pay_p1_${sub.id}`, { value })
    await webhook(first)
    await webhook({ ...first, id: `evt_${crypto.randomUUID()}` })
    let r = await redemptionOf(sub.id)
    assert.equal(r.status, "confirmed")
    assert.equal(r.paidCycles, 1)

    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_p2_${sub.id}`, { value }))
    r = await redemptionOf(sub.id)
    assert.equal(r.status, "completed")
    assert.equal(r.paidCycles, 2)
    assert.equal(r.priceSyncStatus, "pending")

    const { gateway, calls } = fakeGateway()
    const summary = await processPromoPriceSync(db, gateway)
    assert.ok(summary.synced >= 1)
    const update = calls.find((c) => c.op === "updateSubscription" && c.args[0] === sub.gatewaySubscriptionId)!
    assert.equal((update.args[1] as { value: number }).value, plan.priceCents / 100)
    assert.equal((await redemptionOf(sub.id)).priceSyncStatus, "done")

    await webhook(paymentEvent("PAYMENT_CONFIRMED", sub, `pay_p3_${sub.id}`, { value: plan.priceCents / 100 }))
    assert.equal((await redemptionOf(sub.id)).paidCycles, 2, "3º ciclo é cobrado sem desconto")
  })

  test("limite de 10 vagas mesmo com checkouts simultâneos; o 11º paga preço integral", async () => {
    await resetPromo()
    const runs = await Promise.all(Array.from({ length: 11 }, () => promoCheckout()))
    const withPromo = runs.filter((r) => r.result.promo)
    assert.equal(withPromo.length, 10)
    const without = runs.find((r) => !r.result.promo)!
    const input = callsFor(without.calls, without.result.subscription.id)[0].args[0] as { value: number }
    assert.equal(input.value, without.plan.priceCents / 100)
    assert.equal(await getLaunchPromoStatus(db), null, "oferta some quando esgota")
  })

  test("checkout abandonado devolve a vaga após o prazo de reserva", async () => {
    await resetPromo()
    const { result } = await promoCheckout()
    assert.equal((await getLaunchPromoStatus(db))!.remaining, 9)
    const released = await releaseAbandonedPromoReservations(db, new Date(Date.now() + 6 * DAY))
    assert.ok(released >= 1)
    const r = await redemptionOf(result.subscription.id)
    assert.equal(r.status, "released")
    assert.equal(r.priceSyncStatus, "pending", "assinatura no Asaas volta ao preço integral")
    assert.equal((await getLaunchPromoStatus(db))!.remaining, 10)
  })

  test("planos anuais e clientes que já assinaram não recebem a promoção", async () => {
    await resetPromo()
    const annual = await promoCheckout("pro-anual")
    assert.equal(annual.result.promo, null)

    const { business } = await promoCheckout()
    await pg.exec("DELETE FROM promo_redemptions")
    assert.equal(await isBusinessEligibleForPromo(db, business.id), false)
  })
})
