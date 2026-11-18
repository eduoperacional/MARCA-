export const OFFICIAL_PRODUCTION_ORIGIN = "https://marcaiapp.vercel.app"
export const LEGACY_PRODUCTION_ORIGIN = "https://marcai-ruby.vercel.app"

export type AuthOriginEnvironment = Record<string, string | undefined>

function deploymentOrigin(value: string | undefined) {
  const host = value?.trim()
  return host ? `https://${host}` : undefined
}

export function getAuthBaseURL(env: AuthOriginEnvironment) {
  if (env.VERCEL_ENV === "production") return OFFICIAL_PRODUCTION_ORIGIN
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL

  return deploymentOrigin(env.VERCEL_URL) ?? env.V0_RUNTIME_URL
}

export function getTrustedAuthOrigins(env: AuthOriginEnvironment) {
  if (env.VERCEL_ENV === "production") {
    return [
      OFFICIAL_PRODUCTION_ORIGIN,
      LEGACY_PRODUCTION_ORIGIN,
      deploymentOrigin(env.VERCEL_PROJECT_PRODUCTION_URL),
    ].filter((origin): origin is string => Boolean(origin))
  }

  if (env.VERCEL_ENV === "preview") {
    return [deploymentOrigin(env.VERCEL_URL)].filter((origin): origin is string => Boolean(origin))
  }

  if (env.NODE_ENV === "development") {
    return [
      "http://localhost:3000",
      env.V0_RUNTIME_URL,
      env.V0_DEV_APP_URL,
      env.V0_BUILD_URL,
      env.V0_SANDBOX_URL,
    ].filter((origin): origin is string => Boolean(origin))
  }

  return []
}
