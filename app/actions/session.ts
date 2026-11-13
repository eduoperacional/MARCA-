"use server"

import { revalidatePath } from "next/cache"

import { fail, isUuid } from "@/lib/actions/result"
import { getSession, listMemberships, setActiveBusiness } from "@/lib/business"

export async function switchBusiness(businessId: string) {
  if (!isUuid(businessId)) return fail("Estabelecimento inválido.")
  const session = await getSession()
  if (!session?.user) return fail("Sessão expirada. Entre novamente.")
  const memberships = await listMemberships(session.user.id)
  if (!memberships.some((m) => m.business.id === businessId)) {
    return fail("Você não tem acesso a este estabelecimento.")
  }
  await setActiveBusiness(businessId)
  revalidatePath("/painel", "layout")
  return { ok: true as const }
}
