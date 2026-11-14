import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"

export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string
  params: Record<string, string | undefined>
  page: number
  pageSize: number
  total: number
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const href = (target: number) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    search.set("pagina", String(target))
    return `${basePath}?${search.toString()}`
  }
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <p>
        {formatNumber(from)}–{formatNumber(to)} de {formatNumber(total)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          render={page <= 1 ? undefined : <Link href={href(page - 1)} />}
        >
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          render={page >= pages ? undefined : <Link href={href(page + 1)} />}
        >
          Próxima
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
