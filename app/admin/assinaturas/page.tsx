import type { Metadata } from "next"
import Link from "next/link"

import { FilterBar } from "@/components/admin/filter-bar"
import { KpiCard } from "@/components/admin/kpi-card"
import { Pagination } from "@/components/admin/pagination"
import { PageHeader } from "@/components/admin/period-tabs"
import { ToneBadge } from "@/components/admin/tone-badge"
import { requireAdmin } from "@/lib/admin/auth"
import { INTERVAL_LABEL, SUBSCRIPTION_STATUS } from "@/lib/admin/labels"
import { getSubscriptionSummary, listPlanOptions, listSubscriptions, PAGE_SIZE, SUBSCRIPTION_VIEWS } from "@/lib/admin/queries"
import { formatCents, formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Assinaturas" }

const str = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

export default async function SubscriptionsPage({ searchParams }: PageProps<"/admin/assinaturas">) {
  const admin = await requireAdmin("subscriptions.view")
  const params = await searchParams
  const view = str(params.visao) && SUBSCRIPTION_VIEWS[str(params.visao)!] ? str(params.visao)! : "todas"
  const filters = { q: str(params.q), view, plan: str(params.plano), page: Math.max(1, Number(str(params.pagina)) || 1) }

  const [{ rows, total }, summary, planOptions] = await Promise.all([
    listSubscriptions(filters),
    getSubscriptionSummary(),
    listPlanOptions(),
  ])

  const viewHref = (key: string) => {
    const search = new URLSearchParams()
    if (key !== "todas") search.set("visao", key)
    if (filters.q) search.set("q", filters.q)
    if (filters.plan) search.set("plano", filters.plan)
    const qs = search.toString()
    return `/admin/assinaturas${qs ? `?${qs}` : ""}`
  }

  return (
    <>
      <PageHeader title="Assinaturas" description="Trials, cobranças pendentes, inadimplência e renovações." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Ativas" value={formatNumber(summary.active)} emphasis />
        <KpiCard label="Em trial" value={formatNumber(summary.trialing)} />
        <KpiCard label="Pagamento pendente" value={formatNumber(summary.pending)} />
        <KpiCard label="Inadimplentes" value={formatNumber(summary.pastDue)} />
        <KpiCard
          label={admin.can("finance.view") ? "MRR" : "Renovam em 7 dias"}
          value={admin.can("finance.view") ? formatCents(summary.mrrCents) : formatNumber(summary.renewing7d)}
          hint={admin.can("finance.view") ? `${formatNumber(summary.renewing7d)} renovam em 7 dias` : undefined}
        />
      </div>

      <nav aria-label="Visões" className="flex flex-wrap gap-2">
        {Object.entries(SUBSCRIPTION_VIEWS).map(([key, item]) => (
          <Link
            key={key}
            href={viewHref(key)}
            aria-current={view === key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              view === key ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <FilterBar
        action="/admin/assinaturas"
        search={{ value: filters.q, placeholder: "Nome ou link do estabelecimento" }}
        selects={[
          {
            name: "plano",
            label: "Plano",
            value: filters.plan,
            options: [{ value: "", label: "Todos" }, ...planOptions.map((p) => ({ value: p.code, label: p.name }))],
          },
          {
            name: "visao",
            label: "Visão",
            value: view,
            options: Object.entries(SUBSCRIPTION_VIEWS).map(([value, item]) => ({ value, label: item.label })),
          },
        ]}
      />

      <div className="overflow-x-auto rounded-xl border bg-card/60">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Estabelecimento</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Trial até</th>
              <th className="px-4 py-3 font-medium">Próxima renovação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhuma assinatura nesta visão.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/admin/assinaturas/${row.id}`} className="font-medium text-foreground hover:underline">
                    {row.business_name}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.plan_name ?? "—"}</td>
                <td className="px-4 py-3">
                  {formatCents(row.price_cents)}
                  <span className="text-xs text-muted-foreground"> / {INTERVAL_LABEL[row.billing_interval].toLowerCase()}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <ToneBadge tone={SUBSCRIPTION_STATUS[row.status].tone}>{SUBSCRIPTION_STATUS[row.status].label}</ToneBadge>
                    {row.cancel_at_period_end && row.status !== "canceled" && <ToneBadge tone="warning">Cancela no fim</ToneBadge>}
                    {row.courtesy_until && new Date(row.courtesy_until) > new Date() && <ToneBadge tone="brand">Cortesia</ToneBadge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(row.trial_ends_at)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(row.current_period_end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/admin/assinaturas"
        params={{ q: filters.q, plano: filters.plan, visao: view === "todas" ? undefined : view }}
        page={filters.page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </>
  )
}
