import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { PGlite } from "@electric-sql/pglite"
import sharp from "sharp"

import { normalizeInstagramUrl, normalizeWebsiteUrl } from "@/lib/business-profile"
import { MAX_LOGO_UPLOAD_BYTES, normalizeBusinessLogo } from "@/lib/business-profile-image"

test("normaliza usuário e URL de perfil do Instagram", () => {
  assert.deepEqual(normalizeInstagramUrl("@marca.ai"), { value: "https://www.instagram.com/marca.ai/" })
  assert.deepEqual(normalizeInstagramUrl("https://www.instagram.com/marca.ai/?igsh=abc"), {
    value: "https://www.instagram.com/marca.ai/",
  })
  assert.equal(normalizeInstagramUrl("https://instagram.com/p/post-id/").error, "Use o link direto do perfil do Instagram.")
  assert.equal(normalizeInstagramUrl("javascript:alert(1)").error, "Informe o @usuário ou o link do perfil do Instagram.")
  assert.deepEqual(normalizeInstagramUrl(""), { value: null })
})

test("normaliza site para HTTPS e rejeita esquemas perigosos", () => {
  assert.deepEqual(normalizeWebsiteUrl("www.exemplo.com.br/pagina"), { value: "https://www.exemplo.com.br/pagina" })
  assert.equal(normalizeWebsiteUrl("javascript:alert(1)").error, "Informe um endereço de site válido.")
  assert.deepEqual(normalizeWebsiteUrl(""), { value: null })
})

test("valida, reduz e mantém logotipos em WebP", async () => {
  const source = await sharp({
    create: { width: 2200, height: 1200, channels: 4, background: { r: 110, g: 60, b: 220, alpha: 1 } },
  }).webp({ quality: 100, lossless: true }).toBuffer()
  const output = await normalizeBusinessLogo(source)
  const metadata = await sharp(output).metadata()

  assert.equal(metadata.format, "webp")
  assert.ok(metadata.width && metadata.width <= 1200)
  assert.ok(metadata.height && metadata.height <= 1200)
  assert.ok(output.byteLength <= MAX_LOGO_UPLOAD_BYTES)
})

test("rejeita bytes que não são uma imagem WebP", async () => {
  await assert.rejects(() => normalizeBusinessLogo(Buffer.from("not an image")))
  const png = await sharp({
    create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer()
  await assert.rejects(() => normalizeBusinessLogo(png), /WebP/)
})

test("adiciona links sociais sem alterar o perfil já salvo e pode rodar novamente", async () => {
  const database = new PGlite()
  const migration = fs.readFileSync(path.join(process.cwd(), "scripts", "024-business-profile-social-links.sql"), "utf8")

  try {
    await database.exec(`
      CREATE TABLE businesses (
        id text PRIMARY KEY,
        display_name text,
        description text,
        phone text,
        address text,
        logo_url text
      );
      INSERT INTO businesses (id, display_name, description, phone, address, logo_url)
      VALUES ('business-1', 'Studio Exemplo', 'Perfil existente', '11999999999', 'Rua A, 10', 'https://old-logo.example/logo.png');
    `)
    await database.exec(migration)
    await database.exec(migration)
    const result = await database.query<{
      display_name: string
      description: string
      phone: string
      address: string
      logo_url: string
      instagram_url: string | null
      website_url: string | null
    }>("SELECT * FROM businesses WHERE id = 'business-1'")

    assert.deepEqual(result.rows[0], {
      id: "business-1",
      display_name: "Studio Exemplo",
      description: "Perfil existente",
      phone: "11999999999",
      address: "Rua A, 10",
      logo_url: "https://old-logo.example/logo.png",
      instagram_url: null,
      website_url: null,
    })
  } finally {
    await database.close()
  }
})
