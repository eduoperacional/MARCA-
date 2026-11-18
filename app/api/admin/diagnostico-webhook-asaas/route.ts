import { authorizeAdmin } from "@/lib/admin/auth"
import { handleWebhookTokenDiagnostic } from "@/lib/billing/webhook-diagnostic"

// TEMPORÁRIO: diagnóstico do token_mismatch do webhook Asaas. Somente leitura; remover após o diagnóstico.
export const dynamic = "force-dynamic"

export async function GET() {
  return handleWebhookTokenDiagnostic(async () => Boolean(await authorizeAdmin("subscriptions.manage")))
}
