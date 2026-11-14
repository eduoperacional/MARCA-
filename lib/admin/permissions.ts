import type { AdminRole } from "@/lib/db/schema"

export type AdminPermission =
  | "dashboard.view"
  | "businesses.view"
  | "businesses.manage"
  | "users.view"
  | "subscriptions.view"
  | "subscriptions.manage"
  | "plans.manage"
  | "finance.view"
  | "support.view"
  | "notes.write"
  | "data.export"
  | "audit.view"

const ALL: AdminPermission[] = [
  "dashboard.view",
  "businesses.view",
  "businesses.manage",
  "users.view",
  "subscriptions.view",
  "subscriptions.manage",
  "plans.manage",
  "finance.view",
  "support.view",
  "notes.write",
  "data.export",
  "audit.view",
]

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ALL,
  admin: ALL.filter((p) => p !== "audit.view"),
  finance: ["dashboard.view", "businesses.view", "subscriptions.view", "finance.view", "data.export"],
  support: ["dashboard.view", "businesses.view", "users.view", "support.view", "notes.write"],
}

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  finance: "Financeiro",
  support: "Suporte",
}

export function adminCan(role: AdminRole, permission: AdminPermission) {
  return ADMIN_ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
