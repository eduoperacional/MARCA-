import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"

import { isOverlapError } from "@/lib/actions/result"
import { ACTIVE_STATUSES } from "@/lib/appointment-status"
import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { appointments, timeBlocks } from "@/lib/db/schema"

export type BookingTx = Parameters<Parameters<BillingDb["transaction"]>[0]>[0]
type Tx = BookingTx
type Executor = BillingDb | Tx

/** Status que ocupam o horário. Deve ser igual ao WHERE da constraint appointments_no_overlap (script 016). */
export const BLOCKING_STATUSES = ACTIVE_STATUSES

export type SlotConflict = "appointment" | "block"

export interface SlotRequest {
  businessId: string
  professionalId: string
  startsAt: Date
  endsAt: Date
  /** Agendamento sendo remarcado ou reaberto, que não conflita consigo mesmo. */
  excludeAppointmentId?: string
}

export type ReserveResult<T> = { ok: true; value: T } | { ok: false; conflict: SlotConflict }

export function agendaLockKey(businessId: string, professionalId: string) {
  return `agenda:${businessId}:${professionalId}`
}

/** Serializa as reservas de um mesmo profissional até o fim da transação (funciona com o pooler do Neon). */
async function lockAgenda(tx: Tx, businessId: string, professionalId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${agendaLockKey(businessId, professionalId)}, 0))`)
}

/** Intervalo semiaberto [início, fim): horários encostados não conflitam. */
export async function findSlotConflict(executor: Executor, req: SlotRequest): Promise<SlotConflict | null> {
  const [appointment] = await executor
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, req.businessId),
        eq(appointments.professionalId, req.professionalId),
        inArray(appointments.status, BLOCKING_STATUSES),
        lt(appointments.startsAt, req.endsAt),
        gt(appointments.endsAt, req.startsAt),
        req.excludeAppointmentId ? ne(appointments.id, req.excludeAppointmentId) : undefined
      )
    )
    .limit(1)
  if (appointment) return "appointment"

  const [block] = await executor
    .select({ id: timeBlocks.id })
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.businessId, req.businessId),
        or(isNull(timeBlocks.professionalId), eq(timeBlocks.professionalId, req.professionalId)),
        lt(timeBlocks.startsAt, req.endsAt),
        gt(timeBlocks.endsAt, req.startsAt)
      )
    )
    .limit(1)
  return block ? "block" : null
}

/**
 * Trava a agenda do profissional, confere conflitos e grava na mesma transação.
 * A constraint de exclusão do banco (23P01) é a última barreira caso algo escape da trava.
 */
export async function reserveSlot<T>(
  db: BillingDb,
  req: SlotRequest,
  write: (tx: Tx) => Promise<T>
): Promise<ReserveResult<T>> {
  if (!(req.endsAt.getTime() > req.startsAt.getTime())) throw new Error("Intervalo de agendamento inválido.")
  try {
    return await db.transaction(async (tx) => {
      await lockAgenda(tx, req.businessId, req.professionalId)
      const conflict = await findSlotConflict(tx, req)
      if (conflict) return { ok: false as const, conflict }
      return { ok: true as const, value: await write(tx) }
    })
  } catch (error) {
    if (isOverlapError(error)) return { ok: false, conflict: "appointment" }
    throw error
  }
}

/** Tenta cada profissional na ordem até um aceitar o horário ("qualquer profissional" do agendamento público). */
export async function reserveWithAnyProfessional<T>(
  db: BillingDb,
  professionalIds: string[],
  base: Omit<SlotRequest, "professionalId">,
  write: (tx: Tx, professionalId: string) => Promise<T>
): Promise<{ ok: true; value: T; professionalId: string } | { ok: false }> {
  for (const professionalId of professionalIds) {
    const result = await reserveSlot(db, { ...base, professionalId }, (tx) => write(tx, professionalId))
    if (result.ok) return { ok: true, value: result.value, professionalId }
  }
  return { ok: false }
}
