"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { cleanText, fail, isUuid } from "@/lib/actions/result"
import { getAccess, getSession, setActiveBusiness } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses, businessMembers, professionals } from "@/lib/db/schema"
import { BUSINESS_SEGMENTS, MIN_ADVANCE_OPTIONS, SLOT_INTERVALS } from "@/lib/onboarding"
import { DEFAULT_PERMISSIONS } from "@/lib/permissions"
import { clientIp, rateLimit, RATE_LIMITED } from "@/lib/rate-limit"
import { normalizeWeekSchedule, validateWeekSchedule } from "@/lib/schedule"
import { recordSetupChange, type SetupMode } from "@/lib/setup-state"
import { isValidSlug, slugify } from "@/lib/slug"
import { isSlugAvailable, uniqueSlugFrom } from "@/lib/slug-server"
import type { DaySchedule } from "@/lib/types"
import { upsertWhatsappSettings } from "@/lib/whatsapp/service"
import { toWhatsappNumber } from "@/lib/whatsapp/templates"

type Result = { ok: true; ready?: boolean } | { ok: false; error: string }

const DEFAULT_HOURS: DaySchedule[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  active: weekday !== 0,
  start: "09:00",
  end: weekday === 6 ? "14:00" : "19:00",
  breakStart: weekday === 6 ? null : "12:00",
  breakEnd: weekday === 6 ? null : "13:00",
}))

const UF = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "))
const MAX_IMAGE_CHARS = 700_000

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits.length >= 10 && digits.length <= 13
}

function cleanImage(value: unknown) {
  if (value == null || value === "") return { value: null }
  if (typeof value !== "string") return { error: "Imagem inválida." }
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)) {
    return value.length > MAX_IMAGE_CHARS ? { error: "Imagem muito grande. Use um arquivo menor." } : { value }
  }
  if (/^https:\/\/[^\s]{1,490}$/.test(value)) return { value }
  return { error: "Imagem inválida." }
}

/** Estabelecimento ativo, somente quando o usuário é o proprietário. Nunca acessa outro tenant. */
async function requireOwner() {
  const access = await getAccess()
  if (!access) return { error: "Sessão expirada. Entre novamente." }
  if (access.role !== "owner") return { error: "Somente o proprietário pode alterar a configuração inicial." }
  if (!(await rateLimit(`onboarding:${access.user.id}`, 60, 60))) return { error: RATE_LIMITED }
  return { access }
}

async function finish(businessId: string, reviewed: NonNullable<Parameters<typeof recordSetupChange>[2]>["reviewed"]): Promise<Result> {
  const state = await recordSetupChange(db, businessId, { reviewed })
  revalidatePath("/", "layout")
  return { ok: true, ready: state?.progress.ready ?? false }
}

/* --------------------------- Etapa 1: estabelecimento --------------------------- */

export interface BusinessStepInput {
  name: string
  segment: string
  phone: string
  address: string
  city: string
  state: string
  displayName: string
  primaryColor: string
  logoUrl: string | null
  /** Opcional. Número do proprietário que recebe avisos de agendamento no WhatsApp. */
  notificationPhone?: string
  /** Cria um novo estabelecimento em vez de editar o ativo (fluxo "novo estabelecimento"). */
  createNew: boolean
  mode: SetupMode
}

export async function saveBusinessStep(input: BusinessStepInput): Promise<Result> {
  const session = await getSession()
  if (!session?.user) return fail("Sessão expirada. Entre novamente.")
  if (!(await rateLimit(`onboarding:${session.user.id}`, 60, 60))) return fail(RATE_LIMITED)

  const name = cleanText(input.name, 80)
  if (!name || name.length < 2) return fail("Informe o nome comercial.")
  if (!BUSINESS_SEGMENTS.some((s) => s.value === input.segment)) return fail("Selecione o tipo de negócio.")
  const phone = cleanText(input.phone, 30)
  if (!phone || !isValidPhone(phone)) return fail("Informe um telefone ou WhatsApp válido, com DDD.")
  const address = cleanText(input.address, 200)
  if (!address) return fail("Informe o endereço.")
  const city = cleanText(input.city, 80)
  if (!city) return fail("Informe a cidade.")
  const state = String(input.state ?? "").toUpperCase()
  if (!UF.has(state)) return fail("Selecione o estado.")
  const displayName = cleanText(input.displayName, 80) ?? name
  if (!/^#[0-9a-f]{6}$/i.test(input.primaryColor ?? "")) return fail("Cor principal inválida.")
  const logo = cleanImage(input.logoUrl)
  if (logo.error) return fail(logo.error)
  const mode: SetupMode = input.mode === "manual" ? "manual" : "guided"
  const rawNotificationPhone = String(input.notificationPhone ?? "").trim()
  const notificationPhone = rawNotificationPhone ? toWhatsappNumber(rawNotificationPhone) : null
  if (rawNotificationPhone && !notificationPhone) return fail("Informe um WhatsApp válido para notificações, com DDD.")
  const saveNotificationPhone = async (businessId: string) => {
    if (!notificationPhone) return
    try {
      await upsertWhatsappSettings(businessId, { phone: notificationPhone, enabled: true })
    } catch (error) {
      console.error("[whatsapp] falha ao salvar número no onboarding", error)
    }
  }

  const values = {
    name,
    segment: input.segment,
    phone,
    address,
    city,
    state,
    displayName,
    primaryColor: input.primaryColor.toUpperCase(),
    logoUrl: logo.value,
  }

  const access = input.createNew ? null : await getAccess()
  if (access) {
    if (access.role !== "owner") return fail("Somente o proprietário pode alterar estes dados.")
    await db.update(businesses).set(values).where(eq(businesses.id, access.business.id))
    await saveNotificationPhone(access.business.id)
    return finish(access.business.id, ["business"])
  }

  if (!(await rateLimit(`create-business:${session.user.id}`, 5, 60 * 60 * 24))) return fail(RATE_LIMITED)
  const slug = await uniqueSlugFrom(name)
  const businessId = await db.transaction(async (tx) => {
    const [business] = await tx
      .insert(businesses)
      .values({ ...values, slug, openingHours: DEFAULT_HOURS, ownerUserId: session.user.id, onboardingStep: 2 })
      .returning({ id: businesses.id })
    await tx.insert(businessMembers).values({
      businessId: business.id,
      userId: session.user.id,
      role: "owner",
      permissions: DEFAULT_PERMISSIONS.owner,
    })
    return business.id
  })
  await setActiveBusiness(businessId)
  await saveNotificationPhone(businessId)
  await recordSetupChange(db, businessId, { reviewed: ["business"], mode })
  revalidatePath("/", "layout")
  return { ok: true, ready: false }
}

/* ---------------------------- Etapa 2: funcionamento ---------------------------- */

export async function saveHoursStep(input: { openingHours: DaySchedule[] }): Promise<Result> {
  const ctx = await requireOwner()
  if (!ctx.access) return fail(ctx.error!)
  const error = validateWeekSchedule(input.openingHours)
  if (error) return fail(error)
  await db
    .update(businesses)
    .set({ openingHours: normalizeWeekSchedule(input.openingHours) })
    .where(eq(businesses.id, ctx.access.business.id))
  return finish(ctx.access.business.id, ["hours"])
}

/* --------------------------- Etapa 4: "eu também atendo" -------------------------- */

/** Vincula o proprietário ao profissional cadastrado, para que ele veja a própria agenda. */
export async function linkSelfAsProfessional(professionalId: string): Promise<Result> {
  if (!isUuid(professionalId)) return fail("Profissional inválido.")
  const ctx = await requireOwner()
  if (!ctx.access) return fail(ctx.error!)
  const { access } = ctx
  const [owned] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.businessId, access.business.id)))
    .limit(1)
  if (!owned) return fail("Profissional não encontrado.")
  await db
    .update(businessMembers)
    .set({ professionalId })
    .where(and(eq(businessMembers.id, access.memberId), eq(businessMembers.businessId, access.business.id)))
  revalidatePath("/", "layout")
  return { ok: true }
}

/* ------------------------------ Etapa 5: regras ------------------------------ */

export async function saveRulesStep(input: { slotIntervalMin: number; minAdvanceMin: number }): Promise<Result> {
  const ctx = await requireOwner()
  if (!ctx.access) return fail(ctx.error!)
  if (!SLOT_INTERVALS.includes(input.slotIntervalMin)) return fail("Intervalo de horários inválido.")
  if (!MIN_ADVANCE_OPTIONS.some((o) => o.value === input.minAdvanceMin)) return fail("Antecedência mínima inválida.")
  await db
    .update(businesses)
    .set({ slotIntervalMin: input.slotIntervalMin, minAdvanceMin: input.minAdvanceMin })
    .where(eq(businesses.id, ctx.access.business.id))
  return finish(ctx.access.business.id, ["rules"])
}

/* --------------------------- Etapa 6: página pública --------------------------- */

export interface PageStepInput {
  slug: string
  description: string
  coverUrl: string | null
  onlineBookingEnabled: boolean
}

export async function savePageStep(input: PageStepInput): Promise<Result> {
  const ctx = await requireOwner()
  if (!ctx.access) return fail(ctx.error!)
  const business = ctx.access.business
  const slug = slugify(input.slug ?? "")
  if (!isValidSlug(slug)) return fail("Endereço inválido. Use letras, números e hífens (3 a 48 caracteres).")
  if (!(await isSlugAvailable(slug, business.id))) return fail("Este endereço já está em uso. Escolha outro.")
  const cover = cleanImage(input.coverUrl)
  if (cover.error) return fail(cover.error)

  try {
    await db
      .update(businesses)
      .set({
        slug,
        description: cleanText(input.description, 500),
        coverUrl: cover.value,
        onlineBookingEnabled: Boolean(input.onlineBookingEnabled),
      })
      .where(eq(businesses.id, business.id))
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505") return fail("Este endereço já está em uso. Escolha outro.")
    throw error
  }
  return finish(business.id, ["page"])
}

export async function checkSlugAvailability(slug: string) {
  const session = await getSession()
  if (!session?.user) return { available: false, reason: "Sessão expirada." }
  if (!(await rateLimit(`slug-check:${await clientIp()}`, 60, 60))) return { available: false, reason: RATE_LIMITED }
  const normalized = slugify(slug ?? "")
  if (!isValidSlug(normalized)) return { available: false, reason: "Use letras, números e hífens (3 a 48 caracteres)." }
  const access = await getAccess()
  const available = await isSlugAvailable(normalized, access?.role === "owner" ? access.business.id : undefined)
  return { available, reason: available ? null : "Endereço indisponível." }
}

/* ------------------------------ Preferências ------------------------------ */

export async function setSetupMode(mode: SetupMode): Promise<Result> {
  const ctx = await requireOwner()
  if (!ctx.access) return fail(ctx.error!)
  const state = await recordSetupChange(db, ctx.access.business.id, { mode: mode === "manual" ? "manual" : "guided" })
  if (state && !state.available) return fail("Progresso indisponível no momento. Tente novamente mais tarde.")
  revalidatePath("/painel")
  return { ok: true }
}

export async function setChecklistDismissed(dismissed: boolean): Promise<Result> {
  const ctx = await requireOwner()
  if (!ctx.access) return fail(ctx.error!)
  const state = await recordSetupChange(db, ctx.access.business.id, { dismissed: Boolean(dismissed) })
  if (!state?.available) return fail("Não foi possível salvar a preferência. Tente novamente mais tarde.")
  revalidatePath("/painel", "layout")
  return { ok: true }
}
