import "server-only"

import { and, eq, ne } from "drizzle-orm"

import { db } from "@/lib/db"
import { businesses } from "@/lib/db/schema"
import { isValidSlug, slugify } from "@/lib/slug"

export async function isSlugAvailable(slug: string, exceptBusinessId?: string) {
  if (!isValidSlug(slug)) return false
  const [row] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(exceptBusinessId ? and(eq(businesses.slug, slug), ne(businesses.id, exceptBusinessId)) : eq(businesses.slug, slug))
    .limit(1)
  return !row
}

/** Gera um endereço público livre a partir do nome, acrescentando sufixo quando necessário. */
export async function uniqueSlugFrom(name: string) {
  const base = slugify(name) || "estabelecimento"
  const candidate = base.length < 2 ? `${base}-agenda` : base
  if (await isSlugAvailable(candidate)) return candidate
  for (let i = 2; i < 50; i++) {
    const next = `${candidate.slice(0, 44)}-${i}`
    if (await isSlugAvailable(next)) return next
  }
  return `${candidate.slice(0, 38)}-${crypto.randomUUID().slice(0, 8)}`
}
