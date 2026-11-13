"use server"

import { createHash, randomBytes } from "node:crypto"

import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

import { fail, isUuid } from "@/lib/actions/result"
import { authorize, getSession, NO_PERMISSION, setActiveBusiness } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses, businessMembers, invitations, professionals, users } from "@/lib/db/schema"
import { sendEmail } from "@/lib/email"
import { isMemberRole, ROLE_LABELS, sanitizePermissions, type MemberRole } from "@/lib/permissions"
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit"

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

async function appOrigin() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "https"
  return host ? `${proto}://${host}` : (process.env.BETTER_AUTH_URL ?? "")
}

async function validProfessional(businessId: string, professionalId: string | null | undefined) {
  if (!professionalId) return null
  if (!isUuid(professionalId)) return undefined
  const [row] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.businessId, businessId)))
    .limit(1)
  return row ? row.id : undefined
}

export interface InviteInput {
  email: string
  role: MemberRole
  permissions: string[]
  professionalId: string | null
}

export async function createInvitation(input: InviteInput) {
  const access = await authorize("team.manage")
  if (!access) return fail(NO_PERMISSION)
  if (!(await rateLimit(`invite:${access.business.id}`, 20, 60 * 60))) return fail(RATE_LIMITED)

  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 160)
  if (!EMAIL_RE.test(email)) return fail("Informe um e-mail válido.")
  if (!isMemberRole(input.role) || input.role === "owner") return fail("Função inválida.")
  if (input.role === "professional" && !input.professionalId) {
    return fail("Vincule o convidado a um profissional cadastrado para liberar a agenda individual.")
  }
  const professionalId = await validProfessional(access.business.id, input.professionalId)
  if (professionalId === undefined) return fail("Profissional inválido.")
  const permissions = sanitizePermissions(input.role, input.permissions)

  const [existingMember] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, access.business.id), sql`lower(${users.email}) = ${email}`))
    .limit(1)
  if (existingMember) return fail("Esta pessoa já faz parte da equipe. Edite o acesso dela na lista de membros.")

  const token = randomBytes(32).toString("base64url")
  await db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.businessId, access.business.id),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt)
        )
      )
    await tx.insert(invitations).values({
      businessId: access.business.id,
      email,
      role: input.role,
      permissions,
      professionalId,
      tokenHash: hashToken(token),
      invitedBy: access.user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
  })

  const url = `${await appOrigin()}/convite/${token}`
  const { delivered } = await sendEmail({
    to: email,
    subject: `Convite para a equipe de ${access.business.name}`,
    heading: `Você foi convidado para ${access.business.name}`,
    body: `${access.user.name} convidou você para acessar a MARCAÍ como ${ROLE_LABELS[input.role]}. O convite expira em 7 dias.`,
    actionLabel: "Aceitar convite",
    actionUrl: url,
  })
  revalidatePath("/painel/equipe")
  return { ok: true as const, data: { url, emailed: delivered } }
}

export async function revokeInvitation(id: string) {
  if (!isUuid(id)) return fail("Convite inválido.")
  const access = await authorize("team.manage")
  if (!access) return fail(NO_PERMISSION)
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.businessId, access.business.id), isNull(invitations.acceptedAt)))
  revalidatePath("/painel/equipe")
  return { ok: true as const }
}

export interface MemberUpdateInput {
  memberId: string
  role: MemberRole
  permissions: string[]
  professionalId: string | null
  active: boolean
}

export async function updateMember(input: MemberUpdateInput) {
  if (!isUuid(input.memberId)) return fail("Membro inválido.")
  const access = await authorize("team.manage")
  if (!access) return fail(NO_PERMISSION)
  if (input.memberId === access.memberId) return fail("Você não pode alterar o próprio acesso.")
  if (!isMemberRole(input.role) || input.role === "owner") return fail("Função inválida.")

  const [member] = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.id, input.memberId), eq(businessMembers.businessId, access.business.id)))
    .limit(1)
  if (!member) return fail("Membro não encontrado.")
  if (member.role === "owner") return fail("O acesso do proprietário não pode ser alterado.")

  const professionalId = await validProfessional(access.business.id, input.professionalId)
  if (professionalId === undefined) return fail("Profissional inválido.")
  if (input.role === "professional" && !professionalId) return fail("Vincule um profissional cadastrado.")

  await db
    .update(businessMembers)
    .set({
      role: input.role,
      permissions: sanitizePermissions(input.role, input.permissions),
      professionalId,
      active: Boolean(input.active),
    })
    .where(and(eq(businessMembers.id, member.id), eq(businessMembers.businessId, access.business.id)))
  revalidatePath("/painel/equipe")
  return { ok: true as const }
}

export async function acceptInvitation(token: string) {
  const session = await getSession()
  if (!session?.user) return fail("Entre na sua conta para aceitar o convite.")
  if (!(await rateLimit(`accept-invite:${session.user.id}`, 10, 60 * 10))) return fail(RATE_LIMITED)
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return fail("Convite inválido.")

  const [invite] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1)
  if (!invite) return fail("Este convite é inválido, expirou ou já foi utilizado.")
  if (invite.email !== session.user.email.toLowerCase()) {
    return fail("Este convite foi enviado para outro e-mail. Entre com a conta correta.")
  }

  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, invite.businessId)).limit(1)
  if (!business) return fail("O estabelecimento deste convite não está mais disponível.")

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: businessMembers.id, role: businessMembers.role })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, invite.businessId), eq(businessMembers.userId, session.user.id)))
      .limit(1)
    if (existing) {
      if (existing.role !== "owner") {
        await tx
          .update(businessMembers)
          .set({ role: invite.role, permissions: invite.permissions, professionalId: invite.professionalId, active: true })
          .where(eq(businessMembers.id, existing.id))
      }
    } else {
      await tx.insert(businessMembers).values({
        businessId: invite.businessId,
        userId: session.user.id,
        role: invite.role,
        permissions: invite.permissions,
        professionalId: invite.professionalId,
      })
    }
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id))
  })

  await setActiveBusiness(invite.businessId)
  revalidatePath("/painel", "layout")
  return { ok: true as const }
}
