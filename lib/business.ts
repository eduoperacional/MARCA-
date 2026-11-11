import "server-only"

import { cache } from "react"
import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { businesses } from "@/lib/db/schema"

/**
 * Estabelecimento ativo. Enquanto não há autenticação, o painel opera sobre o primeiro
 * estabelecimento cadastrado; todas as consultas são filtradas por `business.id`.
 */
export const getCurrentBusiness = cache(async () => {
  const [business] = await db.select().from(businesses).orderBy(asc(businesses.createdAt)).limit(1)
  if (!business) throw new Error("Nenhum estabelecimento cadastrado. Execute scripts/seed.mjs.")
  return business
})

export const getBusinessBySlug = cache(async (slug: string) => {
  const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1)
  return business ?? null
})
