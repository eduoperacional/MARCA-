import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { addNoteAction, partnerBenefitAction, reactivateBusinessAction, suspendBusinessAction } from "@/app/actions/admin"
import { AdminActionForm, AdminField, adminFieldClass } from "@/components/admin/admin-action-form"
import { KpiCard, SectionCard } from "@/components/admin/kpi-card"
import { PageHeader } from "@/components/admin/period-tabs"
import { ToneBadge } from "@/components/admin/tone-badge"
import { requireAdmin } from "@/lib/admin/auth"
import { AUDIT_ACTION_LABEL, INTERVAL_LABEL, SUBSCRIPTION_STATUS, TRANSACTION_STATUS } from "@/lib/admin/labels"
import { getBusinessDetail } from "@/lib/admin/queries"
import { formatCents, formatDate, formatDateTime, formatNumber } from "@/lib/format"

export const metadata: Metadata = { title: "Estabelecimento" }

export default async function BusinessDetailPage({ params }: PageProps<"/admin/estabelecimentos/[id]">) {
  const admin = await requireAdmin("businesses.view")
  const { id } = await params
  const detail = await getBusinessDetail(id)
  if (!detail) notFound()
  const { business, owner, suspension, subscriptions, transactions, notes, audit, stats } = detail
  const current = subscriptions[0]

  return (
    <>
      <PageHeader
        title={business.displayName || business.name}
        description={`/${business.slug} · cadastrado em ${formatDate(business.createdAt)}`}
        actions={
          <Link href="/admin/estabelecimentos" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar para a lista
          </Link>
        }
      />

      {suspension && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Acesso bloqueado desde {formatDateTime(suspension.suspendedAt)}. Motivo: {suspension.reason}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Usuários da equipe" value={formatNumber(stats.members)} />
        <KpiCard label="Profissionais" value={formatNumber(stats.professionals)} />
        <KpiCard label="Agendamentos (30 dias)" value={formatNumber(stats.appointments_30d)} />
        <KpiCard label="Último acesso" value={formatDateTime(stats.last_access)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Dados do estabelecimento">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Responsável</dt>
            <dd>{owner ? `${owner.name} (${owner.email})` : "—"}</dd>
            <dt className="text-muted-foreground">Telefone</dt>
            <dd>{business.phone ?? owner?.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">Segmento</dt>
            <dd>{business.segment ?? "—"}</dd>
            <dt className="text-muted-foreground">Cidade</dt>
            <dd>{[business.city, business.state].filter(Boolean).join(" / ") || "—"}</dd>
            <dt className="text-muted-foreground">Onboarding</dt>
            <dd>{business.onboardingCompletedAt ? `Concluído em ${formatDate(business.onboardingCompletedAt)}` : "Incompleto"}</dd>
          </dl>
        </SectionCard>

        <SectionCard
          title="Assinatura atual"
          actions={
            current ? (
              <Link href={`/admin/assinaturas/${current.sub.id}`} className="text-sm text-brand-light hover:underline">
                Gerenciar
              </Link>
            ) : null
          }
        >
          {current ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Plano</dt>
              <dd>
                {current.planName ?? "—"} · {formatCents(current.sub.priceCents)} / {INTERVAL_LABEL[current.sub.billingInterval].toLowerCase()}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <ToneBadge tone={SUBSCRIPTION_STATUS[current.sub.status].tone}>{SUBSCRIPTION_STATUS[current.sub.status].label}</ToneBadge>
              </dd>
              <dt className="text-muted-foreground">Trial até</dt>
              <dd>{formatDate(current.sub.trialEndsAt)}</dd>
              <dt className="text-muted-foreground">Próxima renovação</dt>
              <dd>{formatDate(current.sub.currentPeriodEnd)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Este estabelecimento ainda não assinou nenhum plano.</p>
          )}
        </SectionCard>
      </div>

      {admin.can("businesses.manage") && (
        <SectionCard
          title="Benefício de parceiro PRO"
          description="Parceiro de divulgação recebe os recursos e limites do plano PRO vigente, sem criar assinatura recorrente. Para preservar clientes pagantes, a concessão é recusada enquanto houver assinatura ativa ou cancelamento pendente."
        >
          {business.partnerBenefitActive ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm text-foreground">
                Ativo desde {formatDateTime(business.partnerBenefitGrantedAt)} · categoria: parceiro de divulgação
              </p>
              <AdminActionForm
                action={partnerBenefitAction}
                hidden={{ businessId: business.id, mode: "revoke" }}
                submitLabel="Revogar benefício PRO"
                destructive
                confirm="Revogar o benefício PRO? O estabelecimento voltará às regras normais de assinatura e cobrança."
              >
                <AdminField label="Motivo da revogação">
                  <textarea name="reason" required minLength={5} maxLength={500} rows={2} className={adminFieldClass} />
                </AdminField>
              </AdminActionForm>
            </div>
          ) : (
            <AdminActionForm
              action={partnerBenefitAction}
              hidden={{ businessId: business.id, mode: "grant" }}
              submitLabel="Conceder acesso PRO"
              confirm="Conceder acesso PRO permanente enquanto durar a parceria? Nenhuma assinatura ou cobrança existente será alterada."
            >
              <AdminField label="Motivo da concessão">
                <textarea name="reason" required minLength={5} maxLength={500} rows={2} className={adminFieldClass} />
              </AdminField>
            </AdminActionForm>
          )}
        </SectionCard>
      )}

      <SectionCard title="Pagamentos" description="Últimas 20 cobranças recebidas do Asaas.">
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
        ) : (
          <ul className="divide-y text-sm">
            {transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{formatDateTime(t.paidAt ?? t.createdAt)}</span>
                <span className="font-medium">{formatCents(t.amountCents)}</span>
                <ToneBadge tone={TRANSACTION_STATUS[t.status].tone}>{TRANSACTION_STATUS[t.status].label}</ToneBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {admin.can("businesses.manage") && (
          <SectionCard
            title={suspension ? "Reativar acesso" : "Bloquear acesso"}
            description={
              suspension
                ? "Libera o painel do estabelecimento novamente."
                : "A equipe deixa de acessar o painel até a reativação. Agendamentos já feitos não são apagados."
            }
          >
            {suspension ? (
              <AdminActionForm action={reactivateBusinessAction} hidden={{ businessId: business.id }} submitLabel="Reativar acesso">
                <AdminField label="Observação (opcional)">
                  <input name="reason" maxLength={500} className={adminFieldClass} />
                </AdminField>
              </AdminActionForm>
            ) : (
              <AdminActionForm
                action={suspendBusinessAction}
                hidden={{ businessId: business.id }}
                submitLabel="Bloquear acesso"
                destructive
                confirm="Bloquear o acesso deste estabelecimento?"
              >
                <AdminField label="Motivo">
                  <textarea name="reason" required minLength={5} maxLength={500} rows={2} className={adminFieldClass} />
                </AdminField>
              </AdminActionForm>
            )}
          </SectionCard>
        )}

        <SectionCard title="Observações internas" description="Visíveis apenas para a equipe da MARCAÍ.">
          {admin.can("notes.write") && (
            <AdminActionForm action={addNoteAction} hidden={{ businessId: business.id }} submitLabel="Adicionar observação">
              <AdminField label="Nova observação">
                <textarea name="body" required maxLength={2000} rows={2} className={adminFieldClass} />
              </AdminField>
            </AdminActionForm>
          )}
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {notes.length === 0 && <li className="text-muted-foreground">Nenhuma observação.</li>}
            {notes.map(({ note, author }) => (
              <li key={note.id} className="rounded-lg border bg-background/40 p-3">
                <p className="leading-relaxed whitespace-pre-wrap">{note.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {author ?? "Admin"} · {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Histórico administrativo">
        <ul className="divide-y text-sm">
          {audit.length === 0 && <li className="py-2 text-muted-foreground">Nenhuma ação registrada.</li>}
          {audit.map((entry) => (
            <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                {entry.reason ? ` — ${entry.reason}` : ""}
              </span>
              <span className="text-muted-foreground">
                {entry.actorEmail} · {formatDateTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  )
}
