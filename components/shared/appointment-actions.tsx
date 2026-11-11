"use client"

import { useState } from "react"
import { Banknote, CalendarClock, Check, CircleSlash, MoreHorizontal, Play, RotateCcw, X } from "lucide-react"

import { registerPayment, updateAppointmentStatus } from "@/app/actions/appointments"
import { AppointmentDialog } from "@/components/shared/appointment-dialog"
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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useServerAction } from "@/hooks/use-server-action"
import { PAYMENT_METHODS, STATUS_ACTION_LABEL, STATUS_TRANSITIONS } from "@/lib/appointment-status"
import { formatCurrency } from "@/lib/format"
import type { FormOptions } from "@/lib/queries/options"
import type { Appointment, AppointmentStatus, PaymentMethod } from "@/lib/types"

const STATUS_ICON: Partial<Record<AppointmentStatus, typeof Check>> = {
  pending: RotateCcw,
  confirmed: Check,
  in_progress: Play,
  completed: Check,
  cancelled: X,
  no_show: CircleSlash,
}

export function AppointmentActions({
  appointment,
  options,
  triggerClassName,
}: {
  appointment: Appointment
  options: FormOptions
  triggerClassName?: string
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [paymentMode, setPaymentMode] = useState<"complete" | "register" | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { pending, run } = useServerAction()

  const transitions = STATUS_TRANSITIONS[appointment.status]
  const balance = Math.max(0, appointment.price - appointment.paidAmount)
  const canEdit = ["pending", "confirmed"].includes(appointment.status)

  function changeStatus(status: AppointmentStatus) {
    if (status === "completed") return setPaymentMode("complete")
    if (status === "cancelled") return setConfirmCancel(true)
    run(() => updateAppointmentStatus(appointment.id, status), "Status atualizado.")
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className={triggerClassName}
              aria-label={`Ações do agendamento de ${appointment.clientName}`}
              disabled={pending}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            {transitions.map((status) => {
              const Icon = STATUS_ICON[status] ?? Check
              return (
                <DropdownMenuItem
                  key={status}
                  onClick={() => changeStatus(status)}
                  variant={status === "cancelled" ? "destructive" : "default"}
                >
                  <Icon />
                  {STATUS_ACTION_LABEL[status]}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          {(canEdit || (appointment.status === "completed" && balance > 0)) && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            {canEdit && (
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <CalendarClock />
                Editar ou reagendar
              </DropdownMenuItem>
            )}
            {appointment.status === "completed" && balance > 0 && (
              <DropdownMenuItem onClick={() => setPaymentMode("register")}>
                <Banknote />
                Registrar pagamento
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AppointmentDialog open={editOpen} onOpenChange={setEditOpen} options={options} appointment={appointment} />

      <PaymentDialog
        mode={paymentMode}
        appointment={appointment}
        onClose={() => setPaymentMode(null)}
      />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O horário de {appointment.clientName} ({appointment.start}) será liberado na agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run(() => updateAppointmentStatus(appointment.id, "cancelled"), "Agendamento cancelado.")}
            >
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function PaymentDialog({
  mode,
  appointment,
  onClose,
}: {
  mode: "complete" | "register" | null
  appointment: Appointment
  onClose: () => void
}) {
  const balance = Math.max(0, appointment.price - appointment.paidAmount)
  const [method, setMethod] = useState<PaymentMethod>(appointment.paymentMethod ?? "pix")
  const [amount, setAmount] = useState(String(balance))
  const { pending, run } = useServerAction()
  const methodItems = PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))

  const parsed = Number(amount.replace(",", "."))
  const valid = Number.isFinite(parsed) && parsed > 0

  function confirm(withPayment: boolean) {
    const payment = withPayment ? { method, amount: parsed } : null
    if (mode === "complete") {
      run(() => updateAppointmentStatus(appointment.id, "completed", payment), "Atendimento concluído.", onClose)
    } else if (payment) {
      run(() => registerPayment(appointment.id, payment.method, payment.amount), "Pagamento registrado.", onClose)
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "complete" ? "Concluir atendimento" : "Registrar pagamento"}</DialogTitle>
          <DialogDescription>
            {appointment.clientName} · {appointment.service.name} · {formatCurrency(appointment.price, true)}
            {appointment.paidAmount > 0 && ` (já pago ${formatCurrency(appointment.paidAmount, true)})`}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Forma de pagamento</FieldLabel>
              <Select items={methodItems} value={method} onValueChange={(v) => v && setMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-full" aria-label="Forma de pagamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {methodItems.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-amount">Valor recebido (R$)</FieldLabel>
              <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          {mode === "complete" && (
            <Button variant="ghost" onClick={() => confirm(false)} disabled={pending}>
              Concluir sem pagamento
            </Button>
          )}
          <Button onClick={() => confirm(true)} disabled={pending || !valid}>
            {mode === "complete" ? "Concluir e receber" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
