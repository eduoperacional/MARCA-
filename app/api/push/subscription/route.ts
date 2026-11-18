import { getAccess } from "@/lib/business"
import { isAllowedPushEndpoint, isValidSubscriptionKeys } from "@/lib/push/web-push"
import {
  isEndpointSubscribed,
  isMissingTable,
  isPushConfigured,
  revokeSubscriptionByEndpoint,
  upsertSubscription,
} from "@/lib/push/service"
import { rateLimit } from "@/lib/rate-limit"

/**
 * Inscrição push do dispositivo atual para o usuário logado no estabelecimento ativo.
 * Também é chamada pelo service worker em `pushsubscriptionchange` (mesma origem, com cookies).
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return null
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const access = await getAccess()
  if (!access) return json({ error: "unauthorized" }, 401)
  const endpoint = new URL(request.url).searchParams.get("endpoint")
  if (!isAllowedPushEndpoint(endpoint)) return json({ subscribed: false })
  try {
    return json({ subscribed: await isEndpointSubscribed(access.business.id, access.user.id, endpoint) })
  } catch (error) {
    if (isMissingTable(error)) return json({ subscribed: false, unavailable: true })
    throw error
  }
}

export async function POST(request: Request) {
  const access = await getAccess()
  if (!access) return json({ error: "unauthorized" }, 401)
  if (!isPushConfigured()) return json({ error: "not_configured" }, 503)
  if (!(await rateLimit(`push-subscribe:${access.user.id}`, 20, 60))) return json({ error: "rate_limited" }, 429)

  const body = await readBody(request)
  const keys = (body?.keys ?? {}) as Record<string, unknown>
  if (!body || !isAllowedPushEndpoint(body.endpoint) || !isValidSubscriptionKeys(keys.p256dh, keys.auth)) {
    return json({ error: "invalid_subscription" }, 400)
  }
  const replaces = isAllowedPushEndpoint(body.oldEndpoint) ? body.oldEndpoint : null

  try {
    await upsertSubscription({
      businessId: access.business.id,
      userId: access.user.id,
      endpoint: body.endpoint,
      p256dh: keys.p256dh as string,
      auth: keys.auth as string,
      userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      replacesEndpoint: replaces,
    })
    return json({ ok: true })
  } catch (error) {
    if (isMissingTable(error)) return json({ error: "unavailable" }, 503)
    throw error
  }
}

export async function DELETE(request: Request) {
  const access = await getAccess()
  if (!access) return json({ error: "unauthorized" }, 401)
  const body = await readBody(request)
  if (!body || !isAllowedPushEndpoint(body.endpoint)) return json({ error: "invalid_subscription" }, 400)
  try {
    await revokeSubscriptionByEndpoint(access.business.id, access.user.id, body.endpoint)
    return json({ ok: true })
  } catch (error) {
    if (isMissingTable(error)) return json({ ok: true })
    throw error
  }
}
