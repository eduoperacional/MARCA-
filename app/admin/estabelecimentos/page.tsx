import type { Metadata } from "next"
import Link from "next/link"

import { FilterBar } from "@/components/admin/filter-bar"
import { Pagination } from "@/components/admin/pagination"
import { PageHeader } from "@/components/admin/period-tabs"
import { ToneBadge } from "@/components/admin/tone-badge"
import { requireAdmin } from "@/lib/admin/auth"
import { businessBillingStatus, PARTNER_BENEFIT_STATUS, SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUSES, type Tone } from "@/lib/admin/labels"
import { listBusinesses, listPlanOptions, PAGE_SIZE, PARTNER_STATUS_FILTER } from "@/lib/admin/queries"
import { formatDate, formatDateTime } from "@/lib/format"

export const metadata: Metadata = { title: "Estabelecimentos" }

function BillingStatusBadge({ status }: { status: { label: string; tone: Tone } }) {
  return <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
}

const str = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

export default async function BusinessesPage({ searchParams }: PageProps<"/admin/estabelecimentos">) {
  await requireAdmin("businesses.view")
  const params = await searchParams
  const filters = {
    q: str(params.q),
    status: str(params.status),
    plan: str(params.plano),
    page: Math.max(1, Number(str(params.pagina)) || 1),
  }
  const [{ rows, total }, planOptions] = await Promise.all([listBusinesses(filters), listPlanOptions()])

  return (
    <>
      <PageHeader title="Estabelecimentos" description="Todos os negócios cadastrados, com plano, status e último acesso." />
      <FilterBar
        action="/admin/estabelecimentos"
        search={{ value: filters.q, placeholder: "Nome, link ou e-mail do dono" }}
        selects={[
          {
            name: "status",
            label: "Status",
            value: filters.status,
            options: [
              { value: "", label: "Todos" },
              ...SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: SUBSCRIPTION_STATUS[s].label })),
              { value: PARTNER_STATUS_FILTER, label: PARTNER_BENEFIT_STATUS.label },
              { value: "none", label: "Sem assinatura" },
              { value: "suspended", label: "Acesso bloqueado" },
            ],
          },
          {
            name: "plano",
            label: "Plano",
            value: filters.plan,
            options: [{ value: "", label: "Todos" }, ...planOptions.map((p) => ({ value: p.code, label: p.name }))],
          },
        ]}
      />

      <div className="overflow-x-auto rounded-xl border bg-card/60">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Estabelecimento</th>
              <th className="px-4 py-3 font-medium">Responsável</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Cadastro</th>
              <th className="px-4 py-3 font-medium">Último acesso</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum estabelecimento encontrado com esses filtros.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/admin/estabelecimentos/${row.id}`} className="font-medium text-foreground hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">/{row.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{row.owner_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{row.owner_email ?? row.phone ?? ""}</p>
                </td>
                <td className="px-4 py-3">{row.plan_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <BillingStatusBadge
                      status={businessBillingStatus({
                        partnerBenefitActive: row.partner_benefit_active,
                        subscriptionStatus: row.subscription_status,
                      })}
                    />
                    {row.suspended && <ToneBadge tone="danger">Bloqueado</ToneBadge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row.last_access)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/admin/estabelecimentos"
        params={{ q: filters.q, status: filters.status, plano: filters.plan }}
        page={filters.page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </>
  )
}
