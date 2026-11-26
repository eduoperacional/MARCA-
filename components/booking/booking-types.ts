export interface PublicService {
  id: string
  name: string
  category: string
  description: string | null
  price: number
  durationMin: number
  professionalIds: string[]
}

export interface PublicProfessional {
  id: string
  name: string
  specialties: string | null
  photoUrl: string | null
  color: string
  workdays: number[]
}

export type Step = "service" | "professional" | "time" | "details" | "done"
export type ActiveStep = Exclude<Step, "done">

export const STEPS: { key: ActiveStep; label: string }[] = [
  { key: "service", label: "Serviço" },
  { key: "professional", label: "Profissional" },
  { key: "time", label: "Horário" },
  { key: "details", label: "Seus dados" },
]

export function formatDuration(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}min` : `${h}h`
}
