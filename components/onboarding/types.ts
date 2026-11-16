import type { DaySchedule } from "@/lib/types"

export interface WizardBusiness {
  name: string
  segment: string
  phone: string
  address: string
  city: string
  state: string
  displayName: string
  primaryColor: string
  logoUrl: string | null
  description: string
  slug: string
  coverUrl: string | null
  openingHours: DaySchedule[]
  slotIntervalMin: number
  minAdvanceMin: number
  onlineBookingEnabled: boolean
}

export interface WizardService {
  id: string
  name: string
  category: string
  price: number
  durationMin: number
  active: boolean
}

export interface WizardProfessional {
  id: string
  name: string
  specialties: string | null
  active: boolean
  serviceIds: string[]
  workDays: number
}
