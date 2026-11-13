"use client"

import { createContext, useContext } from "react"

import type { MemberRole, Permission } from "@/lib/permissions"

export interface WorkspaceValue {
  user: { name: string; email: string }
  business: { id: string; name: string; slug: string }
  role: MemberRole
  permissions: Permission[]
  memberships: { id: string; name: string; role: MemberRole }[]
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ value, children }: { value: WorkspaceValue; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return value
}

export function useCan() {
  const { permissions } = useWorkspace()
  return (permission?: Permission) => !permission || permissions.includes(permission)
}
