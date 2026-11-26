type NormalizedValue = { value: string | null; error?: string }

const INSTAGRAM_USERNAME = /^[a-zA-Z0-9._]{1,30}$/

export function normalizeInstagramUrl(input: unknown): NormalizedValue {
  if (typeof input !== "string" || !input.trim()) return { value: null }
  const raw = input.trim().slice(0, 500)
  let username = raw.replace(/^@/, "")

  if (/^https?:\/\//i.test(raw) || /^www\.instagram\.com\//i.test(raw) || /^instagram\.com\//i.test(raw)) {
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (!/^(www\.)?instagram\.com$/i.test(url.hostname) || url.protocol !== "https:" || url.username || url.password) {
        return { value: null, error: "Informe um perfil válido do Instagram." }
      }
      const segments = url.pathname.split("/").filter(Boolean)
      if (segments.length !== 1) return { value: null, error: "Use o link direto do perfil do Instagram." }
      username = segments[0]
    } catch {
      return { value: null, error: "Informe um perfil válido do Instagram." }
    }
  }

  if (!INSTAGRAM_USERNAME.test(username)) return { value: null, error: "Informe o @usuário ou o link do perfil do Instagram." }
  return { value: `https://www.instagram.com/${username}/` }
}

export function normalizeWebsiteUrl(input: unknown): NormalizedValue {
  if (typeof input !== "string" || !input.trim()) return { value: null }
  const raw = input.trim().slice(0, 500)
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return { value: null, error: "Informe um endereço de site válido." }
    }
    url.protocol = "https:"
    url.hash = ""
    return { value: url.toString() }
  } catch {
    return { value: null, error: "Informe um endereço de site válido." }
  }
}
