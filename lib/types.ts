export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"

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

export interface Appointment {
  id: string
  start: string
  end: string
  clientName: string
  service: Pick<Service, "id" | "name" | "price" | "durationMin">
  professional: Pick<Professional, "id" | "name">
  status: AppointmentStatus
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
  topService: { name: string; count: number; revenue: number }
  topProfessional: { name: string; role: string; count: number; share: number }
  peakHour: { label: string; share: number }
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
