import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import { CalendarCheck, Link2, Users, Wallet } from "lucide-react"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/business"

export const metadata: Metadata = {
  title: "MARCAÍ — Agendamento online para o seu negócio",
  description:
    "Agenda, página pública de agendamento, equipe e financeiro em um só lugar. Para barbearias, salões, clínicas e serviços com hora marcada.",
}

const FEATURES = [
  { icon: Link2, title: "Sua página de agendamento", text: "Um link próprio para clientes marcarem horário 24 horas por dia, sem troca de mensagens." },
  { icon: CalendarCheck, title: "Agenda sem conflitos", text: "Horários, pausas e antecedência mínima respeitados automaticamente para cada profissional." },
  { icon: Users, title: "Equipe com permissões", text: "Convide gerentes, recepcionistas e profissionais. Cada um vê apenas o que precisa." },
  { icon: Wallet, title: "Financeiro do dia a dia", text: "Pagamentos, despesas e relatórios para saber quanto o negócio realmente fatura." },
]

const STEPS = [
  { title: "Crie sua conta", text: "Cadastro rápido com e-mail e WhatsApp." },
  { title: "Configure o negócio", text: "Horários, serviços e profissionais em poucos minutos." },
  { title: "Compartilhe o link", text: "Coloque na bio do Instagram e no WhatsApp e receba agendamentos." },
]

async function HeaderActions() {
  const session = await getSession()
  if (session?.user) return <Button render={<Link href="/painel" />} nativeButton={false}>Abrir painel</Button>
  return (
    <>
      <Button variant="ghost" render={<Link href="/entrar" />} nativeButton={false}>Entrar</Button>
      <Button render={<Link href="/cadastro" />} nativeButton={false}>Começar grátis</Button>
    </>
  )
}

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3" aria-label="Principal">
          <Link href="/" className="flex items-center gap-2.5">
            <MarcaiMark />
            <MarcaiWordmark />
          </Link>
          <div className="flex items-center gap-2">
            <Suspense fallback={<Button variant="ghost" render={<Link href="/entrar" />} nativeButton={false}>Entrar</Button>}>
              <HeaderActions />
            </Suspense>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="bg-brand-glow">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
            <div className="flex flex-col gap-6">
              <p className="text-sm font-medium text-brand-light">Agendamento online para negócios com hora marcada</p>
              <h1 className="font-heading text-4xl font-semibold leading-tight text-balance md:text-5xl">
                Sua agenda cheia, sem perder tempo no WhatsApp.
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-muted-foreground text-pretty">
                Com a MARCAÍ seus clientes marcam sozinhos, sua equipe enxerga o dia organizado e você acompanha o faturamento em tempo real.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" render={<Link href="/cadastro" />} nativeButton={false}>
                  Criar minha conta
                </Button>
                <Button size="lg" variant="outline" render={<Link href="/entrar" />} nativeButton={false}>
                  Já tenho conta
                </Button>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border shadow-2xl">
              <Image
                src="/images/landing-hero.png"
                alt="Barbeiro conferindo a agenda de atendimentos no celular"
                width={1024}
                height={768}
                priority
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl border bg-card/90 p-4 backdrop-blur-xl">
                <CalendarCheck className="size-5 shrink-0 text-brand-light" aria-hidden />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Novo agendamento confirmado</span>
                  <span className="text-xs text-muted-foreground">Corte + barba · hoje às 15:30</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 md:py-24" aria-labelledby="recursos">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 id="recursos" className="font-heading text-3xl font-semibold text-balance">Tudo que o seu negócio precisa para atender bem</h2>
            <p className="leading-relaxed text-muted-foreground">Feito para barbearias, salões, clínicas, estúdios e profissionais autônomos.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
                <Icon className="size-6 text-brand-light" aria-hidden />
                <h3 className="font-heading text-lg font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-card/40" aria-labelledby="como-funciona">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 md:py-24">
            <h2 id="como-funciona" className="font-heading text-3xl font-semibold">Comece hoje mesmo</h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary font-heading text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="font-heading text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 md:py-24">
          <h2 className="max-w-2xl font-heading text-3xl font-semibold text-balance">Pronto para organizar sua agenda?</h2>
          <Button size="lg" render={<Link href="/cadastro" />} nativeButton={false}>
            Criar conta grátis
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground">
          <span>© MARCAÍ</span>
          <Link href="/entrar" className="hover:text-foreground">Área do estabelecimento</Link>
        </div>
      </footer>
    </div>
  )
}
