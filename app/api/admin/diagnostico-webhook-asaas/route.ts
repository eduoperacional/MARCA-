import { connection } from "next/server"
import { authorizeAdmin } from "@/lib/admin/auth"
import { handleWebhookTokenDiagnostic } from "@/lib/billing/webhook-diagnostic"

// TEMPORÁRIO: diagnóstico do token_mismatch do webhook Asaas. Somente leitura; remover após o diagnóstico.
// Com cacheComponents, `export const dynamic` é proibido; connection() garante execução por request.
export async function GET() {
  await connection()
  return handleWebhookTokenDiagnostic(async () => Boolean(await authorizeAdmin("subscriptions.manage")))
}
