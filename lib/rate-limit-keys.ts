import { createHmac } from "node:crypto"

const DEV_FALLBACK_SECRET = "marcai-dev-only-rate-limit-secret"

/**
 * Segredo do HMAC das chaves de rate limit. Reaproveita o segredo do Better Auth, que é obrigatório
 * em produção. Um hash sem segredo não protegeria o telefone: o espaço de números é pequeno o
 * suficiente para ser enumerado.
 */
export function rateLimitSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.RATE_LIMIT_SECRET || env.BETTER_AUTH_SECRET || env.AUTH_SECRET
  if (secret) return secret
  if (env.NODE_ENV === "production") {
    throw new Error("[rate-limit] BETTER_AUTH_SECRET ausente: não é possível proteger as chaves por telefone")
  }
  return DEV_FALLBACK_SECRET
}

/** Identificador estável e não reversível do telefone, escopado ao estabelecimento. */
export function hashPhoneForRateLimit(businessId: string, phoneNormalized: string, secret: string): string {
  return createHmac("sha256", secret).update(`rate-limit:phone:${businessId}:${phoneNormalized}`).digest("base64url")
}

export function phoneRateLimitKeys(businessId: string, phoneNormalized: string, secret: string) {
  const id = hashPhoneForRateLimit(businessId, phoneNormalized, secret)
  return { short: `booking-phone-h:${businessId}:${id}`, daily: `booking-phone-day-h:${businessId}:${id}` }
}

/**
 * Formato anterior, com o telefone em texto puro. Só é lido (nunca gravado) para somar as tentativas
 * feitas antes da troca de formato; essas chaves expiram em até 24 h e a limpeza diária as remove.
 */
export function legacyPhoneRateLimitKeys(businessId: string, phoneNormalized: string) {
  return { short: `booking-phone:${businessId}:${phoneNormalized}`, daily: `booking-phone-day:${businessId}:${phoneNormalized}` }
}
