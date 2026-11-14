import type { Metadata } from "next"

import { GrowthChart, RevenueChart, SubscriptionFlowChart } from "@/components/admin/charts"
import { KpiCard, SectionCard } from "@/components/admin/kpi-card"
import { PageHeader, PeriodTabs } from "@/components/admin/period-tabs"
import { requireAdmin } from "@/lib/admin/auth"
import { getMonthlySeries, getOverview, getPlanBreakdown, resolvePeriod } from "@/lib/admin/metrics"
import { formatCurrency, formatNumber } from "@/lib/format"

export const metadata: Metadata = { title: "Dashboard" }

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const admin = await requireAdmin("dashboard.view")
  const params = await searchParams
  const { period, start, end } = resolvePeriod(typeof params.periodo === "string" ? params.periodo : undefined)
  const showMoney = admin.can("finance.view")

  const [overview, series, plans] = await Promise.all([
    getOverview(start, end),
    getMonthlySeries(12),
    getPlanBreakdown(start, end),
  ])

  return (
    <>
      {params.acesso === "negado" && (
        <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Seu papel não tem permissão para acessar aquela área.
        </p>
      )}
      <PageHeader
        title="Visão geral da plataforma"
        description="Indicadores calculados diretamente do banco. Receita considera apenas pagamentos confirmados."
        actions={<PeriodTabs basePath="/admin" current={period} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Estabelecimentos" value={formatNumber(overview.businesses)} hint={`${formatNumber(overview.newBusinesses)} novos no período`} />
        <KpiCard label="Usuários" value={formatNumber(overview.users)} />
        <KpiCard label="Assinaturas ativas" value={formatNumber(overview.active)} hint={`${formatNumber(overview.trialing)} em trial`} />
        <KpiCard label="Inadimplentes" value={formatNumber(overview.delinquent)} hint={`${formatNumber(overview.canceled)} canceladas`} />
        {showMoney && (
          <>
            <KpiCard emphasis label="MRR" value={formatCurrency(overview.mrr)} hint="Ativas pagantes, anuais ÷ 12" />
            <KpiCard label="ARR" value={formatCurrency(overview.arr)} hint="MRR × 12" />
            <KpiCard label="Recebido no período" value={formatCurrency(overview.received)} hint={`Pendente: ${formatCurrency(overview.pending)}`} />
            <KpiCard label="Ticket médio" value={formatCurrency(overview.averageTicket)} hint="MRR ÷ assinantes pagantes" />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Crescimento de estabelecimentos" description="Total acumulado e novos cadastros, últimos 12 meses">
          <GrowthChart data={series} />
        </SectionCard>
        <SectionCard title="Assinaturas" description="Novas assinaturas e cancelamentos por mês">
          <SubscriptionFlowChart data={series} />
        </SectionCard>
        {showMoney && (
          <SectionCard title="Receita recebida" description="Pagamentos aprovados, líquidos de reembolso">
            <RevenueChart data={series} />
          </SectionCard>
        )}
        <SectionCard title="Distribuição por plano" description="Assinaturas vigentes por plano">
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum plano cadastrado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {plans.map((plan) => {
                const total = plans.reduce((sum, p) => sum + p.subscribers, 0) || 1
                const share = plan.subscribers / total
                return (
                  <li key={plan.planId} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{plan.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatNumber(plan.subscribers)} assinantes
                        {showMoney && ` · ${formatCurrency(plan.mrr)}/mês`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  )
}
