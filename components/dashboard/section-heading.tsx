import type { ReactNode } from "react"

export function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-4 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="font-heading text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
