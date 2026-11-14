import Link from "next/link"

import { ADMIN_PERIODS, type AdminPeriod } from "@/lib/admin/metrics"
import { cn } from "@/lib/utils"

export function PeriodTabs({ basePath, current }: { basePath: string; current: AdminPeriod }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap items-center gap-1 rounded-lg border bg-card/60 p-1">
      {ADMIN_PERIODS.map((period) => (
        <Link
          key={period.value}
          href={`${basePath}?periodo=${period.value}`}
          aria-current={current === period.value ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
            current === period.value && "bg-primary/20 text-foreground"
          )}
        >
          {period.label}
        </Link>
      ))}
    </nav>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
