import "server-only"

import { cache } from "react"
import { and, asc, eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { businesses, businessMembers } from "@/lib/db/schema"
import { effectivePermissions, type MemberRole, type Permission } from "@/lib/permissions"

export const ACTIVE_BUSINESS_COOKIE = "marcai_business"
export const NO_PERMISSION = "Você não tem permissão para realizar esta ação."

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

/** Usuário autenticado ou redirecionamento para o login. */
export const requireUser = cache(async () => {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")
  return session.user
})

export const listMemberships = cache(async (userId: string) => {
  return db
    .select({ member: businessMembers, business: businesses })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.active, true)))
    .orderBy(asc(businessMembers.createdAt))
})

export type Access = {
  user: { id: string; name: string; email: string }
  business: typeof businesses.$inferSelect
  role: MemberRole
  permissions: Set<Permission>
  /** Profissional vinculado ao membro (agenda individual). */
  professionalId: string | null
  memberId: string
}

/**
 * Resolve o estabelecimento ativo a partir da sessão e do vínculo do usuário.
 * Retorna null quando não há sessão ou vínculo ativo — nunca cai em outro tenant.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const session = await getSession()
  if (!session?.user) return null
  const memberships = await listMemberships(session.user.id)
  if (!memberships.length) return null
  const preferred = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value
  const current = memberships.find((m) => m.business.id === preferred) ?? memberships[0]
  const role = current.member.role
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    business: current.business,
    role,
    permissions: effectivePermissions(role, current.member.permissions),
    professionalId: current.member.professionalId,
    memberId: current.member.id,
  }
})

/** Acesso obrigatório em páginas do painel; redireciona para login/onboarding. */
export const requireAccess = cache(async (): Promise<Access> => {
  await requireUser()
  const access = await getAccess()
  if (!access) redirect("/onboarding")
  if (!access.business.onboardingCompletedAt && access.role === "owner") redirect("/onboarding")
  return access
})

/** Grava o estabelecimento ativo; o vínculo é sempre revalidado em getAccess. */
export async function setActiveBusiness(businessId: string) {
  const isDev = process.env.NODE_ENV === "development"
  ;(await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: isDev ? "none" : "lax",
    secure: isDev || process.env.NODE_ENV === "production",
  })
}

export function can(access: Access | null, permission: Permission) {
  return Boolean(access?.permissions.has(permission))
}

/** Páginas: exige a permissão ou envia o usuário para o início do painel. */
export async function requirePagePermission(permission: Permission) {
  const access = await requireAccess()
  if (!can(access, permission)) redirect("/painel?acesso=negado")
  return access
}

/** Server actions: retorna o acesso ou null quando não autorizado. */
export async function authorize(permission?: Permission) {
  const access = await getAccess()
  if (!access) return null
  if (permission && !can(access, permission)) return null
  return access
}

/** Compatibilidade com as consultas existentes: estabelecimento do usuário logado. */
export const getCurrentBusiness = cache(async () => (await requireAccess()).business)

export const getBusinessBySlug = cache(async (slug: string) => {
  const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1)
  return business ?? null
})
