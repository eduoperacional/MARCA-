export const TERMS_VERSION = "2026-11-18"
export const PRIVACY_VERSION = "2026-11-18"
export const LEGAL_UPDATED_AT = "18 de novembro de 2026"
export const PRIVACY_CONTACT_EMAIL = "cascadebala1900@gmail.com"

export const LEGAL_ACCEPTANCE_ERROR = "LEGAL_ACCEPTANCE_REQUIRED"

export type LegalAcceptance = { termsVersion: string; privacyVersion: string }

export function currentLegalAcceptance(): LegalAcceptance {
  return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION }
}

export function isCurrentLegalAcceptance(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const { termsVersion, privacyVersion } = body as Record<string, unknown>
  return termsVersion === TERMS_VERSION && privacyVersion === PRIVACY_VERSION
}
