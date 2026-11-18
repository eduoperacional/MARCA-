import { CalendarDays, Check, LayoutDashboard, Link2, Users, Wallet } from "lucide-react"

const SIDEBAR = [
  { icon: LayoutDashboard, label: "Início", active: false },
  { icon: CalendarDays, label: "Agenda", active: true },
  { icon: Users, label: "Clientes", active: false },
  { icon: Wallet, label: "Financeiro", active: false },
]

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]

const COLUMNS = [
  {
    name: "Ana",
    events: [
      { start: 0, span: 1, title: "Avaliação", client: "Marina S." },
      { start: 2, span: 2, title: "Sessão completa", client: "Paulo R." },
      { start: 5, span: 1, title: "Retorno", client: "Clara M." },
    ],
  },
  {
    name: "Bruno",
    events: [
      { start: 1, span: 1, title: "Consulta", client: "Diego L." },
      { start: 4, span: 2, title: "Atendimento", client: "Júlia F." },
    ],
  },
  {
    name: "Carla",
    events: [
      { start: 0, span: 2, title: "Pacote mensal", client: "Rita A." },
      { start: 3, span: 1, title: "Primeira visita", client: "Lucas P." },
    ],
  },
]

const ROW = 52

export function ProductDemo() {
  return (
    <section id="demonstracao" className="relative scroll-mt-20 overflow-hidden py-20 md:py-28" aria-labelledby="demo-title">
      <div
        className="absolute inset-x-0 top-1/3 -z-10 mx-auto h-[28rem] max-w-4xl rounded-full bg-[radial-gradient(ellipse,rgb(123_63_242/0.28),transparent_70%)] blur-3xl"
        aria-hidden
      />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4">
        <div className="flex max-w-2xl flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-light">O sistema</p>
          <h2 id="demo-title" className="font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            O dia inteiro, em uma tela.
          </h2>
          <p className="text-muted-foreground">Clareza para você. Simplicidade para seus clientes.</p>
        </div>

        <div className="relative w-full [perspective:2000px]">
          <div
            role="img"
            aria-label="Demonstração do painel do MARCAÍ com a agenda do dia dividida por profissional"
            className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0f0f18] shadow-[0_40px_120px_-30px_rgb(123_63_242/0.55)] transition-transform duration-700 md:[transform:rotateX(8deg)] md:hover:[transform:rotateX(0deg)]"
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="ml-3 rounded-md bg-white/5 px-3 py-1 text-xs text-muted-foreground">marcai · agenda</span>
            </div>

            <div className="flex" aria-hidden>
              <aside className="hidden w-48 shrink-0 flex-col gap-1 border-r border-white/5 p-3 md:flex">
                {SIDEBAR.map(({ icon: Icon, label, active }) => (
                  <span
                    key={label}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
                      active ? "bg-primary/15 text-foreground ring-1 ring-primary/30" : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </span>
                ))}
                <span className="mt-auto flex items-center gap-2 rounded-xl border border-white/5 px-3 py-2 text-xs text-muted-foreground">
                  <Link2 className="size-3.5 text-brand-light" />
                  Link de agendamento
                </span>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-heading text-lg font-semibold">Hoje</span>
                    <span className="text-xs text-muted-foreground">9 agendamentos · 3 profissionais</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-xl border border-white/10 px-3 py-1.5 text-xs">Dia</span>
                    <span className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                      + Novo
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 overflow-hidden">
                  <div className="flex shrink-0 flex-col pt-8">
                    {HOURS.map((h) => (
                      <span key={h} className="text-[11px] text-muted-foreground" style={{ height: ROW }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  {COLUMNS.map((col) => (
                    <div key={col.name} className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="h-6 text-xs font-medium text-foreground/80">{col.name}</span>
                      <div
                        className="relative rounded-xl bg-[repeating-linear-gradient(to_bottom,rgb(255_255_255/0.04)_0,rgb(255_255_255/0.04)_1px,transparent_1px,transparent_52px)]"
                        style={{ height: ROW * HOURS.length }}
                      >
                        {col.events.map((ev) => (
                          <div
                            key={ev.title}
                            className="absolute inset-x-1 flex flex-col overflow-hidden rounded-lg border-l-2 border-brand-light bg-primary/20 px-2 py-1.5"
                            style={{ top: ev.start * ROW + 3, height: ev.span * ROW - 6 }}
                          >
                            <span className="truncate text-xs font-medium">{ev.title}</span>
                            <span className="truncate text-[11px] text-muted-foreground">{ev.client}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="animate-float absolute -bottom-6 right-2 hidden w-64 flex-col gap-3 rounded-2xl border border-white/10 bg-[#14141f]/90 p-4 shadow-2xl backdrop-blur-xl sm:flex md:right-8" aria-hidden>
            <span className="text-xs text-muted-foreground">Página de agendamento</span>
            <span className="font-heading text-sm font-semibold">Escolha um horário</span>
            <div className="grid grid-cols-3 gap-1.5">
              {["08:30", "09:15", "10:00", "13:30", "15:00", "16:45"].map((t, i) => (
                <span
                  key={t}
                  className={`rounded-lg py-1.5 text-center text-xs ${
                    i === 4 ? "bg-primary text-primary-foreground" : "border border-white/10 text-foreground/80"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-brand-light">
              <Check className="size-3.5" />
              Confirmado na hora
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
