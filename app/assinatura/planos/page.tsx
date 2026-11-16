import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { CheckoutForm, type PlanOption } from "@/components/billing/checkout-form"
import { PLAN_FEATURES, PLAN_LIMITS } from "@/lib/admin/labels"
import { TRIAL_DAYS, businessTrialEnd } from "@/lib/billing/access"
import { enabledBillingTypes, isAsaasConfigured } from "@/lib/billing/asaas"
import { listPublicPlans } from "@/lib/billing/self-service"
import { getCurrentSubscription, hasHadSubscription } from "@/lib/billing/subscriptions"
import { requireAccess } from "@/lib/business"
import { db } from "@/lib/db"
import { formatDate } from "@/lib/format"

export const metadata: Metadata = { title: "Planos" }

export default async function PlansPage() {
  const access = await requireAccess()
  if (access.role !== "owner") redirect("/assinatura")

  const [rows, sub, hadSub] = await Promise.all([
    listPublicPlans(db),
    getCurrentSubscription(db, access.business.id),
    hasHadSubscription(db, access.business.id),
  ])

  const plans: PlanOption[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    interval: p.billingInterval,
    family: p.family ?? p.code,
    recommended: p.isRecommended,
    features: p.features.map((f) => PLAN_FEATURES[f] ?? f),
    limits: Object.entries(p.limits).map(([key, value]) => {
      const label = PLAN_LIMITS[key as keyof typeof PLAN_LIMITS] ?? key
      return value && value > 0 ? `${label}: até ${value}` : `${label}: ilimitado`
    }),
  }))

  const mode = sub?.gatewaySubscriptionId ? "change" : "checkout"
  const trialEnd = businessTrialEnd(access.business)
  const trialNote =
    !hadSub && trialEnd > new Date()
      ? `Você tem ${TRIAL_DAYS} dias grátis no plano escolhido. A primeira cobrança é gerada automaticamente em ${formatDate(trialEnd)}; nada é cobrado antes disso.`
      : null

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
          {mode === "change" ? "Mudar de plano" : "Escolha seu plano"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pagamento processado pelo Asaas via Pix, boleto ou cartão. Cancele quando quiser.
        </p>
      </div>
      {!isAsaasConfigured() ? (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde ou fale com o suporte.
        </p>
      ) : plans.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum plano disponível no momento.
        </p>
      ) : (
        <CheckoutForm
          plans={plans}
          methods={enabledBillingTypes()}
          currentPlanId={sub?.planId ?? null}
          mode={mode}
          trialNote={trialNote}
        />
      )}
    </>
  )
}
