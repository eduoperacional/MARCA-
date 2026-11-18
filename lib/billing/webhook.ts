import { createHash, timingSafeEqual } from "node:crypto"

import { processPromoPriceSync } from "@/lib/billing/launch-promo"
import { processAsaasEvent, recordAsaasEvent, type AsaasEvent, type BillingDb } from "@/lib/billing/process-asaas-event"

export type WebhookAuthResult = "ok" | "server_token_missing" | "header_missing" | "token_mismatch"

/** Ajustes aplicados ao normalizar um token; vão para o log para mostrar de onde veio a diferença. */
export type TokenAdjustment = "espacos" | "invisiveis" | "aspas" | "prefixo_variavel"

export type NormalizedToken = { value: string; adjustments: TokenAdjustment[] }

// Zero-width space/joiners, word joiner e BOM: vêm junto ao copiar de páginas web e o trim() não remove todos.
const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g
const ENV_PREFIX = /^ASAAS_WEBHOOK_TOKEN\s*=\s*/

/**
 * Limpa o valor de ASAAS_WEBHOOK_TOKEN. O authToken do Asaas tem de 32 a 255 caracteres, sem espaços;
 * espaços, caracteres invisíveis, aspas em volta e o nome da variável (quando a linha inteira do .env
 * é colada no painel da Vercel) são erros de configuração nossos. Nunca aplicar ao cabeçalho recebido.
 */
export function normalizeWebhookToken(raw: string | null | undefined): NormalizedToken {
  const adjustments: TokenAdjustment[] = []
  let value = raw ?? ""

  const withoutInvisible = value.replace(INVISIBLE_CHARS, "")
  if (withoutInvisible !== value) adjustments.push("invisiveis")
  value = withoutInvisible

  const trimmed = value.trim()
  if (trimmed !== value) adjustments.push("espacos")
  value = trimmed

  if (ENV_PREFIX.test(value)) {
    adjustments.push("prefixo_variavel")
    value = value.replace(ENV_PREFIX, "").trim()
  }

  const quote = value[0]
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote) {
    adjustments.push("aspas")
    value = value.slice(1, -1).trim()
  }

  return { value, adjustments }
}

/** 8 primeiros hex do SHA-256: permite comparar dois tokens nos logs sem revelar nenhum deles. */
export function tokenFingerprint(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8)
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Compara o cabeçalho `asaas-access-token` com ASAAS_WEBHOOK_TOKEN. Só o valor esperado (configuração
 * nossa) é normalizado; o cabeçalho é comparado exatamente como chegou, para que qualquer divergência
 * no que o Asaas envia apareça como recusa em vez de ser corrigida em silêncio.
 */
export function checkWebhookToken(received: string | null, expected: string | undefined): WebhookAuthResult {
  const server = normalizeWebhookToken(expected).value
  if (!server) return "server_token_missing"
  if (!received) return "header_missing"
  return safeEqual(received, server) ? "ok" : "token_mismatch"
}

export function isValidWebhookToken(received: string | null, expected: string | undefined) {
  return checkWebhookToken(received, expected) === "ok"
}

function describeExpected(raw: string | undefined) {
  const token = normalizeWebhookToken(raw)
  if (!token.value) return "esperado ausente"
  const adjusted = token.adjustments.length ? token.adjustments.join(",") : "nenhum"
  return `esperado len=${token.value.length} fp=${tokenFingerprint(token.value)} ajustes=${adjusted}`
}

/** O cabeçalho entra no log como chegou; `suspeitas` só aponta o que parece sobrar nele, sem corrigir nada. */
function describeReceived(raw: string | null) {
  if (!raw) return "recebido ausente"
  const { adjustments } = normalizeWebhookToken(raw)
  const suspicious = adjustments.length ? adjustments.join(",") : "nenhuma"
  return `recebido len=${raw.length} fp=${tokenFingerprint(raw)} suspeitas=${suspicious}`
}

/**
 * Linha de diagnóstico da recusa. Contém só tamanhos, impressões digitais curtas e o deploy em
 * execução; nenhum caractere do token. Se o fp esperado não bater com o do token salvo na Vercel,
 * o deploy em execução está com um valor antigo (variáveis só valem para deploys feitos depois da alteração).
 */
export function describeWebhookRejection(
  reason: Exclude<WebhookAuthResult, "ok">,
  received: string | null,
  expected: string | undefined,
  runtime: Record<string, string | undefined> = process.env
) {
  const deploy = runtime.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"
  return [
    `[billing] webhook Asaas recusado (401): ${reason}`,
    describeReceived(received),
    describeExpected(expected),
    `env=${runtime.VERCEL_ENV ?? "desconhecido"} deploy=${deploy}`,
  ].join(" | ")
}

/** Recebe um webhook do Asaas. Separado da rota para ser testado com um banco de teste. */
export async function handleAsaasWebhook(
  db: BillingDb,
  request: Request,
  expectedToken: string | undefined,
  /** Quando informado, restaura na hora o preço integral das promoções concluídas (o cron repete se falhar). */
  priceGateway?: Parameters<typeof processPromoPriceSync>[1]
) {
  const received = request.headers.get("asaas-access-token")
  const auth = checkWebhookToken(received, expectedToken)
  if (auth !== "ok") {
    console.error(describeWebhookRejection(auth, received, expectedToken))
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
