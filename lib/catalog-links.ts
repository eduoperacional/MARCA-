import { and, eq, inArray } from "drizzle-orm"

import type { BillingDb } from "@/lib/billing/process-asaas-event"
import { isUuid } from "@/lib/actions/result"
import { professionalServices, professionals, services } from "@/lib/db/schema"

type ProfessionalValues = Omit<typeof professionals.$inferInsert, "id" | "businessId" | "createdAt">
type ServiceValues = Omit<typeof services.$inferInsert, "id" | "businessId" | "createdAt">

export type SaveResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Salva o profissional e substitui seus vínculos com serviços.
 * O profissional e todos os serviços precisam pertencer ao estabelecimento; IDs de outro tenant
 * são recusados (profissional) ou descartados (serviços), e nenhum vínculo alheio é removido.
 */
export async function persistProfessional(
  db: BillingDb,
  businessId: string,
  input: { id?: string; values: ProfessionalValues; serviceIds: string[] }
): Promise<SaveResult> {
  if (input.id !== undefined && !isUuid(input.id)) return { ok: false, error: "Profissional inválido." }
  const serviceIds = [...new Set(input.serviceIds.filter(isUuid))]

  return db.transaction(async (tx) => {
    let id = input.id
    if (id) {
      const [owned] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(and(eq(professionals.id, id), eq(professionals.businessId, businessId)))
        .for("update")
      if (!owned) return { ok: false as const, error: "Profissional não encontrado." }
      await tx.update(professionals).set(input.values).where(and(eq(professionals.id, id), eq(professionals.businessId, businessId)))
      await tx.delete(professionalServices).where(
        and(
          eq(professionalServices.professionalId, id),
          inArray(professionalServices.serviceId, tx.select({ id: services.id }).from(services).where(eq(services.businessId, businessId)))
        )
      )
    } else {
      const [created] = await tx.insert(professionals).values({ ...input.values, businessId }).returning({ id: professionals.id })
      id = created.id
    }

    const owned = serviceIds.length
      ? await tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, businessId), inArray(services.id, serviceIds)))
      : []
    if (owned.length) {
      await tx
        .insert(professionalServices)
        .values(owned.map((s) => ({ professionalId: id!, serviceId: s.id })))
        .onConflictDoNothing()
    }
    return { ok: true as const, id: id! }
  })
}

/** Equivalente a persistProfessional para o lado do serviço. */
export async function persistService(
  db: BillingDb,
  businessId: string,
  input: { id?: string; values: ServiceValues; professionalIds: string[] }
): Promise<SaveResult> {
  if (input.id !== undefined && !isUuid(input.id)) return { ok: false, error: "Serviço inválido." }
  const professionalIds = [...new Set(input.professionalIds.filter(isUuid))]

  return db.transaction(async (tx) => {
    let id = input.id
    if (id) {
      const [owned] = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, id), eq(services.businessId, businessId)))
        .for("update")
      if (!owned) return { ok: false as const, error: "Serviço não encontrado." }
      await tx.update(services).set(input.values).where(and(eq(services.id, id), eq(services.businessId, businessId)))
      await tx.delete(professionalServices).where(
        and(
          eq(professionalServices.serviceId, id),
          inArray(
            professionalServices.professionalId,
            tx.select({ id: professionals.id }).from(professionals).where(eq(professionals.businessId, businessId))
          )
        )
      )
    } else {
      const [created] = await tx.insert(services).values({ ...input.values, businessId }).returning({ id: services.id })
      id = created.id
    }

    const owned = professionalIds.length
      ? await tx
          .select({ id: professionals.id })
          .from(professionals)
          .where(and(eq(professionals.businessId, businessId), inArray(professionals.id, professionalIds)))
      : []
    if (owned.length) {
      await tx
        .insert(professionalServices)
        .values(owned.map((p) => ({ professionalId: p.id, serviceId: id! })))
        .onConflictDoNothing()
    }
    return { ok: true as const, id: id! }
  })
}
