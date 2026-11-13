"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, CalendarPlus, Cake, Mail, Pencil, Phone, Trash2 } from "lucide-react"

import { deleteClient } from "@/app/actions/catalog"
import { ClientDialog } from "@/components/clients/client-dialog"
import { AppointmentActions } from "@/components/shared/appointment-actions"
import { AppointmentDialog } from "@/components/shared/appointment-dialog"
import { StatusBadge } from "@/components/shared/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useServerAction } from "@/hooks/use-server-action"
import { formatCurrency, getInitials } from "@/lib/format"
import type { ClientItem } from "@/lib/queries/clients"
import type { FormOptions } from "@/lib/queries/options"
import { dateFromLocal } from "@/lib/time"
import type { Appointment } from "@/lib/types"

export function ClientProfile({ client, history, options }: { client: ClientItem; history: Appointment[]; options: FormOptions }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { pending, run } = useServerAction()

  const completed = history.filter((a) => a.status === "completed")
  const cancelled = history.filter((a) => a.status === "cancelled" || a.status === "no_show").length
  const serviceCounts = new Map<string, number>()
  for (const a of completed) serviceCounts.set(a.service.name, (serviceCounts.get(a.service.name) ?? 0) + 1)
  const topServices = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  const stats = [
    { label: "Visitas", value: String(client.visits) },
    { label: "Total gasto", value: formatCurrency(client.totalSpent) },
    { label: "Ticket médio", value: formatCurrency(client.visits ? client.totalSpent / client.visits : 0) },
    { label: "Cancelamentos / faltas", value: String(cancelled) },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" render={<Link href="/painel/clientes" />} nativeButton={false}>
        <ArrowLeft data-icon="inline-start" />
        Clientes
      </Button>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary/15 text-lg text-brand-light">{getInitials(client.name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{client.name}</h1>
            <p className="text-sm text-muted-foreground">
              Cliente desde {format(new Date(client.createdAt), "MMMM 'de' yyyy", { locale: ptBR })}
              {client.daysSinceLastVisit !== null && ` · última visita há ${client.daysSinceLastVisit} dias`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} aria-label="Excluir cliente">
            <Trash2 />
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil data-icon="inline-start" />
            Editar
          </Button>
          <Button onClick={() => setBookOpen(true)}>
            <CalendarPlus data-icon="inline-start" />
            Agendar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 py-4">
            <CardContent className="flex flex-col gap-1 px-4">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="font-heading text-xl font-semibold tabular-nums">{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Dados</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <a href={`tel:${client.phone.replace(/\D/g, "")}`} className="flex items-center gap-2 hover:underline">
                <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                {client.phone}
              </a>
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                {client.email ?? <span className="text-muted-foreground">Sem e-mail</span>}
              </span>
              <span className="flex items-center gap-2">
                <Cake className="size-4 text-muted-foreground" aria-hidden="true" />
                {client.birthDate ? (
                  format(dateFromLocal(client.birthDate), "d 'de' MMMM", { locale: ptBR })
                ) : (
                  <span className="text-muted-foreground">Sem data de nascimento</span>
                )}
              </span>
              {client.notes && <p className="rounded-md bg-muted p-3 text-muted-foreground">{client.notes}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Serviços realizados</CardTitle>
              <CardDescription>Mais frequentes</CardDescription>
            </CardHeader>
            <CardContent>
              {topServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum atendimento concluído ainda.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {topServices.map(([name, count]) => (
                    <li key={name} className="flex items-center justify-between">
                      <span>{name}</span>
                      <span className="tabular-nums text-muted-foreground">{count}x</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading">Histórico de agendamentos</CardTitle>
            <CardDescription>{history.length} registros</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agendamento para este cliente.</p>
            ) : (
              <ol className="flex flex-col divide-y">
                {history.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex w-20 shrink-0 flex-col tabular-nums">
                      <span className="text-sm font-medium">{format(dateFromLocal(a.date), "dd/MM/yy")}</span>
                      <span className="text-xs text-muted-foreground">{a.start}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{a.service.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{a.professional.name}</span>
                    </div>
                    <span className="hidden text-sm tabular-nums sm:block">{formatCurrency(a.price)}</span>
                    <StatusBadge status={a.status} />
                    <AppointmentActions appointment={a} options={options} />
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <ClientDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
      <AppointmentDialog open={bookOpen} onOpenChange={setBookOpen} options={options} defaults={{ clientId: client.id }} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Só é possível excluir clientes sem histórico de agendamentos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteClient(client.id), "Cliente excluído.", () => router.push("/painel/clientes"))}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
