import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ClientProfile } from "@/components/clients/client-profile"
import { isUuid } from "@/lib/actions/result"
import { getCurrentBusiness } from "@/lib/business"
import { listAppointments } from "@/lib/queries/appointments"
import { getClient } from "@/lib/queries/clients"
import { getFormOptions } from "@/lib/queries/options"

export async function generateMetadata({ params }: PageProps<"/clientes/[id]">): Promise<Metadata> {
  const { id } = await params
  if (!isUuid(id)) return { title: "Cliente" }
  const business = await getCurrentBusiness()
  const client = await getClient(business.id, id)
  return { title: client?.name ?? "Cliente" }
}

export default async function ClientPage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const business = await getCurrentBusiness()
  const [client, history, options] = await Promise.all([
    getClient(business.id, id),
    listAppointments(business.id, { clientId: id, order: "desc", limit: 200 }),
    getFormOptions(business.id),
  ])
  if (!client) notFound()

  return <ClientProfile client={client} history={history} options={options} />
}
