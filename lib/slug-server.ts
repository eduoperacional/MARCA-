import "server-only"

import { db } from "@/lib/db"
import { changeBusinessSlug, checkSlug, generateUniqueSlug, resolveBusinessSlug } from "@/lib/slug-core"

export async function isSlugAvailable(slug: string, exceptBusinessId?: string) {
  return (await checkSlug(db, slug, exceptBusinessId)).available
}

export function checkSlugFor(slug: string, exceptBusinessId?: string) {
  return checkSlug(db, slug, exceptBusinessId)
}

/** Gera um endereço público livre a partir do nome, acrescentando sufixo quando necessário. */
export function uniqueSlugFrom(name: string) {
  return generateUniqueSlug(db, name)
}

export function changeSlug(businessId: string, slug: string) {
  return changeBusinessSlug(db, businessId, slug)
}

export function resolveSlug(slug: string) {
  return resolveBusinessSlug(db, slug)
}
