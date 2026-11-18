import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { Button } from "@/components/ui/button"

export function FinalCta() {
  return (
    <section className="px-4 py-20 md:py-28" aria-labelledby="cta-title">
      <div className="relative isolate mx-auto flex max-w-6xl flex-col items-center gap-8 overflow-hidden rounded-[2rem] border border-primary/30 bg-brand-gradient px-6 py-16 text-center md:py-24">
        <div className="landing-grid absolute inset-0 -z-10 opacity-60" aria-hidden />
        <div className="absolute -bottom-40 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-white/20 blur-3xl" aria-hidden />
        <h2 id="cta-title" className="max-w-3xl font-heading text-4xl font-semibold tracking-tight text-balance text-white md:text-6xl">
          Seu tempo, bem marcado.
        </h2>
        <p className="max-w-md text-lg text-white/80">Comece hoje. Leva menos de um minuto.</p>
        <Button
          size="lg"
          render={<Link href="/cadastro" />}
          nativeButton={false}
          className="group h-12 bg-white px-7 text-base text-[#0B0B12] hover:bg-white/90"
        >
          Começar grátis
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Button>
      </div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <MarcaiMark className="size-7 rounded-lg" />
          <MarcaiWordmark className="text-sm" />
        </div>
        <nav className="flex flex-wrap gap-6" aria-label="Rodapé">
          <a href="#planos" className="hover:text-foreground">Planos</a>
          <Link href="/cadastro" className="hover:text-foreground">Criar conta</Link>
          <Link href="/entrar" className="hover:text-foreground">Área do estabelecimento</Link>
        </nav>
        <span>© MARCAÍ</span>
      </div>
    </footer>
  )
}
