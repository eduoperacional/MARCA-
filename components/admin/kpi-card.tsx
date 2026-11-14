import { cn } from "@/lib/utils"

export function KpiCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card/70 p-4",
        emphasis && "border-primary/40 bg-primary/10"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{hint}</p>}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border bg-card/70 p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground text-pretty">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
