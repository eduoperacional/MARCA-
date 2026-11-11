"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { QUICK_ACTIONS, type QuickAction } from "@/config/quick-actions"
import { useShareBookingLink } from "@/hooks/use-share-booking-link"

const tileClass =
  "group flex items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"

function TileContent({ action }: { action: QuickAction }) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-brand-light transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <action.icon className="size-4.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{action.label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {action.description}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </>
  )
}

export function QuickActions() {
  const shareBookingLink = useShareBookingLink()

  return (
    <section aria-labelledby="quick-actions-title" className="flex flex-col gap-3">
      <h2 id="quick-actions-title" className="font-heading text-sm font-medium text-muted-foreground">
        Ações rápidas
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {QUICK_ACTIONS.map((action) =>
          action.href ? (
            <Link key={action.id} href={action.href} className={tileClass}>
              <TileContent action={action} />
            </Link>
          ) : (
            <button
              key={action.id}
              type="button"
              onClick={shareBookingLink}
              className={tileClass}
            >
              <TileContent action={action} />
            </button>
          )
        )}
      </div>
    </section>
  )
}
