import { db } from "@/lib/db"
import * as asaas from "@/lib/billing/asaas"
import { runBillingCron } from "@/lib/billing/self-service"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const configured = asaas.isAsaasConfigured()
  const result = await runBillingCron(db, new Date(), configured ? asaas : undefined)
  const { concluded, failedAttempts, pending, failed } = result.gatewayCancel
  const activation = result.activation
  console.info(
    (activation
      ? `[billing-cron] assinaturas criadas após o trial: ${activation.activated} | falhas nesta execução ${activation.failedAttempts}, ` +
        `pendentes ${activation.pending} | `
      : "[billing-cron] ") +
      `assinaturas encerradas: ${result.updated} | cancelamentos no Asaas: concluídos ${concluded}, ` +
      `falhas nesta execução ${failedAttempts}, pendentes ${pending}, falhas definitivas ${failed}` +
      (configured ? "" : " | ASAAS_API_KEY ausente: filas não processadas")
  )
  return Response.json(result)
}
