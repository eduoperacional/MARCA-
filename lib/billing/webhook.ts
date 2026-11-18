import { timingSafeEqual } from "node:crypto"

import { processPromoPriceSync } from "@/lib/billing/launch-promo"
import { processAsaasEvent, recordAsaasEvent, type AsaasEvent, type BillingDb } from "@/lib/billing/process-asaas-event"

export type WebhookAuthResult = "ok" | "server_token_missing" | "header_missing" | "token_mismatch"

/**
 * Compara o cabeçalho `asaas-access-token` com ASAAS_WEBHOOK_TOKEN.
 * Espaços e quebras de linha nas pontas são descartados nos dois lados: é comum o valor
 * ganhar um "\n" ao ser colado no painel da Vercel ou do Asaas, o que derrubava toda a fila com 401.
 */
export function checkWebhookToken(received: string | null, expected: string | undefined): WebhookAuthResult {
  const server = expected?.trim()
  if (!server) return "server_token_missing"
  const header = received?.trim()
  if (!header) return "header_missing"
  const a = Buffer.from(header)
  const b = Buffer.from(server)
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "token_mismatch"
}

export function isValidWebhookToken(received: string | null, expected: string | undefined) {
  return checkWebhookToken(received, expected) === "ok"
}

/** Recebe um webhook do Asaas. Separado da rota para ser testado com um banco de teste. */
export async function handleAsaasWebhook(
  db: BillingDb,
  request: Request,
  expectedToken: string | undefined,
  /** Quando informado, restaura na hora o preço integral das promoções concluídas (o cron repete se falhar). */
  priceGateway?: Parameters<typeof processPromoPriceSync>[1]
) {
  const auth = checkWebhookToken(request.headers.get("asaas-access-token"), expectedToken)
  if (auth !== "ok") {
    // Só o motivo é registrado; nenhum valor de token entra no log.
    console.error(`[billing] webhook Asaas recusado (401): ${auth}`)
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
