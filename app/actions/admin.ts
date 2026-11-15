"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { cleanText, isUuid } from "@/lib/actions/result"
import { authorizeAdmin, logAdminAction } from "@/lib/admin/auth"
import { AsaasError, cancelSubscription, toAsaasCycle, updateSubscription } from "@/lib/billing/asaas"
import {
  addBusinessNote,
  cancelSubscriptionLocal,
  changePlanLocal,
  grantCourtesy,
  reactivateBusiness,
  suspendBusiness,
} from "@/lib/billing/subscriptions"
import { db } from "@/lib/db"
import { businesses, plans, subscriptions } from "@/lib/db/schema"

export type AdminFormState = { ok: boolean; message: string } | null

const DENIED: AdminFormState = { ok: false, message: "Você não tem permissão para esta ação." }

async function businessExists(id: unknown) {
  if (!isUuid(id)) return null
  const [row] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, id)).limit(1)
  return row?.id ?? null
}

async function loadSubscription(id: unknown) {
  if (!isUuid(id)) return null
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1)
  return row ?? null
}

function refresh(businessId: string, subscriptionId?: string) {
  revalidatePath(`/admin/estabelecimentos/${businessId}`)
  revalidatePath("/admin/estabelecimentos")
  revalidatePath("/admin/assinaturas")
  if (subscriptionId) revalidatePath(`/admin/assinaturas/${subscriptionId}`)
}

export async function suspendBusinessAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await authorizeAdmin("businesses.manage")
  if (!admin) return DENIED
  const businessId = await businessExists(form.get("businessId"))
  const reason = cleanText(form.get("reason"), 500)
  if (!businessId) return { ok: false, message: "Estabelecimento não encontrado." }
  if (!reason || reason.length < 5) return { ok: false, message: "Informe o motivo (mínimo 5 caracteres)." }

  await suspendBusiness(db, businessId, reason, admin.user.id)
  await logAdminAction(admin, { action: "business.suspend", targetType: "business", targetId: businessId, businessId, reason })
  refresh(businessId)
  return { ok: true, message: "Acesso bloqueado. A equipe do estabelecimento verá a tela de bloqueio." }
}

export async function reactivateBusinessAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await authorizeAdmin("businesses.manage")
  if (!admin) return DENIED
  const businessId = await businessExists(form.get("businessId"))
  if (!businessId) return { ok: false, message: "Estabelecimento não encontrado." }
  const reason = cleanText(form.get("reason"), 500)

  const removed = await reactivateBusiness(db, businessId)
  if (!removed) return { ok: false, message: "Este estabelecimento não estava bloqueado." }
  await logAdminAction(admin, { action: "business.reactivate", targetType: "business", targetId: businessId, businessId, reason })
  refresh(businessId)
  return { ok: true, message: "Acesso reativado." }
}

export async function addNoteAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await authorizeAdmin("notes.write")
  if (!admin) return DENIED
  const businessId = await businessExists(form.get("businessId"))
  const body = cleanText(form.get("body"), 2000)
  if (!businessId) return { ok: false, message: "Estabelecimento não encontrado." }
  if (!body) return { ok: false, message: "Escreva a observação." }

  await addBusinessNote(db, businessId, admin.user.id, body)
  await logAdminAction(admin, { action: "business.note", targetType: "business", targetId: businessId, businessId })
  refresh(businessId)
  return { ok: true, message: "Observação registrada." }
}

export async function cancelSubscriptionAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await authorizeAdmin("subscriptions.manage")
  if (!admin) return DENIED
  const sub = await loadSubscription(form.get("subscriptionId"))
  if (!sub) return { ok: false, message: "Assinatura não encontrada." }
  if (sub.status === "canceled" || sub.status === "expired") return { ok: false, message: "Esta assinatura já está encerrada." }
  const mode = form.get("mode") === "now" ? "now" : "period_end"
  const reason = cleanText(form.get("reason"), 500)
  if (!reason) return { ok: false, message: "Informe o motivo do cancelamento." }

  // Para novas cobranças no gateway primeiro: sem isso o cliente continuaria sendo cobrado.
  if (sub.gatewaySubscriptionId) {
    try {
      await cancelSubscription(sub.gatewaySubscriptionId)
    } catch (error) {
      if (error instanceof AsaasError) return { ok: false, message: `Asaas: ${error.message}` }
      throw error
    }
  }
  const applied = await cancelSubscriptionLocal(db, sub, mode, { userId: admin.user.id, source: "admin" }, reason)
  await logAdminAction(admin, {
    action: "subscription.cancel",
    targetType: "subscription",
    targetId: sub.id,
    businessId: sub.businessId,
    reason,
    details: { mode: applied },
  })
  refresh(sub.businessId, sub.id)
  return {
    ok: true,
    message: applied === "now" ? "Assinatura cancelada imediatamente." : "Cancelamento agendado para o fim do período pago.",
  }
}

export async function courtesyAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await authorizeAdmin("subscriptions.manage")
  if (!admin) return DENIED
  const sub = await loadSubscription(form.get("subscriptionId"))
  if (!sub) return { ok: false, message: "Assinatura não encontrada." }
  const days = Number(form.get("days"))
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, message: "Dias de cortesia: entre 1 e 365." }
  const reason = cleanText(form.get("reason"), 500)

  const until = await grantCourtesy(db, sub, days, { userId: admin.user.id, source: "admin" }, reason)
  await logAdminAction(admin, {
    action: "subscription.courtesy",
    targetType: "subscription",
    targetId: sub.id,
    businessId: sub.businessId,
    reason,
    details: { days, until },
  })
  refresh(sub.businessId, sub.id)
  return { ok: true, message: `Cortesia válida até ${until.toLocaleDateString("pt-BR")}.` }
}

export async function changePlanAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await authorizeAdmin("subscriptions.manage")
  if (!admin) return DENIED
  const sub = await loadSubscription(form.get("subscriptionId"))
  if (!sub) return { ok: false, message: "Assinatura não encontrada." }
  const planId = form.get("planId")
  if (!isUuid(planId)) return { ok: false, message: "Escolha um plano." }
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  if (!plan) return { ok: false, message: "Plano não encontrado." }
  if (plan.id === sub.planId) return { ok: false, message: "A assinatura já está neste plano." }
  const reason = cleanText(form.get("reason"), 500)

  if (sub.gatewaySubscriptionId) {
    try {
      await updateSubscription(sub.gatewaySubscriptionId, {
        value: plan.priceCents / 100,
        cycle: toAsaasCycle(plan.billingInterval),
        description: `MARCAÍ - Plano ${plan.name}`,
      })
    } catch (error) {
      if (error instanceof AsaasError) return { ok: false, message: `Asaas: ${error.message}` }
      throw error
    }
  }
  await changePlanLocal(db, sub, plan, { userId: admin.user.id, source: "admin" }, reason)
  await logAdminAction(admin, {
    action: "subscription.change_plan",
    targetType: "subscription",
    targetId: sub.id,
    businessId: sub.businessId,
    reason,
    details: { fromPlanId: sub.planId, toPlanId: plan.id },
  })
  refresh(sub.businessId, sub.id)
  return { ok: true, message: `Plano alterado para ${plan.name}. Vale a partir da próxima cobrança.` }
}
