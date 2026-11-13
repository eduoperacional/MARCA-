import type { Metadata } from "next"

import { FinanceView } from "@/components/finance/finance-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam, resolvePeriod } from "@/lib/period"
import { getFinanceOverview } from "@/lib/queries/finance"
import { getFormOptions } from "@/lib/queries/options"
import { todayLocal } from "@/lib/time"

export const metadata: Metadata = { title: "Financeiro" }

export default async function FinancePage({ searchParams }: PageProps<"/painel/financeiro">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const today = todayLocal()
  const selection = resolvePeriod(
    { period: firstParam(params.period), from: firstParam(params.from), to: firstParam(params.to) },
    today,
    "month"
  )
  const [overview, options] = await Promise.all([getFinanceOverview(business.id, selection), getFormOptions(business.id)])

  return <FinanceView overview={overview} selection={selection} today={today} options={options} />
}
