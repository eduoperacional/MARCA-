import { CalendarDays, Home, Link2, Plus, Users, Wallet } from "lucide-react"

const APPOINTMENTS = [
  { time: "09:00", client: "Marina S.", service: "Avaliação", status: "Concluído" },
  { time: "10:30", client: "Paulo R.", service: "Sessão completa", status: "Confirmado" },
  { time: "14:00", client: "Clara M.", service: "Retorno", status: "Confirmado" },
  { time: "15:30", client: "Diego L.", service: "Consulta", status: "Pendente" },
] as const

const STATUS_STYLES: Record<(typeof APPOINTMENTS)[number]["status"], string> = {
  Concluído: "bg-white/10 text-white/70",
  Confirmado: "bg-primary/25 text-brand-light",
  Pendente: "bg-amber-400/15 text-amber-300",
}

const NAV = [
  { icon: Home, label: "Início" },
  { icon: CalendarDays, label: "Agenda", active: true },
  { icon: Users, label: "Clientes" },
  { icon: Wallet, label: "Financeiro" },
]

export function HeroPhone() {
  return (
    <div className="hero-phone relative aspect-[9/19] w-full">
      <div className="absolute inset-0 rounded-[2.4rem] bg-gradient-to-br from-[#d9c4ff]/50 via-[#3a2a66] to-[#120d22] p-[2px] shadow-[0_40px_80px_-20px_rgb(123_63_242/0.65),0_0_0_1px_rgb(255_255_255/0.05)]">
        <div className="relative flex size-full flex-col overflow-hidden rounded-[2.3rem] bg-[#0B0B12] p-[5px]">
          <div className="relative flex size-full flex-col overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#151124] to-[#0B0B12]">
            <div className="flex items-center justify-between px-4 pt-2.5 text-[8px] font-medium text-white/80">
              <span>9:41</span>
              <span className="h-3.5 w-14 rounded-full bg-black" />
              <span className="flex gap-0.5">
                <span className="h-1.5 w-2.5 rounded-[2px] border border-white/70" />
              </span>
            </div>

            <div className="flex items-center justify-between px-3.5 pt-3">
              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-[0.14em] text-brand-light">Agenda</span>
                <span className="font-heading text-sm font-semibold leading-tight text-white">Hoje</span>
              </div>
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-white shadow-[0_0_14px_rgb(123_63_242/0.7)]">
                <Plus className="size-3" />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 px-3.5 pt-2.5">
              <div className="rounded-xl border border-white/5 bg-white/[0.04] p-2">
                <span className="block text-[7px] text-white/50">Agendamentos</span>
                <span className="font-heading text-sm font-semibold text-white">9</span>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/15 p-2">
                <span className="block text-[7px] text-brand-light/80">Confirmados</span>
                <span className="font-heading text-sm font-semibold text-white">7</span>
              </div>
            </div>

            <ul className="flex flex-1 flex-col gap-1.5 px-3.5 pt-2.5">
              {APPOINTMENTS.map((item) => (
                <li
                  key={item.time}
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] p-1.5"
                >
                  <span className="w-7 text-[8px] font-medium text-white/60">{item.time}</span>
                  <span className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand-light to-primary" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[8.5px] font-medium text-white">{item.client}</span>
                    <span className="truncate text-[7px] text-white/50">{item.service}</span>
                  </div>
                  <span className={`rounded-full px-1.5 py-0.5 text-[6.5px] font-medium ${STATUS_STYLES[item.status]}`}>
                    {item.status}
                  </span>
                </li>
              ))}
              <li className="mt-auto mb-2 flex items-center gap-2 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/25 to-primary/5 p-2">
                <Link2 className="size-3 text-brand-light" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[7px] text-white/60">Seu link de agendamento</span>
                  <span className="truncate text-[8.5px] font-medium text-white">marcai.app/seu-negocio</span>
                </div>
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[6.5px] font-medium text-white">Copiar</span>
              </li>
            </ul>

            <nav className="mx-2.5 mb-2.5 flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.04] px-3 py-1.5">
              {NAV.map(({ icon: Icon, label, active }) => (
                <span key={label} className={`flex flex-col items-center gap-0.5 ${active ? "text-brand-light" : "text-white/40"}`}>
                  <Icon className="size-3" />
                  <span className="text-[6px]">{label}</span>
                </span>
              ))}
            </nav>

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.14)_0%,transparent_28%,transparent_70%,rgb(184_139_255/0.08)_100%)]" />
          </div>
        </div>
      </div>
      <div className="absolute -right-[3px] top-[22%] h-10 w-[3px] rounded-r bg-[#3a2a66]" />
      <div className="absolute -left-[3px] top-[18%] h-6 w-[3px] rounded-l bg-[#3a2a66]" />
      <div className="absolute -left-[3px] top-[27%] h-9 w-[3px] rounded-l bg-[#3a2a66]" />
    </div>
  )
}
