import type { Metadata } from "next"

import { DiagnosticBlock } from "@/components/admin/diagnostic-block"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/period-tabs"
import { requireAdmin } from "@/lib/admin/auth"
import { getPromoDiagnostics } from "@/lib/admin/promo-diagnostics"

export const metadata: Metadata = { title: "Diagnóstico da promoção" }

const DEFAULT_TERM = "studio bella"

export default async function PromoDiagnosticsPage({ searchParams }: PageProps<"/admin/promocao">) {
  await requireAdmin("subscriptions.view")
  const params = await searchParams
  const raw = typeof params.q === "string" ? params.q.trim() : ""
  const term = raw || DEFAULT_TERM

  const blocks = await getPromoDiagnostics(term)

  return (
    <>
      <PageHeader
        title="Diagnóstico da promoção de lançamento"
        description={`Consultas somente leitura sobre reserva, valor enviado ao Asaas, cobranças e elegibilidade. Estabelecimento pesquisado: "${term}".`}
      />

      <FilterBar action="/admin/promocao" search={{ value: raw || undefined, placeholder: "Nome ou link (padrão: Studio Bella)" }} />

      <div className="flex flex-col gap-4">
        {blocks.map((block, index) => (
          <DiagnosticBlock key={block.key} block={block} index={index} />
        ))}
      </div>
    </>
  )
}
