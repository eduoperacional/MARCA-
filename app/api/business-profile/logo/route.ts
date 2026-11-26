import { del, put } from "@vercel/blob"
import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

import { authorize } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses } from "@/lib/db/schema"
import { MAX_LOGO_UPLOAD_BYTES, normalizeBusinessLogo } from "@/lib/business-profile-image"
import { rateLimit } from "@/lib/rate-limit"

const MAX_REQUEST_BYTES = MAX_LOGO_UPLOAD_BYTES + 256_000

function validateRequestOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin
}

function isManagedLogo(url: string, businessId: string) {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".public.blob.vercel-storage.com") &&
      parsed.pathname.startsWith(`/business-logos/${businessId}/`)
    )
  } catch {
    return false
  }
}

async function removeOldBlob(url: string | null, businessId: string) {
  if (!url || !isManagedLogo(url, businessId)) return
  try {
    await del(url)
  } catch (error) {
    console.error("[business-logo] old image cleanup failed", error instanceof Error ? error.message : "unknown error")
  }
}

function refreshProfile(slug: string) {
  revalidatePath("/painel/configuracoes")
  revalidatePath(`/agendar/${slug}`)
}

export async function POST(request: NextRequest) {
  if (!validateRequestOrigin(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 })

  const access = await authorize("settings.manage")
  if (!access) return NextResponse.json({ error: "Você não tem permissão para alterar este perfil." }, { status: 403 })

  if (!(await rateLimit(`business-logo:${access.business.id}:${access.user.id}`, 10, 60 * 60))) {
    return NextResponse.json({ error: "Muitas alterações de logomarca. Tente novamente mais tarde." }, { status: 429 })
  }

  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "A imagem otimizada ainda ficou grande demais para envio." }, { status: 413 })
  }

  let file: FormDataEntryValue | null
  try {
    file = (await request.formData()).get("file")
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo enviado." }, { status: 400 })
  }

  if (!(file instanceof File) || file.type !== "image/webp" || file.size === 0 || file.size > MAX_LOGO_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Envie uma imagem WebP válida, com até 2,8 MB após a otimização." }, { status: 400 })
  }

  let optimized: Buffer
  try {
    optimized = await normalizeBusinessLogo(Buffer.from(await file.arrayBuffer()))
  } catch {
    return NextResponse.json({ error: "A imagem não pôde ser validada ou otimizada. Escolha outro arquivo." }, { status: 400 })
  }

  const oldLogoUrl = access.business.logoUrl
  let blobUrl: string
  try {
    const blob = await put(
      `business-logos/${access.business.id}/${crypto.randomUUID()}.webp`,
      optimized,
      {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/webp",
        cacheControlMaxAge: 31_536_000,
      }
    )
    blobUrl = blob.url
  } catch (error) {
    console.error("[business-logo] upload failed", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "O armazenamento da logomarca está indisponível. Tente novamente." }, { status: 503 })
  }

  try {
    await db.update(businesses).set({ logoUrl: blobUrl }).where(eq(businesses.id, access.business.id))
  } catch (error) {
    await del(blobUrl).catch(() => undefined)
    console.error("[business-logo] profile update failed", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "A imagem foi enviada, mas não foi possível atualizar o perfil." }, { status: 500 })
  }

  await removeOldBlob(oldLogoUrl, access.business.id)
  refreshProfile(access.business.slug)
  return NextResponse.json({ logoUrl: blobUrl }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: NextRequest) {
  if (!validateRequestOrigin(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 })

  const access = await authorize("settings.manage")
  if (!access) return NextResponse.json({ error: "Você não tem permissão para alterar este perfil." }, { status: 403 })

  if (!(await rateLimit(`business-logo:${access.business.id}:${access.user.id}`, 10, 60 * 60))) {
    return NextResponse.json({ error: "Muitas alterações de logomarca. Tente novamente mais tarde." }, { status: 429 })
  }

  const oldLogoUrl = access.business.logoUrl
  await db
    .update(businesses)
    .set({ logoUrl: null })
    .where(and(eq(businesses.id, access.business.id), eq(businesses.logoUrl, oldLogoUrl ?? "")))

  await removeOldBlob(oldLogoUrl, access.business.id)
  refreshProfile(access.business.slug)
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
