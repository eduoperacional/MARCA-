import { CalendarRange, Globe, LineChart, ShieldCheck, Users } from "lucide-react"

const BENEFITS = [
  { icon: CalendarRange, title: "Agendamentos em um só lugar.", text: "Toda a agenda, sempre à mão." },
  { icon: Globe, title: "Seus clientes agendam online.", text: "Um link próprio, aberto 24 horas." },
  { icon: Users, title: "Sua equipe organizada.", text: "Cada pessoa vê o que precisa." },
  { icon: ShieldCheck, title: "Menos faltas e conflitos.", text: "Lembretes e horários sem sobreposição." },
  { icon: LineChart, title: "Controle do seu negócio.", text: "Faturamento e resultados em tempo real." },
]

const SEGMENTS = ["Beleza", "Saúde", "Estética", "Consultórios", "Autônomos", "Serviços"]

export function Benefits() {
  return (
    <section id="beneficios" className="mx-auto flex w-full max-w-6xl scroll-mt-20 flex-col gap-12 px-4 py-20 md:py-28" aria-labelledby="beneficios-title">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-light">Benefícios</p>
        <h2 id="beneficios-title" className="max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Menos esforço. Mais tempo para crescer.
        </h2>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {BENEFITS.map(({ icon: Icon, title, text }, i) => (
          <li
            key={title}
            className={`group relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 ${
              i < 2 ? "lg:col-span-3" : "lg:col-span-2"
            }`}
          >
            <div
              className="absolute -right-16 -top-16 size-40 rounded-full bg-primary/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-brand-light ring-1 ring-primary/30">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-heading text-xl font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-center gap-4 border-t border-white/5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Para quem trabalha com hora marcada</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {SEGMENTS.map((segment) => (
            <li key={segment} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm text-foreground/80">
              {segment}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
