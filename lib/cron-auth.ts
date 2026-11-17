import { timingSafeEqual } from "node:crypto"

/**
 * Aceita apenas `Authorization: Bearer <CRON_SECRET>`.
 * Sem segredo configurado, toda chamada é recusada.
 * A comparação é em tempo constante porque a rota é chamada por um agendador externo, pela internet.
 */
export function isAuthorizedCronRequest(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const header = request.headers.get("authorization")
  if (!header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return received.length === expected.length && timingSafeEqual(received, expected)
}
