import { and, eq } from "drizzle-orm"

import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { isUuid } from "@/lib/actions/result"
import { professionals, timeBlocks } from "@/lib/db/schema"
import type { Permission } from "@/lib/permissions"

export type BlockActor = {
  businessId: string
  permissions: Set<Permission>
  /** Profissional vinculado ao membro; necessário para gerenciar a própria agenda. */
  professionalId: string | null
}

export const BLOCK_NO_PERMISSION = "Você não tem permissão para gerenciar bloqueios desta agenda."

/**
 * agenda.view_all: qualquer agenda do estabelecimento, inclusive bloqueios gerais (sem profissional).
 * availability.manage_own: apenas a agenda do próprio profissional vinculado.
 */
export function canManageTimeBlock(actor: Pick<BlockActor, "permissions" | "professionalId">, targetProfessionalId: string | null) {
  if (actor.permissions.has("agenda.view_all")) return true
  if (!actor.permissions.has("availability.manage_own")) return false
  return Boolean(actor.professionalId) && targetProfessionalId === actor.professionalId
}

type Result = { ok: true } | { ok: false; error: string }

export async function insertTimeBlock(
  db: BillingDb,
  actor: BlockActor,
  input: { professionalId: string | null; startsAt: Date; endsAt: Date; reason: string | null }
): Promise<Result> {
  if (input.professionalId) {
    if (!isUuid(input.professionalId)) return { ok: false, error: "Profissional inválido." }
    const [owned] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, input.professionalId), eq(professionals.businessId, actor.businessId)))
    if (!owned) return { ok: false, error: "Profissional não encontrado." }
  }
  if (!canManageTimeBlock(actor, input.professionalId)) return { ok: false, error: BLOCK_NO_PERMISSION }

  await db.insert(timeBlocks).values({
    businessId: actor.businessId,
    professionalId: input.professionalId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    reason: input.reason,
  })
  return { ok: true }
}

export async function removeTimeBlock(db: BillingDb, actor: BlockActor, id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, error: "Bloqueio inválido." }
  const [block] = await db
    .select({ id: timeBlocks.id, professionalId: timeBlocks.professionalId })
    .from(timeBlocks)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.businessId, actor.businessId)))
  if (!block) return { ok: false, error: "Bloqueio não encontrado." }
  if (!canManageTimeBlock(actor, block.professionalId)) return { ok: false, error: BLOCK_NO_PERMISSION }

  await db.delete(timeBlocks).where(and(eq(timeBlocks.id, id), eq(timeBlocks.businessId, actor.businessId)))
  return { ok: true }
}
