import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { HeroVisual } from "@/components/landing/hero-visual"
import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      <div className="landing-grid absolute inset-0 -z-10" aria-hidden />
      <div
        className="animate-glow absolute left-1/2 top-[-12rem] -z-10 size-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(123_63_242/0.35),transparent_65%)] blur-3xl"
        aria-hidden
      />
      <div
        className="absolute right-[-10rem] top-1/3 -z-10 size-[36rem] rounded-full bg-[radial-gradient(circle,rgb(184_139_255/0.18),transparent_65%)] blur-3xl"
        aria-hidden
      />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-20 pt-14 md:pb-28 md:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-6">
        <div className="flex flex-col items-start gap-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-brand-light">
            <span className="size-1.5 rounded-full bg-brand-light" aria-hidden />
            Seu tempo, bem marcado.
          </span>

          <h1
            id="hero-title"
            className="font-heading text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl"
          >
            Seu negócio no <span className="text-brand-shine">ritmo certo.</span>
          </h1>

          <p className="max-w-md text-lg leading-relaxed text-muted-foreground text-pretty">
            Organize seus agendamentos, conquiste clientes e tenha mais tempo para crescer.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              size="lg"
              render={<Link href="/cadastro" />}
              nativeButton={false}
              className="group h-12 px-6 text-base shadow-[0_10px_40px_-10px_rgb(123_63_242/0.8)]"
            >
              Começar grátis
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<a href="#demonstracao" />}
              nativeButton={false}
              className="h-12 border-white/10 bg-white/5 px-6 text-base hover:bg-white/10"
            >
              Conhecer o MARCAÍ
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">7 dias grátis. Sem cartão de crédito.</p>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}
