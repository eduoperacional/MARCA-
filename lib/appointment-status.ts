import type { AppointmentStatus, PaymentMethod } from "@/lib/types"

export const APPOINTMENT_STATUS: Record<
  AppointmentStatus,
  { label: string; badgeClass: string; dotClass: string; color: string }
> = {
  pending: {
    label: "Pendente",
    badgeClass: "bg-warning/10 text-warning",
    dotClass: "bg-warning",
    color: "var(--warning)",
  },
  confirmed: {
    label: "Confirmado",
    badgeClass: "bg-success/10 text-success",
    dotClass: "bg-success",
    color: "var(--success)",
  },
  in_progress: {
    label: "Em atendimento",
    badgeClass: "bg-brand-light/12 text-brand-light",
    dotClass: "bg-brand-light",
    color: "var(--brand-light)",
  },
  completed: {
    label: "Concluído",
    badgeClass: "bg-primary/15 text-brand-light",
    dotClass: "bg-primary",
    color: "var(--brand)",
  },
  cancelled: {
    label: "Cancelado",
    badgeClass: "bg-destructive/10 text-destructive",
    dotClass: "bg-destructive",
    color: "var(--destructive)",
  },
  no_show: {
    label: "Não compareceu",
    badgeClass: "bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground",
    color: "var(--muted-foreground)",
  },
}

export const APPOINTMENT_STATUS_ORDER: AppointmentStatus[] = [
  "completed",
  "confirmed",
  "in_progress",
  "pending",
  "cancelled",
  "no_show",
]

/** Status que ocupam a agenda (bloqueiam o horário do profissional). */
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
]

/** Transições permitidas a partir de cada status. */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "in_progress", "cancelled", "no_show"],
  confirmed: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["pending"],
  no_show: ["pending"],
}

export const STATUS_ACTION_LABEL: Partial<Record<AppointmentStatus, string>> = {
  pending: "Reabrir agendamento",
  confirmed: "Confirmar",
  in_progress: "Iniciar atendimento",
  completed: "Concluir atendimento",
  cancelled: "Cancelar",
  no_show: "Marcar não comparecimento",
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Cartão de débito" },
  { value: "credit", label: "Cartão de crédito" },
  { value: "other", label: "Outro" },
]

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHODS.map((method) => [method.value, method.label])
) as Record<PaymentMethod, string>
