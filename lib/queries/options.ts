import "server-only"

import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { listProfessionals, listServices } from "@/lib/queries/catalog"

export interface ClientOption {
  id: string
  name: string
  phone: string
}

/** Listas usadas pelos formulários de agendamento (cliente, serviço, profissional). */
export async function getFormOptions(businessId: string) {
  const [clientRows, services, professionals] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name, phone: clients.phone })
      .from(clients)
      .where(eq(clients.businessId, businessId))
      .orderBy(asc(clients.name)),
    listServices(businessId),
    listProfessionals(businessId),
  ])
  return { clients: clientRows as ClientOption[], services, professionals }
}

export type FormOptions = Awaited<ReturnType<typeof getFormOptions>>
