import { isMissingTable, processWhatsappQueue } from "@/lib/whatsapp/service"
import type { QueueRunSummary } from "@/lib/whatsapp/queue"

export const maxDuration = 60

const BATCH_SIZE = 50
/** Margem abaixo do maxDuration; o bloqueio de 2 min impede que um lote interrompido seja enviado em dobro. */
const TIME_BUDGET_MS = 45_000

/**
 * Recuperação diária da fila de WhatsApp (Vercel Hobby: 1 execução por dia).
 * O envio normal é imediato; aqui só ficam pendências temporárias e entregas interrompidas.
 * Processa em lotes até esvaziar as pendências elegíveis ou atingir o limite de tempo.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const deadline = Date.now() + TIME_BUDGET_MS
    const total: QueueRunSummary = { configured: true, claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, errors: 0 }
    let batch: QueueRunSummary
    do {
      batch = await processWhatsappQueue(BATCH_SIZE)
      total.configured = batch.configured
      total.claimed += batch.claimed
      total.sent += batch.sent
      total.retry += batch.retry
      total.failed += batch.failed
      total.skipped += batch.skipped
      total.errors += batch.errors
    } while (batch.configured && batch.claimed === BATCH_SIZE && Date.now() < deadline)

    console.info(
      total.configured
        ? `[whatsapp-cron] reservadas ${total.claimed} | enviadas ${total.sent} | nova tentativa ${total.retry} | ` +
            `falhas ${total.failed} | ignoradas ${total.skipped} | erros ${total.errors}`
        : "[whatsapp-cron] credenciais da Meta ausentes: fila não processada"
    )
    return Response.json(total)
  } catch (error) {
    if (isMissingTable(error)) return Response.json({ skipped: "script 015 não executado" })
    console.error("[whatsapp-cron] falha", error)
    return Response.json({ error: "internal" }, { status: 500 })
  }
}
