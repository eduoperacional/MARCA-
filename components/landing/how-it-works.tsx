import { Settings2, Share2, UserPlus } from "lucide-react"

const STEPS = [
  { icon: UserPlus, title: "Crie sua conta", text: "Em menos de um minuto." },
  { icon: Settings2, title: "Configure", text: "Serviços, horários e equipe." },
  { icon: Share2, title: "Compartilhe seu link", text: "E receba agendamentos." },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto flex w-full max-w-6xl scroll-mt-20 flex-col gap-14 px-4 py-20 md:py-28" aria-labelledby="como-funciona-title">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-light">Como funciona</p>
        <h2 id="como-funciona-title" className="font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Três passos. Pronto.
        </h2>
      </div>

      <ol className="relative grid gap-10 md:grid-cols-3 md:gap-6">
        <div
          className="absolute left-[10%] right-[10%] top-7 hidden h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent md:block"
          aria-hidden
        />
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative flex flex-col items-start gap-5 md:items-center md:text-center">
            <span className="relative flex size-14 items-center justify-center rounded-2xl bg-[#14141f] text-brand-light ring-1 ring-primary/40 shadow-[0_0_40px_-8px_rgb(123_63_242/0.7)]">
              <Icon className="size-6" aria-hidden />
              <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primary font-heading text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-heading text-xl font-semibold">{title}</h3>
              <p className="text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
