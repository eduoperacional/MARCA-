import {
  CalendarPlus,
  Scissors,
  Share2,
  UserPlus,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react"

export interface QuickAction {
  id: string
  label: string
  description: string
  icon: LucideIcon
  href?: string
  action?: "share-booking-link"
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-appointment",
    label: "Novo agendamento",
    description: "Reserve um horário",
    icon: CalendarPlus,
    href: "/painel/agendamentos?novo=1",
  },
  {
    id: "new-client",
    label: "Cadastrar cliente",
    description: "Adicione à sua base",
    icon: UserPlus,
    href: "/painel/clientes?novo=1",
  },
  {
    id: "new-service",
    label: "Cadastrar serviço",
    description: "Preço e duração",
    icon: Scissors,
    href: "/painel/servicos?novo=1",
  },
  {
    id: "new-professional",
    label: "Adicionar profissional",
    description: "Monte sua equipe",
    icon: UserRoundPlus,
    href: "/painel/profissionais?novo=1",
  },
  {
    id: "share-booking",
    label: "Compartilhar página",
    description: "Copie seu link de agendamento",
    icon: Share2,
    action: "share-booking-link",
  },
]
