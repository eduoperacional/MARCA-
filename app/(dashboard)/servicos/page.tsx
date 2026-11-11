import type { Metadata } from "next"

import { ServicesView } from "@/components/services/services-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam } from "@/lib/period"
import { listProfessionals, listServices } from "@/lib/queries/catalog"

export const metadata: Metadata = { title: "Serviços" }

export default async function ServicesPage({ searchParams }: PageProps<"/servicos">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const [services, professionals] = await Promise.all([listServices(business.id), listProfessionals(business.id)])
  return <ServicesView services={services} professionals={professionals} openCreate={firstParam(params.novo) === "1"} />
}
