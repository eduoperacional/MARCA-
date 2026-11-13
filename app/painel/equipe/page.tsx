import { and, asc, eq, gt, isNull } from "drizzle-orm"
import type { Metadata } from "next"

import { TeamManager } from "@/components/team/team-manager"
import { requirePagePermission } from "@/lib/business"
import { db } from "@/lib/db"
import { businessMembers, invitations, professionals, users } from "@/lib/db/schema"

export const metadata: Metadata = { title: "Equipe" }

export default async function TeamPage() {
  const access = await requirePagePermission("team.manage")
  const businessId = access.business.id

  const [members, pending, pros] = await Promise.all([
    db
      .select({
        id: businessMembers.id,
        role: businessMembers.role,
        permissions: businessMembers.permissions,
        professionalId: businessMembers.professionalId,
        active: businessMembers.active,
        name: users.name,
        email: users.email,
      })
      .from(businessMembers)
      .innerJoin(users, eq(users.id, businessMembers.userId))
      .where(eq(businessMembers.businessId, businessId))
      .orderBy(asc(businessMembers.createdAt)),
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.businessId, businessId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date())
        )
      )
      .orderBy(asc(invitations.createdAt)),
    db
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(eq(professionals.businessId, businessId))
      .orderBy(asc(professionals.name)),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Equipe</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Convide pessoas para acessar o estabelecimento e defina o que cada uma pode ver e fazer.
        </p>
      </div>
      <TeamManager
        currentMemberId={access.memberId}
        members={members.map((m) => ({ ...m, permissions: (m.permissions as string[] | null) ?? [] }))}
        invitations={pending.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        professionals={pros}
      />
    </div>
  )
}
