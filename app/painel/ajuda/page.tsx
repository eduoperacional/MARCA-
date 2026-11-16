import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, ChevronDown, Clock, Globe, Lightbulb, type LucideIcon, Scissors, Store, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { HELP_TOPIC_LIST, type HelpTopicKey } from "@/lib/help-topics"

export const metadata: Metadata = { title: "Ajuda e suporte" }

const ICONS: Record<HelpTopicKey, LucideIcon> = {
  business: Store,
  hours: Clock,
  services: Scissors,
  professionals: Users,
  rules: CalendarClock,
  page: Globe,
}

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Central de Ajuda</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">Toque em um tema para ver como configurar.</p>
      </header>

      <ul className="flex flex-col gap-2">
        {HELP_TOPIC_LIST.map((t) => {
          const Icon = ICONS[t.key as HelpTopicKey]
          return (
            <li key={t.key} id={t.key} className="scroll-mt-24">
              <details className="group rounded-xl border bg-card open:border-primary/40">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-brand-light">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{t.title}</span>
                    <span className="truncate text-sm text-muted-foreground group-open:whitespace-normal">{t.intro}</span>
                  </span>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>

                <div className="flex flex-col gap-4 border-t px-4 pt-4 pb-4">
                  <ol className="flex flex-col gap-2.5">
                    {t.howTo.map((step, i) => (
                      <li key={step} className="flex items-start gap-3 text-sm leading-relaxed">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>

                  {t.example && (
                    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-light" aria-hidden />
                      <span>
                        <span className="font-medium text-foreground">Exemplo: </span>
                        {t.example}
                      </span>
                    </p>
                  )}

                  <Button className="w-full sm:w-auto sm:self-start" render={<Link href={t.panelHref} />} nativeButton={false}>
                    Configurar agora
                  </Button>
                </div>
              </details>
            </li>
          )
        })}
      </ul>

      <p className="text-center text-sm text-muted-foreground">
        Prefere ir passo a passo?{" "}
        <Link href="/onboarding" className="font-medium text-brand-light underline-offset-4 hover:underline">
          Abrir configuração guiada
        </Link>
      </p>
    </div>
  )
}
