import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { HELP_TOPIC_LIST } from "@/lib/help-topics"

export const metadata: Metadata = { title: "Ajuda e suporte" }

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Central de Ajuda</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Orientações para configurar o MARCAÍ. Os mesmos textos aparecem no botão &quot;Como preencher?&quot; de cada tela.
        </p>
        <div>
          <Button variant="outline" size="sm" render={<Link href="/onboarding" />} nativeButton={false}>
            Abrir configuração guiada
          </Button>
        </div>
      </header>

      <nav aria-label="Temas" className="flex flex-wrap gap-2">
        {HELP_TOPIC_LIST.map((t) => (
          <a key={t.key} href={`#${t.key}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">
            {t.title}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {HELP_TOPIC_LIST.map((t) => (
          <section key={t.key} id={t.key} aria-labelledby={`${t.key}-title`} className="flex scroll-mt-24 flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 id={`${t.key}-title`} className="font-heading text-lg font-semibold">
              {t.title}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
              {t.howTo.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <p className="rounded-md bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Exemplo: </span>
              {t.example}
            </p>
            {t.panelHref && (
              <Link href={t.panelHref} className="self-start text-sm font-medium text-brand-light underline-offset-4 hover:underline">
                Ir para esta área do painel
              </Link>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
