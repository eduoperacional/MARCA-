import {
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Scissors,
  Settings,
  UserRoundCog,
  Users,
  Wallet,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

import type { Permission } from "@/lib/permissions"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description: string
  /** Recursos planejados para o módulo — exibidos enquanto ele está em construção. */
  features?: string[]
  /** Permissão necessária para exibir o item. */
  permission?: Permission
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    label: "Menu principal",
    items: [
      {
        title: "Visão geral",
        href: "/painel",
        icon: LayoutDashboard,
        description: "Acompanhe o desempenho do seu negócio.",
      },
      {
        title: "Agenda",
        href: "/painel/agenda",
        icon: CalendarDays,
        description: "Visualize e organize os horários de toda a equipe.",
        features: [
          "Visão diária, semanal e mensal",
          "Agenda por profissional",
          "Bloqueio de horários e intervalos",
        ],
      },
      {
        title: "Agendamentos",
        href: "/painel/agendamentos",
        icon: CalendarCheck2,
        description: "Gerencie todos os agendamentos e seus status.",
        features: [
          "Criação e remarcação rápidas",
          "Confirmação e lembretes",
          "Histórico completo por cliente",
        ],
      },
      {
        title: "Clientes",
        href: "/painel/clientes",
        permission: "clients.view",
        icon: Users,
        description: "Cadastro e histórico dos seus clientes.",
        features: [
          "Ficha completa do cliente",
          "Histórico de atendimentos e gastos",
          "Segmentação e etiquetas",
        ],
      },
      {
        title: "Profissionais",
        href: "/painel/profissionais",
        permission: "professionals.manage",
        icon: UserRoundCog,
        description: "Equipe, horários de trabalho e comissões.",
        features: [
          "Jornada e folgas",
          "Serviços por profissional",
          "Comissões e metas",
        ],
      },
      {
        title: "Serviços",
        href: "/painel/servicos",
        permission: "services.manage",
        icon: Scissors,
        description: "Catálogo de serviços, preços e durações.",
        features: [
          "Categorias e pacotes",
          "Preço e duração por profissional",
          "Serviços em destaque",
        ],
      },
      {
        title: "Página de agendamento",
        href: "/painel/pagina-de-agendamento",
        permission: "booking_page.manage",
        icon: Globe,
        description: "Sua página pública para clientes agendarem online.",
        features: [
          "Link exclusivo do estabelecimento",
          "Personalização visual",
          "Regras de antecedência e cancelamento",
        ],
      },
    ],
  },
  {
    id: "management",
    label: "Gestão",
    items: [
      {
        title: "Financeiro",
        href: "/painel/financeiro",
        permission: "finance.view",
        icon: Wallet,
        description: "Receitas, despesas e fluxo de caixa.",
        features: [
          "Fluxo de caixa",
          "Formas de pagamento",
          "Fechamento de comissões",
        ],
      },
      {
        title: "Relatórios",
        href: "/painel/relatorios",
        permission: "reports.view",
        icon: BarChart3,
        description: "Análises detalhadas do seu negócio.",
        features: [
          "Desempenho por serviço e profissional",
          "Retenção de clientes",
          "Exportação de dados",
        ],
      },
      {
        title: "Marketing",
        href: "/painel/marketing",
        permission: "settings.manage",
        icon: Megaphone,
        description: "Campanhas para atrair e reter clientes.",
        features: [
          "Campanhas de retorno",
          "Cupons e promoções",
          "Mensagens de aniversário",
        ],
      },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    items: [
      {
        title: "Configurações",
        href: "/painel/configuracoes",
        permission: "settings.manage",
        icon: Settings,
        description: "Dados do estabelecimento, conta e preferências.",
        features: [
          "Dados do estabelecimento",
          "Horário de funcionamento",
          "Usuários e permissões",
        ],
      },
      {
        title: "Equipe",
        href: "/painel/equipe",
        permission: "team.manage",
        icon: ShieldCheck,
        description: "Membros, convites e permissões de acesso.",
      },
      {
        title: "Ajuda e suporte",
        href: "/painel/ajuda",
        icon: LifeBuoy,
        description: "Central de ajuda e contato com o suporte.",
        features: ["Tutoriais", "Perguntas frequentes", "Contato com o suporte"],
      },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items
)

export function getNavItem(pathname: string) {
  if (pathname === "/painel/minha-conta") return { title: "Minha conta" } as NavItem
  return NAV_ITEMS.find((item) => item.href === pathname)
}

export function getModuleBySlug(slug: string) {
  return NAV_ITEMS.find((item) => item.href === `/painel/${slug}`)
}

export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.href === "/painel") return pathname === "/painel"
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
