import { db } from "@/lib/db"
import * as asaas from "@/lib/billing/asaas"
import { handleAsaasWebhook } from "@/lib/billing/webhook"

export async function POST(request: Request) {
  return handleAsaasWebhook(db, request, process.env.ASAAS_WEBHOOK_TOKEN, asaas.isAsaasConfigured() ? asaas : undefined)
}
