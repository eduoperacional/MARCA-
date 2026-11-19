import Link from "next/link"

import { cancelOwnAction, refreshPaymentsAction } from "@/app/actions/billing"
import { AutoRefresh, BillingForm } from "@/components/billing/billing-form"
import { ToneBadge } from "@/components/admin/tone-badge"
import { buttonVariants } from "@/components/ui/button"
import { INTERVAL_LABEL, PAYMENT_METHOD_LABEL, SUBSCRIPTION_STATUS, TRANSACTION_STATUS } from "@/lib/admin/labels"
import { computeBillingAccess } from "@/lib/billing/access"
import { getBillingOverview } from "@/lib/billing/self-service"
import { isContracted } from "@/lib/billing/subscriptions"
import { requireAccess } from "@/lib/business"
import { db } from "@/lib/db"
import { formatCents, formatDate } from "@/lib/format"

export default async function BillingPage() {
  const access = await requireAccess()
  const isOwner = access.role === "owner"
  const { subscription: sub, plan, transactions, pending } = await getBillingOverview(db, access.business.id)
  const billing = computeBillingAccess(access.business, sub)
  const status = sub ? SUBSCRIPTION_STATUS[sub.status] : null
  const contracted = sub ? isContracted(sub) : false
  // Contratado no trial: a assinatura e a primeira cobrança são criadas no Asaas no fim do teste.
  const scheduledFirstCharge = sub?.gatewayActivationStatus === "pending"
  const nextCharge = scheduledFirstCharge
    ? sub?.trialEndsAt
    : pending[0]?.dueDate ?? (sub?.cancelAtPeriodEnd ? null : sub?.currentPeriodEnd)
  const isBillingExempt = access.business.billingExempt
  const waitingConfirmation = !isBillingExempt && sub && ["awaiting_payment", "payment_pending", "trialing"].includes(sub.status) && pending.length > 0

  return (
    <>
      {waitingConfirmation && <AutoRefresh seconds={15} />}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">Assinatura</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Plano, cobranças e histórico de pagamentos do seu estabelecimento.
        </p>
      </div>

      {isBillingExempt && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
          Esta conta tem isenção permanente de cobrança. O acesso ao MARCAÍ permanece ativo e nenhuma cobrança ou renovação automática será gerada.
        </div>
      )}

      {!billing.allowed && (
        <div role="alert" className="flex flex-col gap-1 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-medium text-foreground">O acesso ao painel está bloqueado</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {billing.notice} {isOwner ? "Escolha um plano ou pague a cobrança pendente para liberar." : "Fale com o proprietário do estabelecimento."}
          </p>
        </div>
      )}

      <section aria-labelledby="plano-atual" className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="plano-atual" className="text-xs tracking-wider text-muted-foreground uppercase">
              Plano atual
            </h2>
            <p className="text-2xl font-semibold text-foreground">
              {plan ? plan.name : isBillingExempt ? "Isento de cobrança" : billing.state === "trial" ? "Período de teste" : "Nenhum plano"}
            </p>
            {plan && sub && (
              <p className="text-sm text-muted-foreground">
                {formatCents(sub.priceCents)} · {INTERVAL_LABEL[sub.billingInterval]}
              </p>
            )}
          </div>
          {isBillingExempt ? <ToneBadge tone="brand">Isento de cobrança</ToneBadge> : status && <ToneBadge tone={status.tone}>{status.label}</ToneBadge>}
          {!sub && billing.state === "trial" && <ToneBadge tone="brand">Teste grátis</ToneBadge>}
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">
              {isBillingExempt ? "Acesso" : billing.state === "trial" || billing.state === "trial_grace" ? "Teste até" : "Acesso garantido até"}
            </dt>
            <dd className="font-medium text-foreground">{isBillingExempt ? "Permanente" : formatDate(billing.until)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Próxima cobrança</dt>
            <dd className="font-medium text-foreground">{isBillingExempt ? "Não haverá cobranças" : contracted ? formatDate(nextCharge) : "—"}</dd>
            {!isBillingExempt && scheduledFirstCharge && (
              <p className="text-xs leading-relaxed text-muted-foreground">Nada é cobrado antes do fim do teste.</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Renovação</dt>
            <dd className="font-medium text-foreground">
              {isBillingExempt ? "Sem renovação automática" : sub?.cancelAtPeriodEnd ? "Cancelamento agendado" : contracted ? "Automática" : "—"}
            </dd>
          </div>
        </dl>

        {isOwner ? (
          !isBillingExempt && (
            <div className="flex flex-wrap gap-3">
              <Link href="/assinatura/planos" className={buttonVariants()}>{contracted ? "Mudar de plano" : "Escolher um plano"}</Link>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Somente o proprietário pode contratar ou alterar o plano.</p>
        )}
      </section>

      {!isBillingExempt && pending.length > 0 && (
        <section aria-labelledby="pendentes" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="pendentes" className="font-semibold text-foreground">
              Cobranças em aberto
            </h2>
            {isOwner && <BillingForm action={refreshPaymentsAction} submitLabel="Atualizar" variant="outline" />}
          </div>
          <ul className="flex flex-col gap-2">
            {pending.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{formatCents(t.amountCents)}</span>
                  <span className="text-sm text-muted-foreground">Vencimento {formatDate(t.dueDate)}</span>
                </div>
                <Link href={`/assinatura/pagamento/${t.id}`} className={buttonVariants({ size: "sm" })}>Pagar agora</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="historico" className="flex flex-col gap-3">
        <h2 id="historico" className="font-semibold text-foreground">
          Histórico de pagamentos
        </h2>
        {transactions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma cobrança ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Vencimento</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Valor</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Forma</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Pago em</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((t) => {
                  const s = TRANSACTION_STATUS[t.status]
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-foreground">{formatDate(t.dueDate ?? t.createdAt)}</td>
                      <td className="px-4 py-3 text-foreground">{formatCents(t.amountCents)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.paymentMethod ? (PAYMENT_METHOD_LABEL[t.paymentMethod] ?? t.paymentMethod) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.paidAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOwner && !isBillingExempt && sub && contracted && !sub.cancelAtPeriodEnd && (
        <section aria-labelledby="cancelar" className="flex flex-col gap-3 rounded-xl border p-5">
          <h2 id="cancelar" className="font-semibold text-foreground">
            Cancelar assinatura
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {sub.status === "active" && sub.currentPeriodEnd
              ? `Novas cobranças param imediatamente. Você continua com acesso até ${formatDate(sub.currentPeriodEnd)}.`
              : scheduledFirstCharge
                ? "A primeira cobrança agendada para o fim do teste não será gerada."
                : "Novas cobranças param imediatamente e a cobrança em aberto é cancelada."}
          </p>
          <BillingForm
            action={cancelOwnAction}
            hidden={{ mode: "period_end" }}
            submitLabel="Cancelar assinatura"
            variant="destructive"
            confirm="Tem certeza que deseja cancelar a assinatura?"
          >
            <label className="flex max-w-md flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Motivo (opcional)</span>
              <input
                name="reason"
                maxLength={300}
                className="rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </label>
          </BillingForm>
        </section>
      )}
    </>
  )
}
