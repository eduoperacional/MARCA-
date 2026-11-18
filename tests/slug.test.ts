import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"

import type { BillingDb } from "@/lib/billing/process-asaas-event"
import * as schema from "@/lib/db/schema"
import { isReservedSlug, slugFormatError, slugify } from "@/lib/slug"
import { changeBusinessSlug, checkSlug, generateUniqueSlug, hasSlugHistory, resolveBusinessSlug } from "@/lib/slug-core"
import { bookingUrl, displayHost, resolveSiteUrl } from "@/lib/site-url"

const BASE_SQL = fs.readFileSync(path.join(process.cwd(), "tests", "billing.test.ts"), "utf8").match(/const BASE_SQL = `([\s\S]*?)`/)![1]
const SCRIPTS_DIR = path.join(process.cwd(), "scripts")
const MIGRATION = "018-links-personalizados.sql"
const TEMPLATES = ["004-grant-owner-access.sql", "007-liberar-super-admin.sql"]

async function freshDb({ withMigration }: { withMigration: boolean }) {
  const pg = new PGlite({ extensions: { btree_gist } })
  await pg.exec(BASE_SQL)
  for (const file of fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith(".sql") && !TEMPLATES.includes(f)).sort()) {
    if (!withMigration && file === MIGRATION) continue
    await pg.exec(fs.readFileSync(path.join(SCRIPTS_DIR, file), "utf8"))
  }
  return drizzle(pg, { schema }) as unknown as BillingDb
}

async function newBusiness(db: BillingDb, slug: string, completed = true) {
  const [b] = await db
    .insert(schema.businesses)
    .values({ name: slug, slug, openingHours: [], onboardingCompletedAt: completed ? new Date() : null })
    .returning()
  return b
}

describe("regras de endereço", () => {
  test("gera endereço amigável sem acentos e caracteres especiais", () => {
    assert.equal(slugify("Studio Bella"), "studio-bella")
    assert.equal(slugify("  Barbearia São João & Cia!! "), "barbearia-sao-joao-cia")
    assert.equal(slugify("Espaço---Ágape__2"), "espaco-agape-2")
  })

  test("bloqueia nomes reservados e rotas do sistema", () => {
    for (const slug of ["painel", "api", "admin", "agendar", "login"]) {
      assert.ok(isReservedSlug(slug), slug)
      assert.ok(slugFormatError(slug))
    }
    assert.equal(slugFormatError("studio-bella"), null)
    assert.ok(slugFormatError("ab"))
  })

  test("domínio: usa NEXT_PUBLIC_SITE_URL, depois produção da Vercel, depois a origem", () => {
    assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "marcai.com.br/" }), "https://marcai.com.br")
    assert.equal(
      resolveSiteUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "marca.vercel.app" }, "https://outro.app"),
      "https://marca.vercel.app"
    )
    assert.equal(resolveSiteUrl({ VERCEL_ENV: "preview" }, "https://preview.vercel.app"), "https://preview.vercel.app")
    assert.equal(bookingUrl("https://marcai.com.br", "studio-bella"), "https://marcai.com.br/agendar/studio-bella")
    assert.equal(displayHost("https://marcai.com.br/"), "marcai.com.br")
  })
})

describe("links personalizados (com migration 018)", async () => {
  const db = await freshDb({ withMigration: true })

  test("detecta a tabela de histórico", async () => {
    assert.equal(await hasSlugHistory(db), true)
  })

  test("gera endereço único com sufixo numérico", async () => {
    await newBusiness(db, "studio-bella")
    assert.equal(await generateUniqueSlug(db, "Studio Bella"), "studio-bella-2")
    const check = await checkSlug(db, "Studio Bella")
    assert.equal(check.available, false)
    assert.ok(!check.available && check.suggestions.includes("studio-bella-2"))
  })

  test("o próprio estabelecimento vê seu endereço como disponível", async () => {
    const b = await newBusiness(db, "salao-proprio")
    assert.equal((await checkSlug(db, "salao-proprio", b.id)).available, true)
  })

  test("troca preserva o link antigo e mantém o id interno", async () => {
    const b = await newBusiness(db, "barbearia-antiga")
    const result = await changeBusinessSlug(db, b.id, "Barbearia Nova")
    assert.deepEqual(result, { ok: true, slug: "barbearia-nova", previous: "barbearia-antiga" })

    const byNew = await resolveBusinessSlug(db, "barbearia-nova")
    const byOld = await resolveBusinessSlug(db, "barbearia-antiga")
    assert.equal(byNew?.id, b.id)
    assert.equal(byOld?.id, b.id)
    assert.equal(byOld?.slug, "barbearia-nova")
  })

  test("endereço antigo não pode ser usado por outro estabelecimento", async () => {
    const other = await newBusiness(db, "outro-negocio")
    const result = await changeBusinessSlug(db, other.id, "barbearia-antiga")
    assert.equal(result.ok, false)
    assert.equal((await generateUniqueSlug(db, "Barbearia Antiga")), "barbearia-antiga-2")
  })

  test("o dono pode voltar a um endereço antigo dele", async () => {
    const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.slug, "barbearia-nova"))
    const result = await changeBusinessSlug(db, b.id, "barbearia-antiga")
    assert.equal(result.ok, true)
    assert.equal((await resolveBusinessSlug(db, "barbearia-nova"))?.slug, "barbearia-antiga")
    assert.equal((await resolveBusinessSlug(db, "barbearia-antiga"))?.id, b.id)
  })

  test("rejeita endereço reservado ou ocupado", async () => {
    const b = await newBusiness(db, "loja-x")
    assert.equal((await changeBusinessSlug(db, b.id, "painel")).ok, false)
    assert.equal((await changeBusinessSlug(db, b.id, "studio-bella")).ok, false)
  })

  test("endereço inexistente não resolve", async () => {
    assert.equal(await resolveBusinessSlug(db, "nao-existe"), null)
  })
})

describe("links personalizados (sem migration 018)", async () => {
  const db = await freshDb({ withMigration: false })

  test("links atuais continuam resolvendo", async () => {
    const b = await newBusiness(db, "studio-atual")
    assert.equal(await hasSlugHistory(db), false)
    assert.equal((await resolveBusinessSlug(db, "studio-atual"))?.id, b.id)
  })

  test("não troca endereço de estabelecimento já divulgado", async () => {
    const b = await newBusiness(db, "ja-divulgado", true)
    const result = await changeBusinessSlug(db, b.id, "novo-endereco")
    assert.equal(result.ok, false)
    assert.equal((await resolveBusinessSlug(db, "ja-divulgado"))?.id, b.id)
  })

  test("permite trocar durante a configuração inicial", async () => {
    const b = await newBusiness(db, "em-configuracao", false)
    const result = await changeBusinessSlug(db, b.id, "configurado")
    assert.equal(result.ok, true)
  })
})
