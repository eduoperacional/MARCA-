import Link from "next/link"

import type { BillingAccess } from "@/lib/billing/access"
import { cn } from "@/lib/utils"

const URGENT = new Set(["past_due_grace", "trial_grace", "awaiting_payment", "blocked_no_plan", "blocked_unpaid"])

export function BillingBanner({
  billing,
  isOwner,
  enforced,
}: {
  billing: BillingAccess
  isOwner: boolean
  enforced: boolean
}) {
  if (!billing.notice) return null
  const urgent = URGENT.has(billing.state)
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm md:px-6 lg:px-8",
        urgent ? "border-warning/40 bg-warning/10" : "bg-primary/10"
      )}
    >
      <p className="leading-relaxed text-foreground">
        {billing.notice}
        {!billing.allowed && !enforced && " (bloqueio ainda desativado)"}
      </p>
      {isOwner && (
        <Link href="/assinatura" className="font-medium text-brand-light underline-offset-4 hover:underline">
          {billing.state === "trial" ? "Ver planos" : "Ver assinatura"}
        </Link>
      )}
    </div>
  )
}
