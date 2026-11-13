export const MEMBER_ROLES = ["owner", "manager", "professional", "receptionist"] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const PERMISSIONS = [
  "agenda.view_all",
  "appointments.manage",
  "appointments.status",
  "availability.manage_own",
  "clients.view",
  "clients.manage",
  "professionals.manage",
  "services.manage",
  "finance.view",
  "reports.view",
  "settings.manage",
  "booking_page.manage",
  "team.manage",
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  "agenda.view_all": { label: "Ver agenda da equipe", description: "Visualiza os atendimentos de todos os profissionais." },
  "appointments.manage": { label: "Gerenciar agendamentos", description: "Cria, reagenda, confirma e cancela agendamentos." },
  "appointments.status": { label: "Atualizar status", description: "Inicia, conclui e registra pagamento dos atendimentos." },
  "availability.manage_own": { label: "Gerenciar disponibilidade", description: "Cria e remove bloqueios na própria agenda." },
  "clients.view": { label: "Consultar clientes", description: "Vê dados de contato e histórico dos clientes." },
  "clients.manage": { label: "Cadastrar clientes", description: "Cria e edita fichas de clientes." },
  "professionals.manage": { label: "Gerenciar profissionais", description: "Cadastra profissionais e define jornadas." },
  "services.manage": { label: "Gerenciar serviços", description: "Cria e edita serviços, preços e durações." },
  "finance.view": { label: "Financeiro", description: "Acessa receitas, despesas e pagamentos." },
  "reports.view": { label: "Relatórios e visão geral", description: "Acessa indicadores e relatórios do negócio." },
  "settings.manage": { label: "Configurações do estabelecimento", description: "Altera dados, horários e identidade visual." },
  "booking_page.manage": { label: "Página pública", description: "Gerencia a página de agendamento online." },
  "team.manage": { label: "Gestão de equipe", description: "Convida membros e altera permissões." },
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  professional: "Profissional",
  receptionist: "Recepcionista",
}

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: "Acesso completo ao estabelecimento.",
  manager: "Permissões configuráveis pelo proprietário.",
  professional: "Acessa a própria agenda e os atendimentos dele.",
  receptionist: "Opera agendamentos, agenda e cadastro de clientes.",
}

export const DEFAULT_PERMISSIONS: Record<MemberRole, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: PERMISSIONS.filter((p) => p !== "team.manage"),
  professional: ["appointments.status", "clients.view"],
  receptionist: ["agenda.view_all", "appointments.manage", "appointments.status", "clients.view", "clients.manage"],
}

/** Permissões que o proprietário pode conceder a cada função. */
export const GRANTABLE_PERMISSIONS: Record<Exclude<MemberRole, "owner">, Permission[]> = {
  manager: [...PERMISSIONS],
  professional: ["appointments.status", "availability.manage_own", "clients.view", "clients.manage", "appointments.manage", "agenda.view_all"],
  receptionist: ["agenda.view_all", "appointments.manage", "appointments.status", "clients.view", "clients.manage", "finance.view"],
}

export function sanitizePermissions(role: MemberRole, permissions: unknown): Permission[] {
  if (role === "owner") return [...PERMISSIONS]
  const allowed = new Set<Permission>(GRANTABLE_PERMISSIONS[role])
  if (!Array.isArray(permissions)) return DEFAULT_PERMISSIONS[role]
  return [...new Set(permissions.filter((p): p is Permission => allowed.has(p as Permission)))]
}

export function effectivePermissions(role: MemberRole, stored: Permission[]): Set<Permission> {
  return new Set(role === "owner" ? PERMISSIONS : sanitizePermissions(role, stored))
}

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (MEMBER_ROLES as readonly string[]).includes(value)
}
