import { timingSafeEqual } from "node:crypto"

import { processPromoPriceSync } from "@/lib/billing/launch-promo"
import { processAsaasEvent, recordAsaasEvent, type AsaasEvent, type BillingDb } from "@/lib/billing/process-asaas-event"

export function isValidWebhookToken(received: string | null, expected: string | undefined) {
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Recebe um webhook do Asaas. Separado da rota para ser testado com um banco de teste. */
export async function handleAsaasWebhook(
  db: BillingDb,
  request: Request,
  expectedToken: string | undefined,
  /** Quando informado, restaura na hora o preço integral das promoções concluídas (o cron repete se falhar). */
  priceGateway?: Parameters<typeof processPromoPriceSync>[1]
) {
  if (!isValidWebhookToken(request.headers.get("asaas-access-token"), expectedToken)) {
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
  if (result === "processed" && priceGateway) {
    await processPromoPriceSync(db, priceGateway).catch((error) => console.error("[billing] fila de preço promocional", error))
  }
  return Response.json({ received: true, result })
}
