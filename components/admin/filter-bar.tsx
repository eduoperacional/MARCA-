import Link from "next/link"
import { Download, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SelectFilter = {
  name: string
  label: string
  value?: string
  options: { value: string; label: string }[]
}

const fieldClass =
  "h-9 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

/** Filtros via GET: a URL é a fonte da verdade e a consulta acontece no servidor. */
export function FilterBar({
  action,
  search,
  selects = [],
  dateRange,
  exportHref,
}: {
  action: string
  search?: { value?: string; placeholder: string }
  selects?: SelectFilter[]
  dateRange?: { from?: string; to?: string; label: string }
  exportHref?: string
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card/60 p-3">
      {search && (
        <label className="flex min-w-56 flex-1 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Buscar</span>
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={search.value}
              placeholder={search.placeholder}
              maxLength={80}
              className={cn(fieldClass, "w-full pl-9")}
            />
          </span>
        </label>
      )}
      {selects.map((select) => (
        <label key={select.name} className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{select.label}</span>
          <select name={select.name} defaultValue={select.value ?? ""} className={cn(fieldClass, "min-w-40")}>
            <option value="">Todos</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {dateRange && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-xs text-muted-foreground">{dateRange.label}</legend>
          <span className="flex items-center gap-2">
            <input type="date" name="de" aria-label="Data inicial" defaultValue={dateRange.from} className={fieldClass} />
            <span className="text-xs text-muted-foreground">até</span>
            <input type="date" name="ate" aria-label="Data final" defaultValue={dateRange.to} className={fieldClass} />
          </span>
        </fieldset>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" className="h-9">
          Filtrar
        </Button>
        <Button variant="ghost" className="h-9" render={<Link href={action} />}>
          Limpar
        </Button>
        {exportHref && (
          <Button variant="outline" className="h-9" render={<a href={exportHref} />}>
            <Download aria-hidden />
            Exportar CSV
          </Button>
        )}
      </div>
    </form>
  )
}
