import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import type { PushRunSummary } from "@/lib/push/queue"
import { enqueueDueReminders, getPushConfigIssues, isMissingTable, processPushDeliveries } from "@/lib/push/service"

export const maxDuration = 60

const BATCH_SIZE = 50
/** Margem abaixo do maxDuration; o bloqueio de 2 min impede que um lote interrompido seja enviado em dobro. */
const TIME_BUDGET_MS = 45_000

/**
 * Lembretes e recuperação da fila de push, chamada a cada 5 minutos por um agendador externo
 * (GET com `Authorization: Bearer CRON_SECRET`). Novos agendamentos, cancelamentos e reagendamentos
 * são enviados logo após a resposta; aqui ficam os lembretes, novas tentativas e entregas interrompidas.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const reminders = await enqueueDueReminders()
    const deadline = Date.now() + TIME_BUDGET_MS
    const total: PushRunSummary = { configured: true, claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, errors: 0 }
    let batch: PushRunSummary
    do {
      batch = await processPushDeliveries(BATCH_SIZE)
      total.configured = batch.configured
      total.claimed += batch.claimed
      total.sent += batch.sent
      total.retry += batch.retry
      total.failed += batch.failed
      total.skipped += batch.skipped
      total.errors += batch.errors
    } while (batch.configured && batch.claimed === BATCH_SIZE && Date.now() < deadline)

    const configIssues = total.configured ? [] : getPushConfigIssues()
    console.info(
      total.configured
        ? `[push-cron] lembretes ${reminders.queued} | reservadas ${total.claimed} | enviadas ${total.sent} | ` +
            `nova tentativa ${total.retry} | falhas ${total.failed} | ignoradas ${total.skipped} | erros ${total.errors}`
        : `[push-cron] configuração VAPID indisponível: ${configIssues.join("; ")}`
    )
    return Response.json({ ...total, reminders, ...(total.configured ? {} : { configIssues }) })
  } catch (error) {
    if (isMissingTable(error)) return Response.json({ skipped: "script 017 não executado" })
    console.error("[push-cron] falha", error)
    return Response.json({ error: "internal" }, { status: 500 })
  }
}
