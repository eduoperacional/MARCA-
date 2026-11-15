import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { cancelSubscriptionAction, changePlanAction, courtesyAction } from "@/app/actions/admin"
import { AdminActionForm, AdminField, adminFieldClass } from "@/components/admin/admin-action-form"
import { SectionCard } from "@/components/admin/kpi-card"
import { PageHeader } from "@/components/admin/period-tabs"
import { ToneBadge } from "@/components/admin/tone-badge"
import { requireAdmin } from "@/lib/admin/auth"
import { INTERVAL_LABEL, PAYMENT_METHOD_LABEL, SUBSCRIPTION_STATUS, TRANSACTION_STATUS } from "@/lib/admin/labels"
import { getSubscriptionDetail, listPlanOptions } from "@/lib/admin/queries"
import type { SubscriptionStatus } from "@/lib/db/schema"
import { formatCents, formatDate, formatDateTime } from "@/lib/format"

export const metadata: Metadata = { title: "Assinatura" }

const EVENT_LABEL: Record<string, string> = {
  created: "Assinatura criada",
  activated: "Primeiro pagamento confirmado",
  renewed: "Renovação paga",
  payment_overdue: "Cobrança vencida",
  payment_declined: "Pagamento recusado",
  chargeback: "Chargeback recebido",
  refund: "Reembolso",
  cancel_requested: "Cancelamento agendado",
  gateway_canceled: "Cobranças encerradas no Asaas",
  canceled: "Cancelada",
  trial_expired: "Trial expirou sem pagamento",
  courtesy: "Cortesia concedida",
  plan_changed: "Plano alterado",
  replaced: "Substituída",
}

const SOURCE_LABEL: Record<string, string> = { gateway: "Asaas", admin: "Admin", system: "Sistema" }

export default async function SubscriptionDetailPage({ params }: PageProps<"/admin/assinaturas/[id]">) {
  const admin = await requireAdmin("subscriptions.view")
  const { id } = await params
  const [detail, planOptions] = await Promise.all([getSubscriptionDetail(id), listPlanOptions()])
  if (!detail) notFound()
  const { sub, plan, events, transactions } = detail
  const status = SUBSCRIPTION_STATUS[sub.status]
  const closed = sub.status === "canceled" || sub.status === "expired"
  const canManage = admin.can("subscriptions.manage") && !closed

  return (
    <>
      <PageHeader
        title={detail.businessDisplayName || detail.businessName}
        description={`Assinatura ${plan?.name ?? ""} · criada em ${formatDate(sub.createdAt)}`}
        actions={
          <Link href={`/admin/estabelecimentos/${sub.businessId}`} className="text-sm text-muted-foreground hover:text-foreground">
            Ver estabelecimento
          </Link>
        }
      />

      <SectionCard title="Resumo">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Item label="Status">
            <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
          </Item>
          <Item label="Plano">
            {plan?.name ?? "—"} · {formatCents(sub.priceCents)} / {INTERVAL_LABEL[sub.billingInterval].toLowerCase()}
          </Item>
          <Item label="Forma de pagamento">{sub.paymentMethod ? (PAYMENT_METHOD_LABEL[sub.paymentMethod] ?? sub.paymentMethod) : "—"}</Item>
          <Item label="Trial até">{formatDate(sub.trialEndsAt)}</Item>
          <Item label="Período atual">
            {sub.currentPeriodStart ? `${formatDate(sub.currentPeriodStart)} a ${formatDate(sub.currentPeriodEnd)}` : "—"}
          </Item>
          <Item label="Cortesia até">{formatDate(sub.courtesyUntil)}</Item>
          <Item label="Cancelamento">
            {sub.canceledAt
              ? `Cancelada em ${formatDate(sub.canceledAt)}`
              : sub.cancelAtPeriodEnd
                ? `Agendado para ${formatDate(sub.currentPeriodEnd)}`
                : "—"}
          </Item>
          <Item label="ID no Asaas">
            <span className="font-mono text-xs">{sub.gatewaySubscriptionId ?? "—"}</span>
          </Item>
        </dl>
      </SectionCard>

      {canManage && (
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Alterar plano" description="Atualiza o valor das próximas cobranças no Asaas.">
            <AdminActionForm action={changePlanAction} hidden={{ subscriptionId: sub.id }} submitLabel="Alterar plano">
              <AdminField label="Novo plano">
                <select name="planId" required defaultValue="" className={adminFieldClass}>
                  <option value="" disabled>
                    Escolha
                  </option>
                  {planOptions
                    .filter((p) => p.isActive && p.id !== sub.planId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {formatCents(p.priceCents)} / {INTERVAL_LABEL[p.interval].toLowerCase()}
                      </option>
                    ))}
                </select>
              </AdminField>
              <AdminField label="Motivo (opcional)">
                <input name="reason" maxLength={500} className={adminFieldClass} />
              </AdminField>
            </AdminActionForm>
          </SectionCard>

          <SectionCard title="Conceder cortesia" description="Mantém o acesso liberado mesmo se o pagamento atrasar.">
            <AdminActionForm action={courtesyAction} hidden={{ subscriptionId: sub.id }} submitLabel="Conceder">
              <AdminField label="Dias">
                <input name="days" type="number" min={1} max={365} defaultValue={30} required className={adminFieldClass} />
              </AdminField>
              <AdminField label="Motivo (opcional)">
                <input name="reason" maxLength={500} className={adminFieldClass} />
              </AdminField>
            </AdminActionForm>
          </SectionCard>

          <SectionCard title="Cancelar assinatura" description="Encerra as cobranças no Asaas.">
            <AdminActionForm
              action={cancelSubscriptionAction}
              hidden={{ subscriptionId: sub.id }}
              submitLabel="Cancelar assinatura"
              destructive
              confirm="Cancelar esta assinatura? As cobranças futuras serão encerradas no Asaas."
            >
              <AdminField label="Quando">
                <select name="mode" defaultValue="period_end" className={adminFieldClass}>
                  <option value="period_end">No fim do período pago</option>
                  <option value="now">Imediatamente</option>
                </select>
              </AdminField>
              <AdminField label="Motivo">
                <input name="reason" required maxLength={500} className={adminFieldClass} />
              </AdminField>
            </AdminActionForm>
          </SectionCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cobranças">
          <ul className="divide-y text-sm">
            {transactions.length === 0 && <li className="py-2 text-muted-foreground">Nenhuma cobrança registrada ainda.</li>}
            {transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {formatDateTime(t.paidAt ?? t.createdAt)}
                  <span className="block font-mono text-xs text-muted-foreground">{t.gatewayTransactionId}</span>
                </span>
                <span className="font-medium">{formatCents(t.amountCents)}</span>
                <ToneBadge tone={TRANSACTION_STATUS[t.status].tone}>{TRANSACTION_STATUS[t.status].label}</ToneBadge>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Linha do tempo">
          <ol className="flex flex-col gap-3 text-sm">
            {events.length === 0 && <li className="text-muted-foreground">Sem eventos.</li>}
            {events.map(({ event, actor }) => (
              <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <span className="font-medium">{EVENT_LABEL[event.type] ?? event.type}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)} · {SOURCE_LABEL[event.source] ?? event.source}
                  {actor ? ` (${actor})` : ""}
                  {event.toStatus && event.fromStatus !== event.toStatus
                    ? ` · ${event.fromStatus ? `${SUBSCRIPTION_STATUS[event.fromStatus as SubscriptionStatus]?.label ?? event.fromStatus} → ` : ""}${SUBSCRIPTION_STATUS[event.toStatus as SubscriptionStatus]?.label ?? event.toStatus}`
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
