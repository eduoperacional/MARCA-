"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { cleanText, fail, isUuid, toCents } from "@/lib/actions/result"
import { getSession, setActiveBusiness } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses, businessMembers, professionals, professionalServices, services } from "@/lib/db/schema"
import { BUSINESS_SEGMENTS } from "@/lib/onboarding"
import { DEFAULT_PERMISSIONS } from "@/lib/permissions"
import { clientIp, rateLimit, RATE_LIMITED } from "@/lib/rate-limit"
import { normalizeWeekSchedule, validateWeekSchedule } from "@/lib/schedule"
import { isValidSlug, slugify } from "@/lib/slug"
import { isSlugAvailable, uniqueSlugFrom } from "@/lib/slug-server"
import type { DaySchedule } from "@/lib/types"

type Result = { ok: true } | { ok: false; error: string }
const ok = (): Result => ({ ok: true })

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

/** Estabelecimento em configuração do usuário logado (somente o proprietário). */
async function ownedDraft(userId: string) {
  const [row] = await db
    .select({ business: businesses })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.role, "owner"),
        eq(businessMembers.active, true),
        isNull(businesses.onboardingCompletedAt)
      )
    )
    .limit(1)
  return row?.business ?? null
}

async function requireDraft() {
  const session = await getSession()
  if (!session?.user) return { error: "Sessão expirada. Entre novamente." as const }
  const business = await ownedDraft(session.user.id)
  if (!business) return { error: "Nenhum estabelecimento em configuração." as const }
  return { session, business }
}

async function advance(businessId: string, step: number, current: number) {
  if (step > current) {
    await db.update(businesses).set({ onboardingStep: step }).where(eq(businesses.id, businessId))
  }
}

export interface BusinessStepInput {
  name: string
  segment: string
  phone: string
  address: string
  city: string
  state: string
}

export async function saveBusinessStep(input: BusinessStepInput): Promise<Result> {
  const session = await getSession()
  if (!session?.user) return fail("Sessão expirada. Entre novamente.")
  if (!(await rateLimit(`onboarding:${session.user.id}`, 30, 60))) return fail(RATE_LIMITED)

  const name = cleanText(input.name, 80)
  if (!name || name.length < 2) return fail("Informe o nome comercial.")
  if (!BUSINESS_SEGMENTS.some((s) => s.value === input.segment)) return fail("Selecione o tipo de negócio.")
  const phone = cleanText(input.phone, 30)
  if (!phone || !isValidPhone(phone)) return fail("Informe um telefone ou WhatsApp válido.")
  const address = cleanText(input.address, 200)
  if (!address) return fail("Informe o endereço.")
  const city = cleanText(input.city, 80)
  if (!city) return fail("Informe a cidade.")
  const state = String(input.state ?? "").toUpperCase()
  if (!UF.has(state)) return fail("Selecione o estado.")

  const values = { name, segment: input.segment, phone, address, city, state }
  const draft = await ownedDraft(session.user.id)

  if (draft) {
    await db.update(businesses).set(values).where(eq(businesses.id, draft.id))
    await advance(draft.id, 2, draft.onboardingStep)
    revalidatePath("/onboarding")
    return ok()
  }

  if (!(await rateLimit(`create-business:${session.user.id}`, 5, 60 * 60 * 24))) return fail(RATE_LIMITED)
  const slug = await uniqueSlugFrom(name)
  const businessId = await db.transaction(async (tx) => {
    const [business] = await tx
      .insert(businesses)
      .values({
        ...values,
        slug,
        displayName: name,
        openingHours: DEFAULT_HOURS,
        ownerUserId: session.user.id,
        onboardingStep: 2,
      })
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
  revalidatePath("/onboarding")
  return ok()
}

export interface IdentityStepInput {
  displayName: string
  description: string
  slug: string
  primaryColor: string
  logoUrl: string | null
  coverUrl: string | null
}

export async function saveIdentityStep(input: IdentityStepInput): Promise<Result> {
  const ctx = await requireDraft()
  if ("error" in ctx) return fail(ctx.error!)
  const { business } = ctx

  const displayName = cleanText(input.displayName, 80)
  if (!displayName) return fail("Informe o nome de exibição.")
  const description = cleanText(input.description, 500)
  if (!/^#[0-9a-f]{6}$/i.test(input.primaryColor)) return fail("Cor principal inválida.")
  const slug = slugify(input.slug ?? "")
  if (!isValidSlug(slug)) return fail("Endereço público inválido. Use letras, números e hífens (3 a 48 caracteres).")
  if (!(await isSlugAvailable(slug, business.id))) return fail("Este endereço público já está em uso. Escolha outro.")
  const logo = cleanImage(input.logoUrl)
  if (logo.error) return fail(logo.error)
  const cover = cleanImage(input.coverUrl)
  if (cover.error) return fail(cover.error)

  try {
    await db
      .update(businesses)
      .set({
        displayName,
        description,
        slug,
        primaryColor: input.primaryColor.toUpperCase(),
        logoUrl: logo.value,
        coverUrl: cover.value,
      })
      .where(eq(businesses.id, business.id))
  } catch (error) {
    if ((error as { code?: string; cause?: { code?: string } })?.cause?.code === "23505") {
      return fail("Este endereço público já está em uso. Escolha outro.")
    }
    throw error
  }
  await advance(business.id, 3, business.onboardingStep)
  revalidatePath("/onboarding")
  return ok()
}

export async function checkSlugAvailability(slug: string) {
  const session = await getSession()
  if (!session?.user) return { available: false, reason: "Sessão expirada." }
  if (!(await rateLimit(`slug-check:${await clientIp()}`, 60, 60))) return { available: false, reason: RATE_LIMITED }
  const normalized = slugify(slug ?? "")
  if (!isValidSlug(normalized)) return { available: false, reason: "Use letras, números e hífens (3 a 48 caracteres)." }
  const draft = await ownedDraft(session.user.id)
  const available = await isSlugAvailable(normalized, draft?.id)
  return { available, reason: available ? null : "Endereço indisponível." }
}

export interface HoursStepInput {
  openingHours: DaySchedule[]
  slotIntervalMin: number
  minAdvanceMin: number
  onlineBookingEnabled: boolean
}

export async function saveHoursStep(input: HoursStepInput): Promise<Result> {
  const ctx = await requireDraft()
  if ("error" in ctx) return fail(ctx.error!)
  const error = validateWeekSchedule(input.openingHours)
  if (error) return fail(error)
  if (![10, 15, 20, 30, 60].includes(input.slotIntervalMin)) return fail("Intervalo de horários inválido.")
  if (![0, 30, 60, 120, 240, 1440].includes(input.minAdvanceMin)) return fail("Antecedência mínima inválida.")

  await db
    .update(businesses)
    .set({
      openingHours: normalizeWeekSchedule(input.openingHours),
      slotIntervalMin: input.slotIntervalMin,
      minAdvanceMin: input.minAdvanceMin,
      onlineBookingEnabled: Boolean(input.onlineBookingEnabled),
    })
    .where(eq(businesses.id, ctx.business.id))
  await advance(ctx.business.id, 4, ctx.business.onboardingStep)
  revalidatePath("/onboarding")
  return ok()
}

export interface ServiceStepInput {
  name: string
  category: string
  price: string
  durationMin: number
}

export async function saveServiceStep(input: ServiceStepInput): Promise<Result> {
  const ctx = await requireDraft()
  if ("error" in ctx) return fail(ctx.error!)
  const name = cleanText(input.name, 100)
  if (!name) return fail("Informe o nome do serviço.")
  const category = cleanText(input.category, 60) ?? "Geral"
  const priceCents = toCents(input.price)
  if (priceCents === null) return fail("Informe um preço válido.")
  if (!Number.isInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 600) {
    return fail("Informe uma duração entre 5 e 600 minutos.")
  }

  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.businessId, ctx.business.id))
    .limit(1)
  const values = { name, category, priceCents, durationMin: input.durationMin, active: true }
  if (existing) {
    await db.update(services).set(values).where(and(eq(services.id, existing.id), eq(services.businessId, ctx.business.id)))
  } else {
    await db.insert(services).values({ ...values, businessId: ctx.business.id })
  }
  await advance(ctx.business.id, 5, ctx.business.onboardingStep)
  revalidatePath("/onboarding")
  return ok()
}

export interface ProfessionalStepInput {
  mode: "self" | "other"
  name: string
  phone: string
  email: string
  serviceIds: string[]
}

export async function completeProfessionalStep(input: ProfessionalStepInput): Promise<Result> {
  const ctx = await requireDraft()
  if ("error" in ctx) return fail(ctx.error!)
  const { session, business } = ctx

  const isSelf = input.mode === "self"
  const name = isSelf ? cleanText(session.user.name, 120) : cleanText(input.name, 120)
  if (!name) return fail("Informe o nome do profissional.")
  const phone = isSelf ? cleanText((session.user as { phone?: string | null }).phone, 30) : cleanText(input.phone, 30)
  if (!isSelf && phone && !isValidPhone(phone)) return fail("Telefone inválido.")
  const email = isSelf ? session.user.email : cleanText(input.email, 160)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("E-mail inválido.")

  const ownedServices = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.businessId, business.id))
  const allowed = new Set(ownedServices.map((s) => s.id))
  const serviceIds = input.serviceIds.filter((id) => isUuid(id) && allowed.has(id))
  if (!serviceIds.length) return fail("Selecione ao menos um serviço realizado pelo profissional.")

  await db.transaction(async (tx) => {
    const [professional] = await tx
      .insert(professionals)
      .values({
        businessId: business.id,
        name,
        phone,
        email,
        color: business.primaryColor,
        workSchedule: business.openingHours,
        active: true,
      })
      .returning({ id: professionals.id })
    await tx.insert(professionalServices).values(serviceIds.map((serviceId) => ({ professionalId: professional.id, serviceId })))
    if (isSelf) {
      await tx
        .update(businessMembers)
        .set({ professionalId: professional.id })
        .where(and(eq(businessMembers.businessId, business.id), eq(businessMembers.userId, session.user.id)))
    }
    await tx
      .update(businesses)
      .set({ onboardingStep: 6, onboardingCompletedAt: new Date() })
      .where(eq(businesses.id, business.id))
  })
  await setActiveBusiness(business.id)
  revalidatePath("/painel", "layout")
  return ok()
}

/** Permite voltar para uma etapa anterior já concluída. */
export async function goToOnboardingStep(step: number): Promise<Result> {
  const ctx = await requireDraft()
  if ("error" in ctx) return fail(ctx.error!)
  if (!Number.isInteger(step) || step < 1 || step > ctx.business.onboardingStep) return fail("Etapa inválida.")
  return ok()
}
