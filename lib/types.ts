export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"

export type PaymentMethod = "cash" | "pix" | "debit" | "credit" | "other"

/** Jornada de um dia da semana (0 = domingo). Horários no formato HH:mm. */
export interface DaySchedule {
  weekday: number
  active: boolean
  start: string
  end: string
  breakStart?: string | null
  breakEnd?: string | null
}

export interface Professional {
  id: string
  name: string
  role: string
}

export interface Service {
  id: string
  name: string
  price: number
  durationMin: number
}

/** Agendamento já resolvido para exibição (horários locais HH:mm). */
export interface Appointment {
  id: string
  date: string
  start: string
  end: string
  startsAt: string
  endsAt: string
  clientId: string
  clientName: string
  clientPhone: string
  service: Pick<Service, "id" | "name" | "price" | "durationMin">
  professional: Pick<Professional, "id" | "name"> & { color: string }
  status: AppointmentStatus
  price: number
  paidAmount: number
  paymentMethod: PaymentMethod | null
  notes: string | null
  source: "admin" | "online"
}

export type PeriodKey = "today" | "7d" | "30d" | "month" | "custom"

export interface DateRange {
  from: Date
  to: Date
}

export type MetricFormat = "number" | "currency" | "percent"

export type KpiId =
  | "appointments"
  | "completed"
  | "revenue"
  | "clients"
  | "occupancy"
  | "cancellations"

export interface KpiMetric {
  id: KpiId
  label: string
  value: number
  previous: number
  format: MetricFormat
  /** Quando true, uma queda é positiva (ex.: cancelamentos). */
  lowerIsBetter?: boolean
}

export interface SeriesPoint {
  key: string
  label: string
  fullLabel: string
}

export interface RevenuePoint extends SeriesPoint {
  current: number | null
  previous: number
}

export interface AppointmentsPoint extends SeriesPoint {
  scheduled: number
  completed: number
}

export interface StatusSlice {
  status: AppointmentStatus
  count: number
}

export interface PerformanceSummary {
  topService: { name: string; count: number; revenue: number } | null
  topProfessional: { name: string; role: string; count: number; share: number } | null
  peakHour: { label: string; share: number } | null
  averageTicket: { value: number; previous: number }
}

export interface DashboardData {
  range: DateRange
  granularity: "hour" | "day"
  kpis: KpiMetric[]
  revenueSeries: RevenuePoint[]
  appointmentsSeries: AppointmentsPoint[]
  statusDistribution: StatusSlice[]
  summary: PerformanceSummary
}
