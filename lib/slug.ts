/**
 * Identificadores que não podem ser usados como endereço público: rotas do sistema,
 * termos institucionais e nomes que poderiam ser confundidos com páginas oficiais.
 */
export const RESERVED_SLUGS = new Set([
  "admin",
  "administrador",
  "agenda",
  "agendamento",
  "agendamentos",
  "agendar",
  "ajuda",
  "api",
  "app",
  "apple-icon",
  "assinatura",
  "blog",
  "cadastro",
  "checkout",
  "clientes",
  "configuracoes",
  "contato",
  "convite",
  "cron",
  "dashboard",
  "entrar",
  "equipe",
  "favicon",
  "financeiro",
  "icon",
  "login",
  "logout",
  "manifest",
  "marcai",
  "minha-conta",
  "novo",
  "onboarding",
  "painel",
  "pagamento",
  "planos",
  "precos",
  "privacidade",
  "recuperar-senha",
  "redefinir-senha",
  "relatorios",
  "robots",
  "servicos",
  "sitemap",
  "status",
  "suporte",
  "sw",
  "termos",
  "www",
])

export const SLUG_MIN = 3
export const SLUG_MAX = 48

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "")
}

export function isReservedSlug(slug: string) {
  return RESERVED_SLUGS.has(slug)
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug) && !slug.includes("--") && !isReservedSlug(slug)
}

/** Motivo legível para um identificador inválido, ou null quando o formato é aceito. */
export function slugFormatError(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Use pelo menos ${SLUG_MIN} caracteres.`
  if (slug.length > SLUG_MAX) return `Use no máximo ${SLUG_MAX} caracteres.`
  if (isReservedSlug(slug)) return "Este endereço é reservado pelo sistema."
  if (!isValidSlug(slug)) return "Use apenas letras minúsculas, números e hífens."
  return null
}

/** Base válida derivada de um nome qualquer (garante tamanho mínimo e evita reservados). */
export function baseSlugFrom(name: string) {
  const base = slugify(name) || "estabelecimento"
  if (base.length < SLUG_MIN || isReservedSlug(base)) return `${base}-agenda`.slice(0, SLUG_MAX)
  return base
}

/** Alternativas em ordem de preferência: studio-bella-2, studio-bella-3, ... */
export function numberedSlugCandidates(base: string, from = 2, to = 49) {
  const list: string[] = []
  for (let i = from; i <= to; i++) {
    const suffix = `-${i}`
    list.push(`${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`)
  }
  return list
}
