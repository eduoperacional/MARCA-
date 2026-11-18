import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_PUSH_PREFERENCES,
  MAX_ATTEMPTS,
  appointmentUrl,
  buildPayload,
  dedupeKeyFor,
  enqueueAppointmentPush,
  eventAllowed,
  processPushDelivery,
  processPushQueue,
  retryDelayMs,
  type AppointmentSnapshot,
  type ClaimedPushDelivery,
  type DeliveryTarget,
  type NewPushDelivery,
  type PushDeps,
  type PushStore,
  type Recipient,
} from "../lib/push/queue"
import { classifyPushStatus, isAllowedPushEndpoint, type PushSendResult } from "../lib/push/web-push"

const NOW = new Date("2026-11-17T12:00:00Z")
const BUSINESS = "11111111-1111-1111-1111-111111111111"

const snapshot: AppointmentSnapshot = {
  appointmentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  businessId: BUSINESS,
  professionalId: "pppppppp-pppp-pppp-pppp-pppppppppppp",
  clientName: "Ana",
  serviceName: "Corte",
  professionalName: "Bruno",
  startsAt: new Date("2026-11-18T14:00:00Z"),
  updatedAt: new Date("2026-11-17T11:59:00Z"),
}

function fakeStore(recipients: Recipient[], target: DeliveryTarget | null = null) {
  const keys = new Set<string>()
  const calls: string[] = []
  const inserted: NewPushDelivery[] = []
  const store: PushStore = {
    async listRecipients() {
      return recipients
    },
    async insertPending(rows) {
      const ids: string[] = []
      for (const row of rows) {
        const key = `${row.subscriptionId}|${row.dedupeKey}`
        if (keys.has(key)) continue
        keys.add(key)
        inserted.push(row)
        ids.push(`d${inserted.length}`)
      }
      return ids
    },
    async claim() {
      return []
    },
    async getTarget() {
      return target
    },
    async markSent(id) {
      calls.push(`sent:${id}`)
    },
    async scheduleRetry(id, _e, next) {
      calls.push(`retry:${id}:${next.getTime() - NOW.getTime()}`)
    },
    async markFailed(id, error) {
      calls.push(`failed:${id}:${error}`)
    },
    async markSkipped(id, reason) {
      calls.push(`skipped:${id}:${reason}`)
    },
    async revokeSubscription(sub, reason) {
      calls.push(`revoke:${sub}:${reason}`)
    },
  }
  return { store, calls, inserted }
}

function deps(store: PushStore, result: PushSendResult | Error = { ok: true, status: 201 }, configured = true): PushDeps {
  return {
    store,
    now: () => NOW,
    sender: {
      isConfigured: () => configured,
      async send() {
        if (result instanceof Error) throw result
        return result
      },
    },
  }
}

const recipient: Recipient = { subscriptionId: "s1", userId: "u1", preferences: DEFAULT_PUSH_PREFERENCES }
const activeTarget: DeliveryTarget = {
  endpoint: "https://fcm.googleapis.com/fcm/send/x",
  p256dh: "k",
  auth: "a",
  active: true,
  preferences: DEFAULT_PUSH_PREFERENCES,
}

function claimed(overrides: Partial<ClaimedPushDelivery> = {}): ClaimedPushDelivery {
  return {
    id: "d1",
    businessId: BUSINESS,
    subscriptionId: "s1",
    appointmentId: snapshot.appointmentId,
    event: "new_booking",
    payload: buildPayload("new_booking", snapshot, { sound: true, formatWhen: () => "amanhã 11:00", now: NOW }),
    attempts: 1,
    maxAttempts: MAX_ATTEMPTS,
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...overrides,
  }
}

const enqueue = (d: PushDeps, event: "new_booking" | "reminder" = "new_booking", snap = snapshot) =>
  enqueueAppointmentPush(d, { businessId: BUSINESS, event, loadSnapshot: async () => snap, formatWhen: () => "amanhã 11:00" })

test("payload inclui cliente, serviço, profissional, horário e link do agendamento", () => {
  const p = buildPayload("new_booking", snapshot, { sound: false, formatWhen: () => "18/11 às 11:00", now: NOW })
  assert.match(p.title, /Novo agendamento · Ana/)
  assert.match(p.body, /Corte com Bruno/)
  assert.match(p.body, /18\/11 às 11:00/)
  assert.equal(p.url, appointmentUrl(snapshot.appointmentId))
  assert.equal(p.silent, true)
  assert.equal(p.tag, `appt-${snapshot.appointmentId}`)
})

test("chaves de idempotência por evento", () => {
  assert.equal(dedupeKeyFor("new_booking", snapshot), `new_booking:${snapshot.appointmentId}`)
  const moved = { ...snapshot, startsAt: new Date("2026-11-19T14:00:00Z"), updatedAt: NOW }
  assert.notEqual(dedupeKeyFor("reschedule", snapshot), dedupeKeyFor("reschedule", moved))
  assert.notEqual(dedupeKeyFor("reminder", snapshot), dedupeKeyFor("reminder", moved))
})

test("preferências bloqueiam eventos desligados e o push desativado", () => {
  assert.equal(eventAllowed({ ...DEFAULT_PUSH_PREFERENCES, notifyCancellation: false }, "cancellation"), false)
  assert.equal(eventAllowed({ ...DEFAULT_PUSH_PREFERENCES, enabled: false }, "new_booking"), false)
  assert.equal(eventAllowed({ ...DEFAULT_PUSH_PREFERENCES, enabled: false }, "test"), true)
})

test("enfileirar duas vezes o mesmo evento não duplica", async () => {
  const { store, inserted } = fakeStore([recipient])
  assert.equal((await enqueue(deps(store))).status, "queued")
  assert.deepEqual(await enqueue(deps(store)), { status: "duplicate" })
  assert.equal(inserted.length, 1)
})

test("sem VAPID, sem destinatários, de outro estabelecimento ou lembrete vencido: não enfileira", async () => {
  const { store } = fakeStore([recipient])
  assert.deepEqual(await enqueue(deps(store, undefined, false)), { status: "skipped", reason: "not_configured" })
  assert.deepEqual(await enqueue(deps(fakeStore([]).store)), { status: "skipped", reason: "no_recipients" })
  assert.deepEqual(await enqueue(deps(store), "new_booking", { ...snapshot, businessId: "outro" }), {
    status: "skipped",
    reason: "no_appointment",
  })
  assert.deepEqual(await enqueue(deps(store), "reminder", { ...snapshot, startsAt: new Date(NOW.getTime() - 1) }), {
    status: "skipped",
    reason: "expired",
  })
})

test("enfileirar nunca lança erro", async () => {
  const { store } = fakeStore([recipient])
  store.listRecipients = async () => {
    throw new Error("db down")
  }
  assert.deepEqual(await enqueue(deps(store)), { status: "error" })
})

test("envio bem-sucedido marca como enviado", async () => {
  const { store, calls } = fakeStore([], activeTarget)
  assert.equal(await processPushDelivery(deps(store), claimed()), "sent")
  assert.deepEqual(calls, ["sent:d1"])
})

test("inscrição vencida (410) é revogada e a entrega ignorada", async () => {
  const { store, calls } = fakeStore([], activeTarget)
  const result = await processPushDelivery(deps(store, { ok: false, kind: "gone", status: 410, error: "gone" }), claimed())
  assert.equal(result, "skipped")
  assert.deepEqual(calls, ["revoke:s1:expired", "skipped:d1:subscription_expired"])
})

test("falha temporária agenda nova tentativa com backoff; última tentativa falha", async () => {
  const fail: PushSendResult = { ok: false, kind: "retry", status: 503, error: "busy" }
  const a = fakeStore([], activeTarget)
  assert.equal(await processPushDelivery(deps(a.store, fail), claimed({ attempts: 2 })), "retry")
  assert.deepEqual(a.calls, [`retry:d1:${retryDelayMs(2)}`])

  const b = fakeStore([], activeTarget)
  assert.equal(await processPushDelivery(deps(b.store, fail), claimed({ attempts: MAX_ATTEMPTS })), "failed")
  assert.deepEqual(b.calls, ["failed:d1:busy"])
})

test("erro de rede vira nova tentativa", async () => {
  const { store, calls } = fakeStore([], activeTarget)
  assert.equal(await processPushDelivery(deps(store, new Error("ECONNRESET")), claimed()), "retry")
  assert.match(calls[0], /^retry:d1:/)
})

test("entrega expirada, inscrição inativa ou evento desligado não é enviada", async () => {
  const a = fakeStore([], activeTarget)
  assert.equal(await processPushDelivery(deps(a.store), claimed({ expiresAt: new Date(NOW.getTime() - 1) })), "failed")
  assert.deepEqual(a.calls, ["failed:d1:expired"])

  const b = fakeStore([], { ...activeTarget, active: false })
  assert.equal(await processPushDelivery(deps(b.store), claimed()), "skipped")
  assert.deepEqual(b.calls, ["skipped:d1:subscription_inactive"])

  const c = fakeStore([], { ...activeTarget, preferences: { ...DEFAULT_PUSH_PREFERENCES, notifyNewBooking: false } })
  assert.equal(await processPushDelivery(deps(c.store), claimed()), "skipped")
  assert.deepEqual(c.calls, ["skipped:d1:disabled_by_user"])
})

test("fila sem VAPID não reserva nada", async () => {
  const { store } = fakeStore([])
  let claimedCalls = 0
  store.claim = async () => {
    claimedCalls++
    return []
  }
  const summary = await processPushQueue(deps(store, undefined, false))
  assert.equal(summary.configured, false)
  assert.equal(claimedCalls, 0)
})

test("classificação de status e endpoints permitidos", () => {
  assert.equal(classifyPushStatus(201), "sent")
  assert.equal(classifyPushStatus(410), "gone")
  assert.equal(classifyPushStatus(404), "gone")
  assert.equal(classifyPushStatus(429), "retry")
  assert.equal(classifyPushStatus(500), "retry")
  assert.equal(classifyPushStatus(400), "fail")
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true)
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false)
  assert.equal(isAllowedPushEndpoint("https://evil.example.com/x"), false)
})
