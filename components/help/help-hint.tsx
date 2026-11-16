"use client"

import Link from "next/link"
import { CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HELP_TOPICS, type HelpTopicKey } from "@/lib/help-topics"

/** Botão "Como preencher?" com a orientação do tema, disponível em qualquer tela do painel. */
export function HelpHint({ topic, label = "Como preencher?" }: { topic: HelpTopicKey; label?: string }) {
  const t = HELP_TOPICS[topic]
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" />}>
        <CircleHelp className="size-4" aria-hidden />
        {label}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 text-sm">
        <p className="font-medium">{t.title}</p>
        <p className="leading-relaxed text-muted-foreground">{t.intro}</p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 leading-relaxed">
          {t.howTo.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ol>
        {t.example && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Exemplo: </span>
            {t.example}
          </p>
        )}
        <Link href={`/painel/ajuda#${t.key}`} className="text-xs font-medium text-brand-light underline-offset-4 hover:underline">
          Ver na Central de Ajuda
        </Link>
      </PopoverContent>
    </Popover>
  )
}
