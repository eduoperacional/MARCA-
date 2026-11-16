"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Circle, X } from "lucide-react"

import { setChecklistDismissed, setSetupMode } from "@/app/actions/onboarding"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { SetupProgress } from "@/lib/setup-progress"
import { cn } from "@/lib/utils"

interface Props {
  progress: SetupProgress
  mode: "guided" | "manual"
  dismissed: boolean
}

/** Checklist de ativação no painel: mesmo progresso do assistente, nos dois sentidos. */
export function SetupChecklist({ progress, mode, dismissed }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn()
      router.refresh()
    })

  if (dismissed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Configuração {progress.percent}% concluída{progress.nextStep ? ` · Próximo: ${progress.nextStep.title}` : ""}
        </span>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setChecklistDismissed(false))}>
          Mostrar checklist
        </Button>
      </div>
    )
  }

  const next = progress.nextStep
  return (
    <section aria-labelledby="setup-checklist-title" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="setup-checklist-title" className="font-heading text-lg font-semibold">
            {progress.ready ? "Seu negócio já recebe agendamentos" : "Prepare seu negócio para receber agendamentos"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {progress.doneCount} de {progress.total} etapas concluídas
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Ocultar checklist" disabled={pending} onClick={() => run(() => setChecklistDismissed(true))}>
          <X aria-hidden />
        </Button>
      </header>
      <Progress value={progress.percent} aria-label="Progresso da configuração" />

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {progress.steps.map((s) => (
          <li key={s.key}>
            <Link
              href={mode === "guided" ? `/onboarding?etapa=${s.step}` : s.panelHref}
              className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60", s.done && "opacity-70")}
            >
              {s.done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-brand-light" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {s.title}
                  {!s.essential && <span className="font-normal text-muted-foreground"> (opcional)</span>}
                  <span className="sr-only">{s.done ? " — concluída" : " — pendente"}</span>
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{s.pending ?? "Concluída"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {next ? (
          <Button render={<Link href={mode === "guided" ? `/onboarding?etapa=${next.step}` : next.panelHref} />} nativeButton={false}>
            {mode === "guided" ? "Continuar configuração guiada" : `Ir para ${next.short}`}
          </Button>
        ) : (
          <Button render={<Link href="/onboarding?etapa=concluido" />} nativeButton={false}>
            Ver resumo e link de agendamento
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setSetupMode(mode === "guided" ? "manual" : "guided"))}
        >
          {mode === "guided" ? "Prefiro configurar pelo painel" : "Prefiro o passo a passo guiado"}
        </Button>
      </div>
    </section>
  )
}
