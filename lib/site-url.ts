/** Domínio oficial planejado. Só passa a ser usado quando NEXT_PUBLIC_SITE_URL apontar para ele. */
export const OFFICIAL_DOMAIN = "marcai.com.br"

function clean(url: string | undefined | null) {
  const value = url?.trim().replace(/\/+$/, "")
  if (!value) return null
  return /^https?:\/\//.test(value) ? value : `https://${value}`
}

/**
 * Endereço base usado nos links públicos. Ordem:
 * 1. NEXT_PUBLIC_SITE_URL (ex.: https://marcai.com.br, quando o domínio estiver configurado na Vercel)
 * 2. Domínio de produção atual informado pela Vercel
 * 3. Origem da requisição (preview e desenvolvimento)
 */
export function resolveSiteUrl(env: Record<string, string | undefined>, requestOrigin?: string | null) {
  return (
    clean(env.NEXT_PUBLIC_SITE_URL) ??
    (env.VERCEL_ENV === "production" ? clean(env.VERCEL_PROJECT_PRODUCTION_URL) : null) ??
    clean(requestOrigin) ??
    clean(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    ""
  )
}

export function bookingPath(slug: string) {
  return `/agendar/${slug}`
}

export function bookingUrl(baseUrl: string, slug: string) {
  return `${baseUrl.replace(/\/+$/, "")}${bookingPath(slug)}`
}

/** Versão curta para exibição: "marcai.com.br/agendar/studio-bella". */
export function displayHost(baseUrl: string) {
  return baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}
