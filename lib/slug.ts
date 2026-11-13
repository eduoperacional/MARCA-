const RESERVED = new Set(["admin", "api", "painel", "entrar", "cadastro", "onboarding", "convite", "agendar", "marcai", "suporte"])

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug) && !slug.includes("--") && !RESERVED.has(slug)
}
