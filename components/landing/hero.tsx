import Image from "next/image"
import Link from "next/link"
import { ArrowRight, BellRing, CalendarCheck, Clock3 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      <div className="landing-grid absolute inset-0 -z-10" aria-hidden />
      <div
        className="animate-glow absolute left-1/2 top-[-12rem] -z-10 size-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(123_63_242/0.35),transparent_65%)] blur-3xl"
        aria-hidden
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 md:pb-28 md:pt-24 lg:grid-cols-[1.05fr_1fr]">
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

        <div className="relative mx-auto w-full max-w-xl">
          <div className="relative aspect-[4/3] w-full">
            <Image
              src="/images/landing-hero-3d.png"
              alt="Calendário 3D em vidro roxo com horários iluminados, envolto por um anel de relógio"
              fill
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="animate-float object-contain [mask-image:radial-gradient(ellipse_at_center,#000_55%,transparent_78%)]"
            />
          </div>

          <div className="animate-float-slow absolute left-0 top-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#14141f]/80 p-3 pr-4 shadow-2xl backdrop-blur-xl sm:-left-6">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/20 text-brand-light">
              <CalendarCheck className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Agendamento confirmado</span>
              <span className="text-xs text-muted-foreground">Hoje · 15:30</span>
            </div>
          </div>

          <div className="animate-float absolute bottom-10 right-0 flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#14141f]/80 p-4 shadow-2xl backdrop-blur-xl sm:-right-4">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden />
              Horários de hoje
            </span>
            <div className="flex gap-1.5" aria-hidden>
              {["09:00", "10:30", "14:00"].map((slot, i) => (
                <span
                  key={slot}
                  className={
                    i === 1
                      ? "rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-lg border border-white/10 px-2.5 py-1 text-xs text-foreground/80"
                  }
                >
                  {slot}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-float-slow absolute -bottom-2 left-6 hidden items-center gap-2 rounded-full border border-white/10 bg-[#14141f]/80 px-3 py-2 text-xs shadow-xl backdrop-blur-xl sm:flex">
            <BellRing className="size-3.5 text-brand-light" aria-hidden />
            Lembrete enviado ao cliente
          </div>
        </div>
      </div>
    </section>
  )
}
