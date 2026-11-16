"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, Check, Copy, ExternalLink, LayoutDashboard, ListChecks, Sparkles } from "lucide-react"

import { setSetupMode } from "@/app/actions/onboarding"
import { FormAlert } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"

export function SetupWelcome({ userName, hasBusiness, nextStep }: { userName: string; hasBusiness: boolean; nextStep: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const choose = (mode: "guided" | "manual") => {
    if (!hasBusiness) {
      router.push(`/onboarding?etapa=1&modo=${mode === "manual" ? "manual" : "guiado"}`)
      return
    }
    setError(null)
    start(async () => {
      const result = await setSetupMode(mode)
      if (!result.ok) return setError(result.error)
      router.push(mode === "guided" ? `/onboarding?etapa=${nextStep}` : "/painel")
    })
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Olá, {userName.split(" ")[0]}!</p>
        <h1 className="font-heading text-2xl font-semibold text-balance sm:text-3xl">Vamos preparar seu negócio para receber agendamentos?</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          São 6 etapas curtas. Você pode trocar de formato a qualquer momento, e o que já estiver preenchido nunca precisa ser repetido.
        </p>
      </header>
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("guided")}
          className="flex flex-col gap-2 rounded-xl border border-primary bg-primary/10 p-5 text-left transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          <Sparkles className="size-5 text-brand-light" aria-hidden />
          <span className="font-medium">Começar configuração guiada</span>
          <span className="text-sm leading-relaxed text-muted-foreground">Passo a passo, com explicações e exemplos em cada etapa.</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("manual")}
          className="flex flex-col gap-2 rounded-xl border p-5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          <ListChecks className="size-5 text-muted-foreground" aria-hidden />
          <span className="font-medium">Configurar manualmente pelo painel</span>
          <span className="text-sm leading-relaxed text-muted-foreground">
            {hasBusiness ? "Use o checklist no painel e preencha cada área quando quiser." : "Informe só os dados básicos agora e siga pelo checklist do painel."}
          </span>
        </button>
      </div>
    </section>
  )
}

export interface CompletionSummary {
  name: string
  slug: string
  openDays: number
  services: number
  professionals: number
  slotIntervalMin: number
  minAdvanceLabel: string
}

export function SetupComplete({ summary }: { summary: CompletionSummary }) {
  const [copied, setCopied] = useState(false)
  const path = `/agendar/${summary.slug}`
  const copy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const items = [
    ["Estabelecimento", summary.name],
    ["Dias de atendimento", `${summary.openDays} por semana`],
    ["Serviços ativos", String(summary.services)],
    ["Profissionais disponíveis", String(summary.professionals)],
    ["Horários a cada", `${summary.slotIntervalMin} minutos`],
    ["Antecedência mínima", summary.minAdvanceLabel],
  ]
  const nextSteps = [
    { href: "/painel/equipe", text: "Convide sua equipe para acessar a agenda de cada profissional." },
    { href: "/painel/servicos", text: "Cadastre os demais serviços e revise as descrições." },
    { href: "/painel/agenda", text: "Bloqueie feriados e férias na Agenda." },
    { href: "/painel/configuracoes", text: "Ative as mensagens automáticas de confirmação e lembrete." },
  ]

  return (
    <section className="flex flex-col gap-6 rounded-2xl border bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <header className="flex flex-col gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-5" aria-hidden />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-balance sm:text-3xl">Seu negócio está pronto para receber agendamentos!</h1>
      </header>

      <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 sm:flex-col sm:justify-start sm:gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Seu link de agendamento</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex h-9 flex-1 items-center truncate rounded-md border bg-muted px-3 font-mono text-sm">{path}</code>
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
          <Button variant="outline" render={<a href={path} target="_blank" rel="noreferrer" />} nativeButton={false}>
            <ExternalLink aria-hidden /> Abrir
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" render={<Link href="/painel/agenda" />} nativeButton={false}>
          <CalendarDays aria-hidden /> Ir para a agenda
        </Button>
        <Button size="lg" variant="ghost" render={<Link href="/painel" />} nativeButton={false}>
          <LayoutDashboard aria-hidden /> Ir para o painel
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-5">
        <p className="text-sm font-medium">Próximas recomendações</p>
        <ul className="flex flex-col gap-2 text-sm">
          {nextSteps.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="leading-relaxed text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {n.text}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
