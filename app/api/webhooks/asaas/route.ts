import { timingSafeEqual } from "node:crypto"

import { db } from "@/lib/db"
import { processAsaasEvent, recordAsaasEvent, type AsaasEvent } from "@/lib/billing/process-asaas-event"

function validToken(received: string | null) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!validToken(request.headers.get("asaas-access-token"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as AsaasEvent | null
  if (!body || typeof body.id !== "string" || typeof body.event !== "string" || body.id.length > 200) {
    return Response.json({ error: "invalid payload" }, { status: 400 })
  }

  // Persistir primeiro: se falhar, o Asaas recebe erro e reenvia.
  const recorded = await recordAsaasEvent(db, body)
  if (!recorded) return Response.json({ error: "not persisted" }, { status: 500 })
  if (recorded.duplicate && (recorded.status === "processed" || recorded.status === "ignored")) {
    return Response.json({ received: true, duplicate: true })
  }

  // Falhas de regra de negócio ficam registradas como "failed" e não travam a fila do Asaas.
  const result = await processAsaasEvent(db, recorded.id)
  return Response.json({ received: true, result })
}
