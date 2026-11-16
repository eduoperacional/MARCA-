"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

import { FormAlert } from "@/components/auth/auth-shell"
import { Progress } from "@/components/ui/progress"
import { BusinessStep, HoursStep } from "@/components/onboarding/steps/business-hours-steps"
import { ProfessionalsStep, ServicesStep } from "@/components/onboarding/steps/catalog-steps"
import { PageStep, RulesStep } from "@/components/onboarding/steps/rules-page-steps"
import type { WizardBusiness, WizardProfessional, WizardService } from "@/components/onboarding/types"
import type { Saver } from "@/components/onboarding/wizard-ui"
import type { SetupStepStatus } from "@/lib/setup-progress"
import { SETUP_STEPS } from "@/lib/setup-progress"
import { cn } from "@/lib/utils"

interface Props {
  step: number
  steps: SetupStepStatus[] | null
  percent: number
  business: WizardBusiness | null
  services: WizardService[]
  professionals: WizardProfessional[]
  selfProfessionalId: string | null
  createNew: boolean
  mode: "guided" | "manual"
}

export function SetupWizard({ step, steps, percent, business, services, professionals, selfProfessionalId, createNew, mode }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isNew = !business || createNew
  const current = SETUP_STEPS[step - 1]
  const go = (n: number | "concluido") => {
    router.push(`/onboarding?etapa=${n}`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const back = () => go(step - 1)
  const advance = () => go(step < SETUP_STEPS.length ? step + 1 : "concluido")

  const submit = (save: Saver) => {
    setError(null)
    startTransition(async () => {
      const result = await save()
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (isNew && mode === "manual") router.push("/painel")
      else if (result.ready && step === SETUP_STEPS.length) go("concluido")
      else advance()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Configuração do estabelecimento</span>
          <span className="tabular-nums text-muted-foreground">{percent}% concluído</span>
        </div>
        <Progress value={percent} aria-label="Progresso da configuração" />
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Etapas da configuração">
          {SETUP_STEPS.map((s, i) => {
            const n = i + 1
            const done = steps?.[i]?.done ?? false
            const reachable = !isNew || n === 1
            const content = (
              <>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border text-xs",
                    done ? "border-primary bg-primary text-primary-foreground" : n === step ? "border-primary" : "border-border"
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : n}
                </span>
                <span className="text-xs leading-tight">{s.short}</span>
              </>
            )
            const cls = cn(
              "flex flex-col items-center gap-1.5 rounded-lg p-2 text-center",
              n === step ? "bg-muted text-foreground" : "text-muted-foreground"
            )
            return (
              <li key={s.key}>
                {reachable && n !== step ? (
                  <Link href={`/onboarding?etapa=${n}`} className={cn(cls, "hover:bg-muted/60")} aria-label={`Etapa ${n}: ${s.title}${done ? " (concluída)" : ""}`}>
                    {content}
                  </Link>
                ) : (
                  <span className={cls} aria-current={n === step ? "step" : undefined}>
                    {content}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <section className="flex flex-col gap-6 rounded-2xl border bg-card/80 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
        <header className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-brand-light uppercase">
            Etapa {step} de {SETUP_STEPS.length}
          </p>
          <h1 className="font-heading text-2xl font-semibold text-balance">{current.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {current.description} O progresso é salvo a cada etapa; você pode sair e continuar depois.
          </p>
        </header>
        <FormAlert message={error} />
        {step === 1 && <BusinessStep business={createNew ? null : business} pending={pending} onSubmit={submit} createNew={isNew} mode={mode} />}
        {business && !createNew && (
          <>
            {step === 2 && <HoursStep business={business} pending={pending} onSubmit={submit} onBack={back} />}
            {step === 3 && <ServicesStep services={services} professionalIds={professionals.filter((p) => p.active).map((p) => p.id)} pending={pending} onBack={back} onContinue={advance} />}
            {step === 4 && (
              <ProfessionalsStep
                professionals={professionals}
                services={services}
                openingHours={business.openingHours}
                selfProfessionalId={selfProfessionalId}
                pending={pending}
                onBack={back}
                onContinue={advance}
              />
            )}
            {step === 5 && <RulesStep business={business} pending={pending} onSubmit={submit} onBack={back} />}
            {step === 6 && <PageStep business={business} pending={pending} onSubmit={submit} onBack={back} />}
          </>
        )}
      </section>

      {!isNew && (
        <Link href="/painel" className="self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Sair e continuar depois pelo painel
        </Link>
      )}
    </div>
  )
}
