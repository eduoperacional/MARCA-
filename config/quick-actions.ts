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
    href: "/agendamentos",
  },
  {
    id: "new-client",
    label: "Cadastrar cliente",
    description: "Adicione à sua base",
    icon: UserPlus,
    href: "/clientes",
  },
  {
    id: "new-service",
    label: "Cadastrar serviço",
    description: "Preço e duração",
    icon: Scissors,
    href: "/servicos",
  },
  {
    id: "new-professional",
    label: "Adicionar profissional",
    description: "Monte sua equipe",
    icon: UserRoundPlus,
    href: "/profissionais",
  },
  {
    id: "share-booking",
    label: "Compartilhar página",
    description: "Copie seu link de agendamento",
    icon: Share2,
    action: "share-booking-link",
  },
]
