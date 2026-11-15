import { db } from "@/lib/db"
import * as asaas from "@/lib/billing/asaas"
import { runBillingMaintenance } from "@/lib/billing/subscriptions"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const configured = asaas.isAsaasConfigured()
  const result = await runBillingMaintenance(db, new Date(), configured ? asaas : undefined)
  const { concluded, failedAttempts, pending, failed } = result.gatewayCancel
  console.info(
    `[billing-cron] assinaturas encerradas: ${result.updated} | cancelamentos no Asaas: concluídos ${concluded}, ` +
      `falhas nesta execução ${failedAttempts}, pendentes ${pending}, falhas definitivas ${failed}` +
      (configured ? "" : " | ASAAS_API_KEY ausente: fila não processada")
  )
  return Response.json(result)
}
