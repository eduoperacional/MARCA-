import { checkWebhookToken, normalizeWebhookToken, tokenFingerprint } from "@/lib/billing/webhook"

// TEMPORÁRIO: diagnóstico do token_mismatch do webhook Asaas. Remover junto com
// app/api/admin/diagnostico-webhook-asaas/route.ts e tests/webhook-diagnostic.test.ts.

export type TokenCheck = {
  validacao: "aprovado" | "reprovado"
  comprimento: number
  fingerprint: string | null
}

export type WebhookTokenDiagnostic = {
  tokenBruto: TokenCheck
  tokenNormalizado: TokenCheck
  ambiente: string
  commit: string
}

/** Passa `candidate` como se fosse o cabeçalho, pela mesma validação usada em POST /api/webhooks/asaas. */
function check(candidate: string, expected: string | undefined): TokenCheck {
  return {
    validacao: checkWebhookToken(candidate || null, expected) === "ok" ? "aprovado" : "reprovado",
    comprimento: candidate.length,
    fingerprint: candidate ? tokenFingerprint(candidate) : null,
  }
}

/**
 * tokenBruto: ASAAS_WEBHOOK_TOKEN exatamente como está no runtime. Reprovado com token presente
 * significa que o valor salvo tem aspas, espaços, invisíveis ou prefixo; o Asaas teria de enviar
 * esses caracteres para passar. tokenNormalizado: o valor que a rota de fato exige no cabeçalho;
 * o fingerprint dele é o que deve bater com o do authToken cadastrado no Asaas.
 */
export function diagnoseWebhookToken(runtime: Record<string, string | undefined> = process.env): WebhookTokenDiagnostic {
  const raw = runtime.ASAAS_WEBHOOK_TOKEN
  return {
    tokenBruto: check(raw ?? "", raw),
    tokenNormalizado: check(normalizeWebhookToken(raw).value, raw),
    ambiente: runtime.VERCEL_ENV ?? "desconhecido",
    commit: runtime.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  }
}

const NO_STORE = { "Cache-Control": "no-store" }

/** Sem admin autorizado a rota responde 404, como as páginas do /admin. */
export async function handleWebhookTokenDiagnostic(
  isAuthorizedAdmin: () => Promise<boolean>,
  runtime: Record<string, string | undefined> = process.env
) {
  if (!(await isAuthorizedAdmin())) {
    return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE })
  }
  return Response.json(diagnoseWebhookToken(runtime), { headers: NO_STORE })
}
