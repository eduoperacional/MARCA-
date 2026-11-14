import "server-only"

import { cache } from "react"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { adminCan, type AdminPermission } from "@/lib/admin/permissions"
import { getSession } from "@/lib/business"
import { db } from "@/lib/db"
import { adminAuditLog, platformAdmins, type AdminRole } from "@/lib/db/schema"

/** Sessões administrativas mais antigas que isso exigem novo login. */
const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

export type AdminContext = {
  user: { id: string; name: string; email: string }
  role: AdminRole
  can: (permission: AdminPermission) => boolean
}

/**
 * Resolve o administrador da plataforma a partir da sessão do servidor.
 * O papel vem exclusivamente da tabela platform_admins: nada do navegador é considerado.
 */
export const getAdmin = cache(async (): Promise<AdminContext | null> => {
  const session = await getSession()
  if (!session?.user) return null

  const sessionStartedAt = new Date(session.session.createdAt).getTime()
  if (Date.now() - sessionStartedAt > ADMIN_SESSION_MAX_AGE_MS) return null

  let row: { role: AdminRole } | undefined
  try {
    ;[row] = await db
      .select({ role: platformAdmins.role })
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, session.user.id), eq(platformAdmins.active, true)))
      .limit(1)
  } catch (error) {
    console.error("[admin] Falha ao verificar administrador (rode o script 006?)", error)
    return null
  }
  if (!row) return null

  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    role: row.role,
    can: (permission) => adminCan(row.role, permission),
  }
})

/** Páginas: sem sessão vai para o login; sem papel de admin a rota "não existe". */
export async function requireAdmin(permission: AdminPermission = "dashboard.view") {
  const session = await getSession()
  if (!session?.user) redirect("/entrar?redirect=/admin")
  const admin = await getAdmin()
  if (!admin) {
    const sessionStartedAt = new Date(session.session.createdAt).getTime()
    if (Date.now() - sessionStartedAt > ADMIN_SESSION_MAX_AGE_MS) redirect("/entrar?redirect=/admin&reauth=1")
    notFound()
  }
  if (!admin.can(permission)) redirect("/admin?acesso=negado")
  return admin
}

/** Server actions e APIs: retorna o admin ou null quando não autorizado. */
export async function authorizeAdmin(permission: AdminPermission) {
  const admin = await getAdmin()
  if (!admin || !admin.can(permission)) return null
  return admin
}

type AuditInput = {
  action: string
  targetType: string
  targetId?: string | null
  businessId?: string | null
  reason?: string | null
  details?: Record<string, unknown>
}

type Executor = Pick<typeof db, "insert">

export async function logAdminAction(admin: AdminContext, input: AuditInput, executor: Executor = db) {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip")
  await executor.insert(adminAuditLog).values({
    actorUserId: admin.user.id,
    actorEmail: admin.user.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    businessId: input.businessId ?? null,
    reason: input.reason ?? null,
    details: input.details ?? {},
    ip: ip ?? null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  })
}
