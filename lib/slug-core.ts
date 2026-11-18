import { and, eq, inArray, ne, sql } from "drizzle-orm"

import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { businesses, businessSlugHistory } from "@/lib/db/schema"
import { baseSlugFrom, numberedSlugCandidates, slugFormatError, slugify } from "@/lib/slug"

type Executor = Pick<BillingDb, "select" | "execute">
type Business = typeof businesses.$inferSelect

/** A tabela de histórico só existe após o script 018; antes disso o histórico é tratado como vazio. */
export async function hasSlugHistory(db: Pick<BillingDb, "execute">) {
  const result = await db.execute(sql`select to_regclass('public.business_slug_history') is not null as ok`)
  const rows = (result as { rows?: { ok?: boolean }[] }).rows ?? (result as unknown as { ok?: boolean }[])
  return Boolean(Array.isArray(rows) && rows[0]?.ok)
}

/** Endereços ocupados dentre os candidatos (atuais de outros estabelecimentos ou antigos de outros). */
async function takenSlugs(db: Executor, candidates: string[], exceptBusinessId?: string, withHistory?: boolean) {
  if (candidates.length === 0) return new Set<string>()
  const current = await db
    .select({ slug: businesses.slug })
    .from(businesses)
    .where(
      exceptBusinessId
        ? and(inArray(businesses.slug, candidates), ne(businesses.id, exceptBusinessId))
        : inArray(businesses.slug, candidates)
    )
  const taken = new Set(current.map((r) => r.slug))
  if (withHistory ?? (await hasSlugHistory(db))) {
    const old = await db
      .select({ slug: businessSlugHistory.slug })
      .from(businessSlugHistory)
      .where(
        exceptBusinessId
          ? and(inArray(businessSlugHistory.slug, candidates), ne(businessSlugHistory.businessId, exceptBusinessId))
          : inArray(businessSlugHistory.slug, candidates)
      )
    for (const r of old) taken.add(r.slug)
  }
  return taken
}

export type SlugCheck =
  | { slug: string; available: true }
  | { slug: string; available: false; reason: string; suggestions: string[] }

/** Normaliza, valida e verifica a disponibilidade de um endereço, sugerindo alternativas livres. */
export async function checkSlug(db: Executor, input: string, exceptBusinessId?: string): Promise<SlugCheck> {
  const slug = slugify(input ?? "")
  const formatError = slugFormatError(slug)
  const withHistory = await hasSlugHistory(db)

  if (!formatError) {
    const taken = await takenSlugs(db, [slug], exceptBusinessId, withHistory)
    if (!taken.has(slug)) return { slug, available: true }
  }

  const base = baseSlugFrom(slug)
  const pool = [base, ...numberedSlugCandidates(base, 2, 12)].filter((s) => s !== slug && !slugFormatError(s))
  const taken = await takenSlugs(db, pool, exceptBusinessId, withHistory)
  const suggestions = pool.filter((s) => !taken.has(s)).slice(0, 3)
  return { slug, available: false, reason: formatError ?? "Este endereço já está em uso.", suggestions }
}

/** Gera um endereço livre a partir do nome, acrescentando sufixo numérico quando necessário. */
export async function generateUniqueSlug(db: Executor, name: string) {
  const base = baseSlugFrom(name)
  const withHistory = await hasSlugHistory(db)
  const pool = [base, ...numberedSlugCandidates(base)]
  const taken = await takenSlugs(db, pool, undefined, withHistory)
  return pool.find((s) => !taken.has(s)) ?? `${base.slice(0, 39)}-${crypto.randomUUID().slice(0, 8)}`
}

/** Busca o estabelecimento pelo endereço atual ou por um endereço antigo do histórico. */
export async function resolveBusinessSlug(db: Executor, slug: string): Promise<Business | null> {
  const normalized = String(slug ?? "").toLowerCase()
  if (!normalized || normalized.length > 64) return null
  const [current] = await db.select().from(businesses).where(eq(businesses.slug, normalized)).limit(1)
  if (current) return current
  if (!(await hasSlugHistory(db))) return null
  const [old] = await db
    .select({ business: businesses })
    .from(businessSlugHistory)
    .innerJoin(businesses, eq(businesses.id, businessSlugHistory.businessId))
    .where(eq(businessSlugHistory.slug, normalized))
    .limit(1)
  return old?.business ?? null
}

export type ChangeSlugResult =
  | { ok: true; slug: string; previous: string | null }
  | { ok: false; error: string; suggestions?: string[] }

/**
 * Troca o endereço público preservando o anterior no histórico, para que links já
 * compartilhados continuem funcionando. Sem a tabela de histórico (script 018 pendente),
 * só permite a troca antes de concluir a configuração inicial, quando o link ainda não foi divulgado.
 */
export async function changeBusinessSlug(db: BillingDb, businessId: string, input: string): Promise<ChangeSlugResult> {
  const check = await checkSlug(db, input, businessId)
  if (!check.available) return { ok: false, error: check.reason, suggestions: check.suggestions }
  const slug = check.slug

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`slug:${slug}`}, 0))`)
      const [business] = await tx
        .select({ slug: businesses.slug, onboardingCompletedAt: businesses.onboardingCompletedAt })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .for("update")
      if (!business) return { ok: false as const, error: "Estabelecimento não encontrado." }
      if (business.slug === slug) return { ok: true as const, slug, previous: null }

      const withHistory = await hasSlugHistory(tx)
      if (!withHistory && business.onboardingCompletedAt) {
        return {
          ok: false as const,
          error: "A troca de endereço será liberada após a próxima atualização do sistema. Seu link atual continua funcionando.",
        }
      }
      const taken = await takenSlugs(tx, [slug], businessId, withHistory)
      if (taken.has(slug)) return { ok: false as const, error: "Este endereço acabou de ser ocupado. Escolha outro." }

      if (withHistory) {
        await tx
          .insert(businessSlugHistory)
          .values({ slug: business.slug, businessId })
          .onConflictDoNothing({ target: businessSlugHistory.slug })
        await tx
          .delete(businessSlugHistory)
          .where(and(eq(businessSlugHistory.slug, slug), eq(businessSlugHistory.businessId, businessId)))
      }
      await tx.update(businesses).set({ slug }).where(eq(businesses.id, businessId))
      return { ok: true as const, slug, previous: business.slug }
    })
  } catch (error) {
    if ((error as { cause?: { code?: string }; code?: string })?.cause?.code === "23505" || (error as { code?: string })?.code === "23505") {
      return { ok: false, error: "Este endereço já está em uso. Escolha outro." }
    }
    throw error
  }
}
