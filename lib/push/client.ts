"use client"

/** Utilitários de navegador para Web Push. Nunca pedem permissão sozinhos: só quando chamados por um clique. */

export type PushSupport = "supported" | "unsupported" | "ios_needs_install"
export type PermissionState = NotificationPermission | "unsupported"

const SW_URL = "/sw.js"

export function isIos() {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** No iPhone/iPad (iOS 16.4+), o push só existe com o MARCAÍ adicionado à Tela de Início. */
export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported"
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  if (isIos() && !isStandalone()) return "ios_needs_install"
  return hasApis ? "supported" : "unsupported"
}

export function getPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  return Notification.permission
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" })
  } catch {
    return null
  }
}

export async function getCurrentSubscription() {
  const registration = await registerServiceWorker()
  return registration ? registration.pushManager.getSubscription() : null
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function postSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
  if (!response.ok) throw new Error(response.status === 503 ? "unavailable" : "subscribe_failed")
}

export type EnableResult = { ok: true } | { ok: false; reason: "unsupported" | "ios_needs_install" | "denied" | "dismissed" | "failed" }

/** Pede permissão (deve ser chamado num clique), inscreve o dispositivo e registra no servidor. */
export async function enablePush(vapidPublicKey: string): Promise<EnableResult> {
  const support = getPushSupport()
  if (support !== "supported") return { ok: false, reason: support }
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
  if (permission === "denied") return { ok: false, reason: "denied" }
  if (permission !== "granted") return { ok: false, reason: "dismissed" }
  try {
    const registration = await registerServiceWorker()
    if (!registration) return { ok: false, reason: "failed" }
    await navigator.serviceWorker.ready
    const key = base64UrlToUint8Array(vapidPublicKey)
    let subscription = await registration.pushManager.getSubscription()
    // Inscrição criada com outra chave VAPID não recebe mais nada: troca por uma nova.
    const currentKey = subscription?.options.applicationServerKey
    if (subscription && currentKey && !sameBytes(new Uint8Array(currentKey), key)) {
      await subscription.unsubscribe().catch(() => undefined)
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await postSubscription(subscription)
    return { ok: true }
  } catch {
    return { ok: false, reason: "failed" }
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Remove a inscrição só deste dispositivo (no navegador e no servidor). */
export async function disablePush() {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined)
  await subscription.unsubscribe().catch(() => undefined)
}

/** Este dispositivo tem inscrição ativa no navegador E no servidor (para o estabelecimento atual)? */
export async function getDeviceStatus(): Promise<"subscribed" | "not_subscribed" | "out_of_sync"> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return "not_subscribed"
  try {
    const response = await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(subscription.endpoint)}`, { cache: "no-store" })
    const data = (await response.json()) as { subscribed?: boolean }
    return data.subscribed ? "subscribed" : "out_of_sync"
  } catch {
    return "out_of_sync"
  }
}

/** Reenvia a inscrição existente (chaves podem ter mudado). Silencioso; não pede permissão. */
export async function resyncSubscription() {
  if (getPermission() !== "granted") return
  const subscription = await getCurrentSubscription()
  if (subscription) await postSubscription(subscription).catch(() => undefined)
}
