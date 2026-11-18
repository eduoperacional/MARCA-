import Link from "next/link"

import { MarcaiWordmark } from "@/components/brand/marcai-logo"
import { LEGAL_UPDATED_AT, PRIVACY_CONTACT_EMAIL } from "@/lib/legal"

export function LegalPage({
  title,
  version,
  intro,
  children,
}: {
  title: string
  version: string
  intro: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" aria-label="Página inicial da MARCAÍ">
            <MarcaiWordmark className="h-6 w-auto" />
          </Link>
          <nav aria-label="Documentos" className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold text-balance">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: {LEGAL_UPDATED_AT} · Versão {version}
          </p>
          <div className="leading-relaxed text-muted-foreground">{intro}</div>
        </div>
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <span>MARCAÍ</span>
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="hover:text-foreground">{PRIVACY_CONTACT_EMAIL}</a>
        </div>
      </footer>
    </div>
  )
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-heading text-xl font-semibold text-balance">{title}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}

export function PendingLegalData({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</span>
}

export function PrivacyEmailLink() {
  return (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-medium text-brand-light underline-offset-4 hover:underline">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  )
}
