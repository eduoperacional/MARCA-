import assert from "node:assert/strict"
import { test } from "node:test"

import { normalizeWhatsappPhone } from "../lib/phone"
import {
  DELIVERY_TTL_MS,
  MAX_ATTEMPTS,
  dedupeKeyFor,
  enqueueOwnerNotification,
  isRetryableProviderError,
  processQueue,
  retryDelayMs,
  retryFailedDelivery,
  type AppointmentSnapshot,
  type ClaimedDelivery,
  type ConsentSettings,
  type DeliveryStatus,
  type NewDelivery,
  type NotificationEvent,
  type QueueDeps,
  type QueueSender,
  type QueueStore,
  type SendResult,
} from "../lib/whatsapp/queue"
import { toWhatsappNumber } from "../lib/whatsapp/templates"

type Row = NewDelivery & {
  id: string
  status: DeliveryStatus
  attempts: number
  lockedUntil: Date | null
  lastError: string | null
  sentAt: Date | null
}

/** Simula a tabela whatsapp_deliveries: índice único (business_id, dedupe_key) e reserva por status/horário. */
function memoryStore(settingsByBusiness: Record<string, ConsentSettings | null>) {
  const rows: Row[] = []
  let seq = 0
  const store: QueueStore = {
    async getSettings(businessId) {
      return settingsByBusiness[businessId] ?? null
    },
    async insertPending(row) {
      if (rows.some((r) => r.businessId === row.businessId && r.dedupeKey === row.dedupeKey)) return null
      const id = `d${++seq}`
      rows.push({ ...row, id, status: "pending", attempts: 0, lockedUntil: null, lastError: null, sentAt: null })
      return id
    },
    async claim({ now, lockUntil, limit, id }) {
      const eligible = rows.filter(
        (r) =>
          (!id || r.id === id) &&
          ((r.status === "pending" && r.nextAttemptAt <= now) ||
            (r.status === "processing" && r.lockedUntil !== null && r.lockedUntil <= now))
      )
      return eligible.slice(0, limit).map((r): ClaimedDelivery => {
        r.status = "processing"
        r.attempts++
        r.lockedUntil = lockUntil
        return { id: r.id, businessId: r.businessId, appointmentId: r.appointmentId, event: r.event, params: r.params, attempts: r.attempts, maxAttempts: r.maxAttempts, expiresAt: r.expiresAt }
      })
    },
    async markSent(id, _to, _messageId, now) {
      const r = rows.find((x) => x.id === id)!
      Object.assign(r, { status: "sent", sentAt: now, lockedUntil: null })
    },
    async scheduleRetry(id, error, nextAttemptAt) {
      const r = rows.find((x) => x.id === id)!
      Object.assign(r, { status: "pending", lastError: error, nextAttemptAt, lockedUntil: null })
    },
    async markFailed(id, error) {
      const r = rows.find((x) => x.id === id)!
      Object.assign(r, { status: "failed", lastError: error, lockedUntil: null })
    },
    async markSkipped(id, reason) {
      const r = rows.find((x) => x.id === id)!
      Object.assign(r, { status: "skipped", lastError: reason, lockedUntil: null })
    },
    async requeueFailed(businessId, id, now, expiresAt) {
      const r = rows.find((x) => x.id === id && x.businessId === businessId && x.status === "failed")
      if (!r) return false
      Object.assign(r, { status: "pending", attempts: 0, nextAttemptAt: now, expiresAt, lastError: null })
      return true
    },
  }
  return { store, rows }
}

function fakeSender(results: Array<SendResult | Error>, configured = true) {
  const calls: Array<{ to: string; event: NotificationEvent; params: string[] }> = []
  const sender: QueueSender = {
    isConfigured: () => configured,
    async send(input) {
      calls.push(input)
      const next = results.length > 1 ? results.shift()! : results[0]
      if (next instanceof Error) throw next
      return next
    },
  }
  return { sender, calls }
}

const OK: SendResult = { ok: true, messageId: "wamid.1" }
const TEMP_FAIL: SendResult = { ok: false, reason: "provider_error", error: "rate limit", retryable: true }
const PERM_FAIL: SendResult = { ok: false, reason: "provider_error", error: "template não aprovado", retryable: false }

const consented = (phone = "11988887777"): ConsentSettings => ({
  phone,
  enabled: true,
  consentAt: new Date("2026-11-01T12:00:00Z"),
  notifyNewBooking: true,
  notifyCancellation: true,
  notifyReschedule: true,
})

const snapshot = (over: Partial<AppointmentSnapshot> = {}): AppointmentSnapshot => ({
  appointmentId: "apt-1",
  businessId: "biz-a",
  businessName: "Barbearia A",
  clientName: "João",
  serviceName: "Corte",
  professionalName: "Carlos",
  startsAt: new Date("2026-11-20T13:00:00Z"),
  updatedAt: new Date("2026-11-16T10:00:00Z"),
  ...over,
})

function clock(start = new Date("2026-11-16T12:00:00Z")) {
  let t = start.getTime()
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) }
}

const formatWhen = (d: Date) => d.toISOString()

function enqueue(deps: QueueDeps, event: NotificationEvent, snap: AppointmentSnapshot, businessId = snap.businessId) {
  return enqueueOwnerNotification(deps, { businessId, event, loadSnapshot: async () => snap, formatWhen })
}

test("registra como pending antes de chamar a Meta", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([OK])
  const result = await enqueue({ store, sender }, "new_booking", snapshot())
  assert.equal(result.status, "queued")
  assert.equal(rows[0].status, "pending")
  assert.equal(calls.length, 0, "enfileirar não deve chamar a Meta")
})

test("falha temporária da Meta agenda nova tentativa com backoff e depois envia", async () => {
  const c = clock()
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([TEMP_FAIL, OK])
  const deps: QueueDeps = { store, sender, now: c.now }
  await enqueue(deps, "new_booking", snapshot())

  const first = await processQueue(deps)
  assert.equal(first.retry, 1)
  assert.equal(rows[0].status, "pending")
  assert.equal(rows[0].lastError, "rate limit")
  assert.equal(rows[0].nextAttemptAt.getTime() - c.now().getTime(), retryDelayMs(1))

  const tooEarly = await processQueue(deps)
  assert.equal(tooEarly.claimed, 0, "não reprocessa antes do backoff")

  c.advance(retryDelayMs(1))
  const second = await processQueue(deps)
  assert.equal(second.sent, 1)
  assert.equal(rows[0].status, "sent")
  assert.equal(rows[0].attempts, 2)
  assert.equal(calls.length, 2)
})

test("backoff é progressivo e limitado", () => {
  const delays = [1, 2, 3, 4, 9].map(retryDelayMs)
  for (let i = 1; i < 4; i++) assert.ok(delays[i] > delays[i - 1])
  assert.equal(delays[4], delays[3])
})

test("respeita o limite de tentativas e marca como failed", async () => {
  const c = clock()
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([TEMP_FAIL])
  const deps: QueueDeps = { store, sender, now: c.now }
  await enqueue(deps, "new_booking", snapshot())

  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
    await processQueue(deps)
    c.advance(retryDelayMs(4))
  }
  assert.equal(calls.length, MAX_ATTEMPTS)
  assert.equal(rows[0].status, "failed")
})

test("erro permanente da Meta não gera novas tentativas", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([PERM_FAIL])
  const deps: QueueDeps = { store, sender }
  await enqueue(deps, "new_booking", snapshot())
  const summary = await processQueue(deps)
  assert.equal(summary.failed, 1)
  assert.equal(rows[0].status, "failed")
  assert.equal(calls.length, 1)
})

test("exceção de rede é tratada como falha temporária", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender } = fakeSender([new Error("ECONNRESET"), OK])
  const deps: QueueDeps = { store, sender }
  await enqueue(deps, "new_booking", snapshot())
  const summary = await processQueue(deps)
  assert.equal(summary.retry, 1)
  assert.equal(rows[0].status, "pending")
})

test("aviso expirado em 24h é encerrado sem envio", async () => {
  const c = clock()
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([OK])
  const deps: QueueDeps = { store, sender, now: c.now }
  await enqueue(deps, "new_booking", snapshot())
  c.advance(DELIVERY_TTL_MS + 1)
  await processQueue(deps)
  assert.equal(rows[0].status, "failed")
  assert.equal(calls.length, 0)
})

test("falhas podem ser reprocessadas manualmente", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender } = fakeSender([PERM_FAIL, OK])
  const deps: QueueDeps = { store, sender }
  await enqueue(deps, "new_booking", snapshot())
  await processQueue(deps)
  assert.equal(rows[0].status, "failed")

  assert.equal(await retryFailedDelivery(deps, "biz-a", rows[0].id), true)
  assert.equal(rows[0].status, "pending")
  await processQueue(deps)
  assert.equal(rows[0].status, "sent")
})

test("processamento interrompido volta a ser elegível após o bloqueio vencer", async () => {
  const c = clock()
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender } = fakeSender([OK])
  const deps: QueueDeps = { store, sender, now: c.now }
  await enqueue(deps, "new_booking", snapshot())
  await store.claim({ now: c.now(), lockUntil: new Date(c.now().getTime() + 60_000), limit: 10 })
  assert.equal((await processQueue(deps)).claimed, 0, "bloqueio ativo impede reprocessamento simultâneo")
  c.advance(60_001)
  await processQueue(deps)
  assert.equal(rows[0].status, "sent")
})

test("prevenção de duplicidade: o mesmo evento enfileirado duas vezes gera um único envio", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([OK])
  const deps: QueueDeps = { store, sender }
  const snap = snapshot()
  assert.equal((await enqueue(deps, "new_booking", snap)).status, "queued")
  assert.equal((await enqueue(deps, "new_booking", snap)).status, "duplicate")
  assert.equal((await enqueue(deps, "reschedule", snap)).status, "queued")
  assert.equal((await enqueue(deps, "reschedule", snap)).status, "duplicate")
  await processQueue(deps)
  await processQueue(deps)
  assert.equal(rows.length, 2)
  assert.equal(calls.length, 2)
})

test("reagendamentos sucessivos legítimos geram avisos distintos", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([OK])
  const deps: QueueDeps = { store, sender }
  const first = snapshot({ startsAt: new Date("2026-11-21T13:00:00Z"), updatedAt: new Date("2026-11-16T10:00:00Z") })
  const second = snapshot({ startsAt: new Date("2026-11-22T15:00:00Z"), updatedAt: new Date("2026-11-16T11:00:00Z") })
  const backToFirstTime = snapshot({ startsAt: first.startsAt, updatedAt: new Date("2026-11-16T12:00:00Z") })

  for (const s of [first, second, backToFirstTime]) assert.equal((await enqueue(deps, "reschedule", s)).status, "queued")
  await processQueue(deps)
  assert.equal(rows.length, 3)
  assert.equal(calls.length, 3)
  assert.notEqual(dedupeKeyFor("reschedule", first), dedupeKeyFor("reschedule", backToFirstTime))
})

test("notificações desativadas não enfileiram nem enviam", async () => {
  const { store, rows } = memoryStore({ "biz-a": { ...consented(), enabled: false } })
  const { sender, calls } = fakeSender([OK])
  const result = await enqueue({ store, sender }, "new_booking", snapshot())
  assert.deepEqual(result, { status: "skipped", reason: "disabled" })
  assert.equal(rows.length, 0)
  assert.equal(calls.length, 0)
})

test("evento desligado individualmente não envia", async () => {
  const { store } = memoryStore({ "biz-a": { ...consented(), notifyCancellation: false } })
  const { sender } = fakeSender([OK])
  const result = await enqueue({ store, sender }, "cancellation", snapshot())
  assert.deepEqual(result, { status: "skipped", reason: "event_disabled" })
})

test("sem consentimento registrado não envia, mesmo com número e ativação", async () => {
  const { store, rows } = memoryStore({ "biz-a": { ...consented(), consentAt: null } })
  const { sender, calls } = fakeSender([OK])
  const result = await enqueue({ store, sender }, "new_booking", snapshot())
  assert.deepEqual(result, { status: "skipped", reason: "no_consent" })
  assert.equal(rows.length, 0)
  assert.equal(calls.length, 0)
})

test("sem preferências cadastradas não envia", async () => {
  const { store } = memoryStore({})
  const { sender } = fakeSender([OK])
  assert.deepEqual(await enqueue({ store, sender }, "new_booking", snapshot()), { status: "skipped", reason: "no_settings" })
})

test("consentimento retirado depois de enfileirar impede o envio", async () => {
  const settings: Record<string, ConsentSettings | null> = { "biz-a": consented() }
  const { store, rows } = memoryStore(settings)
  const { sender, calls } = fakeSender([OK])
  const deps: QueueDeps = { store, sender }
  await enqueue(deps, "new_booking", snapshot())
  settings["biz-a"] = { ...consented(), enabled: false }
  await processQueue(deps)
  assert.equal(rows[0].status, "skipped")
  assert.equal(calls.length, 0)
})

test("sem credenciais da Meta: nada é gravado, nada é reservado, nada é enviado", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender, calls } = fakeSender([OK], false)
  const deps: QueueDeps = { store, sender }
  assert.deepEqual(await enqueue(deps, "new_booking", snapshot()), { status: "skipped", reason: "not_configured" })
  const summary = await processQueue(deps)
  assert.equal(summary.configured, false)
  assert.equal(summary.claimed, 0)
  assert.equal(rows.length, 0)
  assert.equal(calls.length, 0)
})

test("isolamento: agendamento de outro estabelecimento não é enfileirado", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented(), "biz-b": consented("21977776666") })
  const { sender } = fakeSender([OK])
  const result = await enqueue({ store, sender }, "new_booking", snapshot({ businessId: "biz-b" }), "biz-a")
  assert.deepEqual(result, { status: "skipped", reason: "no_appointment" })
  assert.equal(rows.length, 0)
})

test("isolamento: cada estabelecimento recebe no próprio número e a deduplicação é por estabelecimento", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented("11988887777"), "biz-b": consented("21977776666") })
  const { sender, calls } = fakeSender([OK])
  const deps: QueueDeps = { store, sender }
  await enqueue(deps, "new_booking", snapshot({ businessId: "biz-a" }))
  await enqueue(deps, "new_booking", snapshot({ businessId: "biz-b" }))
  await processQueue(deps)
  assert.equal(rows.length, 2)
  assert.deepEqual(calls.map((c) => c.to).sort(), ["5511988887777", "5521977776666"])
})

test("isolamento: um estabelecimento não reprocessa falha de outro", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender } = fakeSender([PERM_FAIL])
  const deps: QueueDeps = { store, sender }
  await enqueue(deps, "new_booking", snapshot())
  await processQueue(deps)
  assert.equal(await retryFailedDelivery(deps, "biz-b", rows[0].id), false)
  assert.equal(rows[0].status, "failed")
})

test("falha ao enfileirar nunca lança erro para o fluxo do agendamento", async () => {
  const { store } = memoryStore({ "biz-a": consented() })
  store.insertPending = async () => {
    throw new Error("relation whatsapp_deliveries does not exist")
  }
  const { sender } = fakeSender([OK])
  const logs: string[] = []
  const result = await enqueue({ store, sender, log: (m) => logs.push(m) }, "new_booking", snapshot())
  assert.deepEqual(result, { status: "error" })
  assert.equal(logs.length, 1)
})

test("erro inesperado ao processar uma entrega não interrompe a fila", async () => {
  const { store, rows } = memoryStore({ "biz-a": consented() })
  const { sender } = fakeSender([OK])
  const deps: QueueDeps = { store, sender, log: () => {} }
  await enqueue(deps, "new_booking", snapshot({ appointmentId: "apt-1" }))
  await enqueue(deps, "new_booking", snapshot({ appointmentId: "apt-2" }))
  const original = store.markSent
  let first = true
  store.markSent = async (...args) => {
    if (first) {
      first = false
      throw new Error("db offline")
    }
    return original(...args)
  }
  const summary = await processQueue(deps)
  assert.equal(summary.errors, 1)
  assert.equal(summary.sent, 1)
  assert.equal(rows[1].status, "sent")
})

test("classificação de falhas temporárias da Meta", () => {
  assert.equal(isRetryableProviderError(429), true)
  assert.equal(isRetryableProviderError(503), true)
  assert.equal(isRetryableProviderError(400, 130429), true)
  assert.equal(isRetryableProviderError(400, 132001), false)
  assert.equal(isRetryableProviderError(401), false)
})

test("normalização única do telefone: onboarding e configurações produzem o mesmo valor", () => {
  const inputs = ["(11) 98888-7777", "11988887777", "+55 11 98888-7777", "5511988887777"]
  const stored = new Set(inputs.map(normalizeWhatsappPhone))
  assert.deepEqual([...stored], ["11988887777"])
  assert.equal(toWhatsappNumber("11988887777"), "5511988887777")
  assert.equal(normalizeWhatsappPhone("98888-7777"), null)
  assert.equal(normalizeWhatsappPhone(""), null)
})
