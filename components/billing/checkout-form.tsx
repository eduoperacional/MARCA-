"use client"

import { useMemo, useState } from "react"
import { Check } from "lucide-react"

import { changePlanAction, checkoutAction } from "@/app/actions/billing"
import { BillingForm } from "@/components/billing/billing-form"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"

export type PlanOption = {
  id: string
  name: string
  description: string | null
  priceCents: number
  interval: "month" | "year"
  family: string
  recommended: boolean
  features: string[]
  limits: string[]
}

const METHOD_LABEL: Record<string, { label: string; hint: string }> = {
  PIX: { label: "Pix", hint: "Confirmação em segundos" },
  BOLETO: { label: "Boleto", hint: "Compensa em até 3 dias úteis" },
  CREDIT_CARD: { label: "Cartão de crédito", hint: "Renovação automática" },
}

const fieldClass =
  "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

export function CheckoutForm({
  plans,
  methods,
  currentPlanId,
  mode,
  trialNote,
}: {
  plans: PlanOption[]
  methods: string[]
  currentPlanId: string | null
  mode: "checkout" | "change"
  trialNote: string | null
}) {
  const hasYearly = plans.some((p) => p.interval === "year")
  const current = plans.find((p) => p.id === currentPlanId)
  const [interval, setInterval] = useState<"month" | "year">(current?.interval ?? "month")
  const visible = useMemo(() => plans.filter((p) => p.interval === interval), [plans, interval])
  const initial = visible.find((p) => p.recommended && p.id !== currentPlanId) ?? visible.find((p) => p.id !== currentPlanId)
  const [selected, setSelected] = useState<string | null>(initial?.id ?? null)
  const selectedPlan = visible.find((p) => p.id === selected) ?? null

  const monthlyOf = (family: string) => plans.find((p) => p.family === family && p.interval === "month")

  return (
    <div className="flex flex-col gap-8">
      {hasYearly && (
        <div role="radiogroup" aria-label="Periodicidade" className="flex w-fit gap-1 rounded-full border bg-card p-1">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => {
                setInterval(value)
                const next = plans.filter((p) => p.interval === value)
                setSelected((next.find((p) => p.recommended) ?? next[0])?.id ?? null)
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                interval === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "month" ? "Mensal" : "Anual · 2 meses grátis"}
            </button>
          ))}
        </div>
      )}

      <div role="radiogroup" aria-label="Plano" className="grid gap-4 md:grid-cols-3">
        {visible.map((plan) => {
          const isCurrent = plan.id === currentPlanId
          const isSelected = plan.id === selected
          const monthly = plan.interval === "year" ? monthlyOf(plan.family) : null
          const saving = monthly ? monthly.priceCents * 12 - plan.priceCents : 0
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isCurrent}
              onClick={() => setSelected(plan.id)}
              className={cn(
                "relative flex flex-col gap-4 rounded-xl border bg-card p-5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                isSelected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
                isCurrent && "cursor-not-allowed opacity-70"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-foreground">{plan.name}</span>
                  {plan.description && (
                    <span className="text-sm leading-relaxed text-muted-foreground text-pretty">{plan.description}</span>
                  )}
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Atual</span>
                ) : plan.recommended ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-brand-light">
                    Recomendado
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {formatCents(plan.priceCents)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {plan.interval === "year" ? " /ano" : " /mês"}
                  </span>
                </span>
                {saving > 0 && <span className="text-xs text-success">Economia de {formatCents(saving)} por ano</span>}
              </div>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {[...plan.limits, ...plan.features].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      {selectedPlan && mode === "checkout" && (
        <BillingForm
          action={checkoutAction}
          hidden={{ planId: selectedPlan.id }}
          submitLabel={`Contratar ${selectedPlan.name}`}
          pendingLabel="Gerando cobrança..."
          className="max-w-xl rounded-xl border bg-card p-5"
        >
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-foreground">Pagamento</h2>
            {trialNote && <p className="text-sm leading-relaxed text-muted-foreground">{trialNote}</p>}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs text-muted-foreground">Forma de pagamento</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {methods.map((method, index) => (
                <label
                  key={method}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input type="radio" name="billingType" value={method} defaultChecked={index === 0} className="accent-primary" />
                    {METHOD_LABEL[method]?.label ?? method}
                  </span>
                  <span className="text-xs text-muted-foreground">{METHOD_LABEL[method]?.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">CPF ou CNPJ do responsável pela cobrança</span>
            <input name="cpfCnpj" required inputMode="numeric" autoComplete="off" maxLength={18} className={fieldClass} />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            O plano é liberado somente após a confirmação do pagamento pelo Asaas. Você pode cancelar quando quiser.
          </p>
        </BillingForm>
      )}

      {selectedPlan && mode === "change" && (
        <BillingForm
          action={changePlanAction}
          hidden={{ planId: selectedPlan.id }}
          submitLabel={`Mudar para ${selectedPlan.name}`}
          confirm={`Mudar o plano para ${selectedPlan.name} (${formatCents(selectedPlan.priceCents)})? As próximas cobranças usarão o novo valor.`}
          className="max-w-xl rounded-xl border bg-card p-5"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            A mudança vale imediatamente para os limites do plano. Cobranças já emitidas não mudam; a próxima cobrança
            usa o novo valor, sem cálculo proporcional.
          </p>
        </BillingForm>
      )}
    </div>
  )
}
