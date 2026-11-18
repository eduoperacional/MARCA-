/* Service worker do MARCAÍ: recebe notificações push e abre o agendamento ao tocar. Não faz cache. */

const ICON = "/brand/marcai-icon.png"

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

function sameOriginUrl(path) {
  try {
    const url = new URL(path || "/painel", self.location.origin)
    return url.origin === self.location.origin ? url.href : new URL("/painel", self.location.origin).href
  } catch {
    return new URL("/painel", self.location.origin).href
  }
}

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "MARCAÍ", body: event.data ? event.data.text() : "" }
  }

  const title = data.title || "MARCAÍ"
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: ICON,
    tag: data.tag || undefined,
    // Renotifica quando a mesma tag (mesmo agendamento) é atualizada, sem empilhar avisos repetidos.
    renotify: Boolean(data.tag),
    silent: Boolean(data.silent),
    timestamp: data.timestamp || Date.now(),
    vibrate: data.silent ? undefined : [80, 40, 80],
    data: { url: sameOriginUrl(data.url), event: data.event, appointmentId: data.appointmentId },
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => clients.forEach((client) => client.postMessage({ type: "marcai:push", event: data.event }))),
    ])
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || sameOriginUrl("/painel")

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        if ("navigate" in existing) return existing.navigate(target).catch(() => self.clients.openWindow(target))
        return
      }
      return self.clients.openWindow(target)
    })
  )
})

/** O navegador trocou a inscrição (expiração/rotação): reinscreve e avisa o servidor. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : null
  const options = event.oldSubscription ? event.oldSubscription.options : null
  if (!options || !options.applicationServerKey) return

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .then((subscription) => {
        const json = subscription.toJSON()
        return fetch("/api/push/subscription", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, oldEndpoint }),
        })
      })
      .catch(() => undefined)
  )
})
