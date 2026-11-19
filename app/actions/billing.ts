"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { cleanText, isUuid } from "@/lib/actions/result"
import * as asaas from "@/lib/billing/asaas"
import {
  BillingRuleError,
  cancelOwnSubscription,
  changeOwnPlan,
  normalizeDocument,
  startCheckout,
  syncPendingPayments,
  type BillingType,
  type CheckoutGateway,
} from "@/lib/billing/self-service"
import { getCurrentSubscription } from "@/lib/billing/subscriptions"
import { getAccess } from "@/lib/business"
import { db } from "@/lib/db"

export type BillingFormState = { ok: boolean; message: string } | null

const gateway: CheckoutGateway = asaas

/** Somente o proprietário contrata, altera ou cancela a assinatura do estabelecimento. */
async function authorizeOwner() {
  const access = await getAccess()
  if (!access || access.role !== "owner") return null
  return access
}

function failure(error: unknown): BillingFormState {
  if (error instanceof BillingRuleError) return { ok: false, message: error.message }
  if (error instanceof asaas.AsaasError) {
    console.error("[billing] Asaas", error.message)
    return { ok: false, message: `O gateway recusou a operação: ${error.message}` }
  }
  console.error("[billing] erro inesperado", error)
  return { ok: false, message: "Não foi possível concluir agora. Tente novamente em instantes." }
}

export async function checkoutAction(_: BillingFormState, form: FormData): Promise<BillingFormState> {
  const access = await authorizeOwner()
  if (!access) return { ok: false, message: "Somente o proprietário pode contratar um plano." }
  if (!asaas.isAsaasConfigured()) return { ok: false, message: "Pagamentos ainda não estão configurados. Fale com o suporte." }

  const planId = form.get("planId")
  if (!isUuid(planId)) return { ok: false, message: "Escolha um plano." }
  const billingType = String(form.get("billingType") ?? "") as BillingType
  if (!asaas.enabledBillingTypes().includes(billingType)) return { ok: false, message: "Escolha uma forma de pagamento." }
  const cpfCnpj = normalizeDocument(form.get("cpfCnpj"))
  if (!cpfCnpj) return { ok: false, message: "Informe um CPF ou CNPJ válido." }

  let target: string
  try {
    const result = await startCheckout(db, gateway, {
      business: access.business,
      user: access.user,
      planId,
      billingType,
      cpfCnpj,
    })
    target = result.pendingTransactionId ? `/assinatura/pagamento/${result.pendingTransactionId}` : "/assinatura?contratado=1"
  } catch (error) {
    return failure(error)
  }
  revalidatePath("/", "layout")
  redirect(target)
}

export async function changePlanAction(_: BillingFormState, form: FormData): Promise<BillingFormState> {
  const access = await authorizeOwner()
  if (!access) return { ok: false, message: "Somente o proprietário pode mudar o plano." }
  const planId = form.get("planId")
  if (!isUuid(planId)) return { ok: false, message: "Escolha um plano." }
  const sub = await getCurrentSubscription(db, access.business.id)
  if (!sub) return { ok: false, message: "Nenhuma assinatura vigente." }
  try {
    const plan = await changeOwnPlan(db, gateway, sub, planId, { userId: access.user.id, source: "owner" })
    revalidatePath("/", "layout")
    return { ok: true, message: `Plano alterado para ${plan.name}. As próximas cobranças já usam o novo valor.` }
  } catch (error) {
    return failure(error)
  }
}

export async function cancelOwnAction(_: BillingFormState, form: FormData): Promise<BillingFormState> {
  const access = await authorizeOwner()
  if (!access) return { ok: false, message: "Somente o proprietário pode cancelar a assinatura." }
  const sub = await getCurrentSubscription(db, access.business.id)
  if (!sub) return { ok: false, message: "Nenhuma assinatura vigente." }
  const paidFuture = sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()
  const mode = form.get("mode") === "now" || !paidFuture ? "now" : "period_end"
  try {
    await cancelOwnSubscription(db, gateway, sub, mode, { userId: access.user.id, source: "owner" }, cleanText(form.get("reason"), 300))
    revalidatePath("/", "layout")
    return {
      ok: true,
      message: mode === "now" ? "Assinatura cancelada." : "Cancelamento agendado para o fim do período pago.",
    }
  } catch (error) {
    return failure(error)
  }
}

export async function refreshPaymentsAction(_: BillingFormState): Promise<BillingFormState> {
  void _
  const access = await authorizeOwner()
  if (!access) return { ok: false, message: "Somente o proprietário pode atualizar as cobranças." }
  if (access.business.billingExempt) return { ok: false, message: "Este estabelecimento está isento de cobrança." }
  const sub = await getCurrentSubscription(db, access.business.id)
  if (!sub?.gatewaySubscriptionId) return { ok: false, message: "Nenhuma assinatura vinculada ao gateway." }
  try {
    await syncPendingPayments(db, gateway, sub)
    revalidatePath("/assinatura")
    return { ok: true, message: "Cobranças atualizadas." }
  } catch (error) {
    return failure(error)
  }
}
