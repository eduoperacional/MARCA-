import type { Metadata } from "next"
import { Suspense } from "react"

import { Benefits } from "@/components/landing/benefits"
import { FinalCta, LandingFooter } from "@/components/landing/final-cta"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { LandingHeader } from "@/components/landing/landing-header"
import { PricingHeading, PricingPlans, PricingSkeleton } from "@/components/landing/pricing"
import { ProductDemo } from "@/components/landing/product-demo"

export const metadata: Metadata = {
  title: "MARCAÍ — Seu tempo, bem marcado.",
  description:
    "Plataforma de agendamento online para beleza, saúde, estética, consultórios, autônomos e serviços. Agenda, equipe e clientes em um só lugar.",
}

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-[#0B0B12]">
      <LandingHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <Benefits />
        <ProductDemo />
        <HowItWorks />
        <section id="planos" className="mx-auto flex w-full max-w-6xl scroll-mt-20 flex-col items-center gap-12 px-4 py-20 md:py-28" aria-labelledby="planos-title">
          <PricingHeading />
          <Suspense fallback={<PricingSkeleton />}>
            <PricingPlans />
          </Suspense>
        </section>
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
