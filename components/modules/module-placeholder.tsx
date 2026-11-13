import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getNavItem } from "@/config/navigation"

export function ModulePlaceholder({ href }: { href: string }) {
  const item = getNavItem(href)
  if (!item) return null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title={item.title} description={item.description} />
      <Empty className="min-h-[420px] border border-dashed bg-card/40">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-primary/15 text-brand-light">
            <item.icon />
          </EmptyMedia>
          <Badge variant="outline" className="mx-auto">
            Em construção
          </Badge>
          <EmptyTitle className="font-heading">
            O módulo {item.title} está a caminho
          </EmptyTitle>
          <EmptyDescription>
            Estamos preparando esta área com tudo o que você precisa para
            gerenciar seu negócio.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {item.features && (
            <ul className="flex flex-col gap-2 text-left text-sm text-muted-foreground">
              {item.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="size-4 text-brand-light" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" render={<Link href="/painel" />} nativeButton={false}>
            <ArrowLeft data-icon="inline-start" />
            Voltar para a visão geral
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
