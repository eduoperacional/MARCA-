import type { Metadata } from "next"

import { ClientsView } from "@/components/clients/clients-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam } from "@/lib/period"
import { listClients, type ClientSegment } from "@/lib/queries/clients"

export const metadata: Metadata = { title: "Clientes" }

const SEGMENTS: ClientSegment[] = ["all", "new", "recurring", "inactive"]

export default async function ClientsPage({ searchParams }: PageProps<"/painel/clientes">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const segmentParam = firstParam(params.segment) as ClientSegment | undefined
  const segment = segmentParam && SEGMENTS.includes(segmentParam) ? segmentParam : "all"
  const query = firstParam(params.q)?.trim().slice(0, 80) || undefined

  const clients = await listClients(business.id, { query, segment })

  return <ClientsView clients={clients} segment={segment} query={query ?? ""} openCreate={firstParam(params.novo) === "1"} />
}
