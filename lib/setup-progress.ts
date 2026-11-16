import type { DaySchedule } from "@/lib/types"

export const SETUP_STEPS = [
  {
    key: "business",
    title: "Dados do estabelecimento",
    short: "Estabelecimento",
    description: "Nome, segmento, contato, endereço e identidade visual.",
    panelHref: "/painel/configuracoes",
    essential: true,
  },
  {
    key: "hours",
    title: "Funcionamento",
    short: "Funcionamento",
    description: "Dias de atendimento, horários, intervalos e folgas.",
    panelHref: "/painel/configuracoes",
    essential: true,
  },
  {
    key: "services",
    title: "Serviços",
    short: "Serviços",
    description: "O que você oferece, com preço e duração.",
    panelHref: "/painel/servicos?novo=1",
    essential: true,
  },
  {
    key: "professionals",
    title: "Profissionais",
    short: "Profissionais",
    description: "Quem atende, em quais dias e quais serviços realiza.",
    panelHref: "/painel/profissionais?novo=1",
    essential: true,
  },
  {
    key: "rules",
    title: "Regras de agendamento",
    short: "Regras",
    description: "Antecedência mínima e intervalo entre horários.",
    panelHref: "/painel/configuracoes",
    essential: false,
  },
  {
    key: "page",
    title: "Página pública",
    short: "Página pública",
    description: "Seu link de agendamento online, pronto para divulgar.",
    panelHref: "/painel/pagina-de-agendamento",
    essential: true,
  },
] as const

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"]

/** Etapas que só contam como concluídas depois de confirmadas pelo cliente. */
export const REVIEWABLE_STEPS = ["business", "hours", "rules", "page"] as const satisfies readonly SetupStepKey[]

export function isSetupStepKey(value: unknown): value is SetupStepKey {
  return SETUP_STEPS.some((s) => s.key === value)
}

export interface SetupSnapshot {
  business: {
    name: string | null
    segment: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    openingHours: DaySchedule[]
    onlineBookingEnabled: boolean
  }
  activeServices: number
  activeProfessionals: number
  /** Profissionais ativos com ao menos um serviço ativo vinculado e um dia de trabalho. */
  bookableProfessionals: number
  reviewedSteps: readonly string[]
}

export interface SetupStepStatus {
  key: SetupStepKey
  step: number
  title: string
  short: string
  description: string
  panelHref: string
  essential: boolean
  done: boolean
  /** O que falta, em linguagem simples; null quando concluída. */
  pending: string | null
}

export interface SetupProgress {
  steps: SetupStepStatus[]
  doneCount: number
  total: number
  percent: number
  /** Todas as etapas essenciais concluídas: o estabelecimento consegue receber agendamentos. */
  ready: boolean
  /** Próxima etapa sem conclusão (essenciais primeiro). */
  nextStep: SetupStepStatus | null
}

const filled = (value: string | null | undefined) => Boolean(value && value.trim())

function evaluate(key: SetupStepKey, s: SetupSnapshot): string | null {
  const reviewed = (k: string) => s.reviewedSteps.includes(k)
  switch (key) {
    case "business": {
      const b = s.business
      if (![b.name, b.segment, b.phone, b.address, b.city, b.state].every(filled)) {
        return "Complete nome, segmento, telefone e endereço."
      }
      return null
    }
    case "hours":
      if (!s.business.openingHours.some((d) => d.active)) return "Defina ao menos um dia de atendimento."
      if (!reviewed("hours")) return "Confirme os dias e horários de funcionamento."
      return null
    case "services":
      return s.activeServices > 0 ? null : "Cadastre ao menos um serviço ativo."
    case "professionals":
      if (s.bookableProfessionals > 0) return null
      if (s.activeProfessionals > 0) return "Vincule serviços e dias de trabalho a um profissional."
      return "Cadastre ao menos um profissional."
    case "rules":
      return reviewed("rules") ? null : "Revise antecedência e intervalo entre horários."
    case "page":
      if (!s.business.onlineBookingEnabled) return "Ative o agendamento online para publicar sua página."
      if (!reviewed("page")) return "Revise e publique sua página de agendamento."
      return null
  }
}

export function computeSetupProgress(snapshot: SetupSnapshot): SetupProgress {
  const steps = SETUP_STEPS.map((def, index) => {
    const pending = evaluate(def.key, snapshot)
    return { ...def, step: index + 1, done: pending === null, pending }
  })
  const doneCount = steps.filter((s) => s.done).length
  const ready = steps.every((s) => !s.essential || s.done)
  const nextStep = steps.find((s) => !s.done && s.essential) ?? steps.find((s) => !s.done) ?? null
  return {
    steps,
    doneCount,
    total: steps.length,
    percent: Math.round((doneCount / steps.length) * 100),
    ready,
    nextStep,
  }
}

export function mergeReviewed(current: readonly string[], add: readonly SetupStepKey[]) {
  return [...new Set([...current.filter(isSetupStepKey), ...add])].sort()
}
