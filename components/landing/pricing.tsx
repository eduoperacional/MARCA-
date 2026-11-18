import Link from "next/link"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PLAN_FEATURES } from "@/lib/admin/labels"
import { TRIAL_DAYS } from "@/lib/billing/access"
import { listPublicPlans } from "@/lib/billing/self-service"
import { db } from "@/lib/db"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

type PublicPlan = Awaited<ReturnType<typeof listPublicPlans>>[number]

async function loadMonthlyPlans(): Promise<PublicPlan[]> {
  try {
    const plans = await listPublicPlans(db)
    return plans.filter((plan) => plan.billingInterval === "month")
  } catch (error) {
    console.error("[landing] Falha ao carregar planos públicos", error)
    return []
  }
}

export function PricingHeading() {
  return (
    <div className="flex max-w-2xl flex-col items-center gap-4 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-light">Planos</p>
      <h2 id="planos-title" className="font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl">
        Comece grátis. Cresça no seu ritmo.
      </h2>
      <p className="text-muted-foreground">{TRIAL_DAYS} dias para testar tudo, sem cartão.</p>
    </div>
  )
}

export function PricingSkeleton() {
  return (
    <div className="grid w-full gap-4 md:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-96 animate-pulse rounded-3xl border border-white/8 bg-white/[0.03]" />
      ))}
    </div>
  )
}

export async function PricingPlans() {
  const plans = await loadMonthlyPlans()

  if (plans.length === 0) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
        <p className="font-heading text-2xl font-semibold">Teste grátis por {TRIAL_DAYS} dias</p>
        <p className="text-muted-foreground">Escolha o plano ideal depois de conhecer o sistema.</p>
        <Button size="lg" render={<Link href="/cadastro" />} nativeButton={false}>
          Começar grátis
        </Button>
      </div>
    )
  }

  return (
    <ul className={cn("grid w-full gap-4", plans.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2 md:max-w-3xl")}>
      {plans.map((plan) => {
        const highlight = plan.isRecommended
        return (
          <li
            key={plan.id}
            className={cn(
              "relative flex flex-col gap-8 rounded-3xl border p-8 transition-transform duration-300 hover:-translate-y-1",
              highlight
                ? "border-primary/60 bg-gradient-to-b from-primary/20 via-[#14141f] to-[#14141f] shadow-[0_30px_80px_-30px_rgb(123_63_242/0.7)]"
                : "border-white/8 bg-white/[0.03]"
            )}
          >
            {highlight && (
              <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Mais escolhido
              </span>
            )}
            <div className="flex flex-col gap-2">
              <h3 className="font-heading text-xl font-semibold">{plan.name}</h3>
              {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
            </div>
            <p className="flex items-baseline gap-1">
              <span className="font-heading text-4xl font-semibold tracking-tight">{formatCurrency(plan.priceCents / 100, true)}</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </p>
            {plan.features.length > 0 && (
              <ul className="flex flex-col gap-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-light" aria-hidden />
                    <span>{PLAN_FEATURES[feature] ?? feature}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              size="lg"
              variant={highlight ? "default" : "outline"}
              render={<Link href="/cadastro" />}
              nativeButton={false}
              className={cn("mt-auto h-11", !highlight && "border-white/10 bg-white/5 hover:bg-white/10")}
            >
              Começar grátis
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
