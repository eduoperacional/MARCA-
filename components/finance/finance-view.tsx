"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Plus, Trash2 } from "lucide-react"

import { createExpense, deleteExpense } from "@/app/actions/operations"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { PageHeader } from "@/components/layout/page-header"
import { AppointmentActions } from "@/components/shared/appointment-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useServerAction } from "@/hooks/use-server-action"
import { PAYMENT_METHOD_LABEL } from "@/lib/appointment-status"
import { formatCurrency } from "@/lib/format"
import type { PeriodSelection } from "@/lib/period"
import type { getFinanceOverview } from "@/lib/queries/finance"
import type { FormOptions } from "@/lib/queries/options"
import { dateFromLocal } from "@/lib/time"
import { cn } from "@/lib/utils"

type FinanceOverview = Awaited<ReturnType<typeof getFinanceOverview>>

export function FinanceView({
  overview,
  selection,
  today,
  options,
}: {
  overview: FinanceOverview
  selection: PeriodSelection
  today: string
  options: FormOptions
}) {
  const [expenseOpen, setExpenseOpen] = useState(false)

  const kpis = [
    { label: "Recebido", value: overview.received, hint: "Pagamentos registrados", tone: "text-success" },
    { label: "A receber", value: overview.pending, hint: `${overview.pendingPayments.length} atendimentos sem pagamento`, tone: overview.pending > 0 ? "text-warning" : "" },
    { label: "Faturamento previsto", value: overview.forecast, hint: "Realizado + agendado no período" },
    { label: "Despesas", value: overview.expenses, hint: `${overview.expenseItems.length} lançamentos` },
    { label: "Lucro estimado", value: overview.profit, hint: "Recebido − despesas", tone: overview.profit < 0 ? "text-destructive" : "" },
    { label: "Ticket médio", value: overview.averageTicket, hint: "Por atendimento concluído" },
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Financeiro"
        description="Entradas, pendências e despesas do seu negócio."
        actions={
          <Button onClick={() => setExpenseOpen(true)}>
            <Plus data-icon="inline-start" />
            Nova despesa
          </Button>
        }
      />
      <PeriodFilter selection={selection} today={today} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardContent className="flex flex-col gap-1 px-4">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className={cn("font-heading text-xl font-semibold tabular-nums", k.tone)}>{formatCurrency(k.value)}</span>
              <span className="text-xs text-muted-foreground">{k.hint}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Tabs defaultValue={overview.pendingPayments.length ? "pending" : "payments"} className="gap-4">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="font-heading">Movimentações</CardTitle>
              <TabsList>
                <TabsTrigger value="pending">A receber ({overview.pendingPayments.length})</TabsTrigger>
                <TabsTrigger value="payments">Recebidos</TabsTrigger>
                <TabsTrigger value="expenses">Despesas</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="pending">
                {overview.pendingPayments.length === 0 ? (
                  <EmptyLine text="Nenhum atendimento concluído aguardando pagamento." />
                ) : (
                  <ul className="flex flex-col divide-y">
                    {overview.pendingPayments.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{a.clientName}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {a.service.name} · {format(dateFromLocal(a.date), "dd/MM")} {a.start} · {a.professional.name}
                          </span>
                        </div>
                        <span className="text-sm font-medium tabular-nums text-warning">{formatCurrency(a.price - a.paidAmount, true)}</span>
                        <AppointmentActions appointment={a} options={options} />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="payments">
                {overview.payments.length === 0 ? (
                  <EmptyLine text="Nenhum pagamento no período." />
                ) : (
                  <ul className="flex flex-col divide-y">
                    {overview.payments.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{p.clientName ?? "Pagamento avulso"}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {p.serviceName ?? "—"} · {format(new Date(p.paidAt), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{PAYMENT_METHOD_LABEL[p.method]}</span>
                        <span className="w-24 text-right text-sm font-medium tabular-nums text-success">{formatCurrency(p.amount, true)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="expenses">
                {overview.expenseItems.length === 0 ? (
                  <EmptyLine text="Nenhuma despesa no período." />
                ) : (
                  <ul className="flex flex-col divide-y">
                    {overview.expenseItems.map((e) => (
                      <ExpenseRow key={e.id} expense={e} />
                    ))}
                  </ul>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Formas de pagamento</CardTitle>
            <CardDescription>Distribuição do valor recebido</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.byMethod.length === 0 ? (
              <EmptyLine text="Sem pagamentos no período." />
            ) : (
              <ul className="flex flex-col gap-4">
                {overview.byMethod.map((m) => {
                  const share = overview.received ? (m.amount / overview.received) * 100 : 0
                  return (
                    <li key={m.method} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span>{PAYMENT_METHOD_LABEL[m.method]}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(m.amount)} · {Math.round(share)}%
                        </span>
                      </div>
                      <Progress value={share} aria-label={`${PAYMENT_METHOD_LABEL[m.method]}: ${Math.round(share)}%`} />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} today={today} />
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
}

function ExpenseRow({ expense: e }: { expense: FinanceOverview["expenseItems"][number] }) {
  const { pending, run } = useServerAction()
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{e.description}</span>
        <span className="truncate text-xs text-muted-foreground">
          {e.category} · {format(dateFromLocal(e.date), "dd/MM/yyyy")}
        </span>
      </div>
      <span className="text-sm font-medium tabular-nums">{formatCurrency(e.amount, true)}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Excluir despesa ${e.description}`}
        onClick={() => run(() => deleteExpense(e.id), "Despesa excluída.")}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

const EXPENSE_CATEGORIES = ["Aluguel", "Produtos", "Contas", "Salários", "Marketing", "Manutenção", "Outros"]

function ExpenseDialog({ open, onOpenChange, today }: { open: boolean; onOpenChange: (open: boolean) => void; today: string }) {
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("Produtos")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today)
  const { pending, run } = useServerAction()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            run(
              () => createExpense({ description, category, amount: Number(amount.replace(",", ".")), date }),
              "Despesa registrada.",
              () => {
                setDescription("")
                setAmount("")
                onOpenChange(false)
              }
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Nova despesa</DialogTitle>
            <DialogDescription>Registre gastos para acompanhar o lucro estimado.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="exp-description">Descrição</FieldLabel>
              <Input id="exp-description" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-category">Categoria</FieldLabel>
              <Input id="exp-category" list="exp-categories" value={category} onChange={(e) => setCategory(e.target.value)} required />
              <datalist id="exp-categories">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="exp-amount">Valor (R$)</FieldLabel>
                <Input id="exp-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="exp-date">Data</FieldLabel>
                <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
