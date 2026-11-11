import type { AppointmentStatus } from "@/lib/types"

export const APPOINTMENT_STATUS: Record<
  AppointmentStatus,
  { label: string; badgeClass: string; dotClass: string; color: string }
> = {
  confirmed: {
    label: "Confirmado",
    badgeClass: "bg-success/10 text-success",
    dotClass: "bg-success",
    color: "var(--success)",
  },
  pending: {
    label: "Aguardando confirmação",
    badgeClass: "bg-warning/10 text-warning",
    dotClass: "bg-warning",
    color: "var(--warning)",
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
}

export const APPOINTMENT_STATUS_ORDER: AppointmentStatus[] = [
  "completed",
  "confirmed",
  "in_progress",
  "pending",
  "cancelled",
]
