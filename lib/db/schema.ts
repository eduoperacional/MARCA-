import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import type { AppointmentStatus, DaySchedule, PaymentMethod } from "@/lib/types"

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow()

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  segment: text("segment"),
  phone: text("phone"),
  address: text("address"),
  openingHours: jsonb("opening_hours").$type<DaySchedule[]>().notNull(),
  slotIntervalMin: integer("slot_interval_min").notNull().default(15),
  onlineBookingEnabled: boolean("online_booking_enabled").notNull().default(true),
  minAdvanceMin: integer("min_advance_min").notNull().default(60),
  createdAt: createdAt(),
})

export const professionals = pgTable("professionals", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  phone: text("phone"),
  email: text("email"),
  specialties: text("specialties"),
  color: text("color").notNull().default("#7B3FF2"),
  workSchedule: jsonb("work_schedule").$type<DaySchedule[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
})

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Geral"),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  durationMin: integer("duration_min").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
})

export const professionalServices = pgTable(
  "professional_services",
  {
    professionalId: uuid("professional_id").notNull(),
    serviceId: uuid("service_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.professionalId, table.serviceId] })]
)

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  phoneNormalized: text("phone_normalized").notNull(),
  email: text("email"),
  birthDate: date("birth_date"),
  notes: text("notes"),
  createdAt: createdAt(),
})

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  clientId: uuid("client_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  professionalId: uuid("professional_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  paymentMethod: text("payment_method").$type<PaymentMethod>(),
  status: text("status").$type<AppointmentStatus>().notNull().default("pending"),
  notes: text("notes"),
  source: text("source").$type<"admin" | "online">().notNull().default("admin"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  appointmentId: uuid("appointment_id"),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").$type<PaymentMethod>().notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  createdAt: createdAt(),
})

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("Outros"),
  amountCents: integer("amount_cents").notNull(),
  date: date("date").notNull(),
  createdAt: createdAt(),
})

export const timeBlocks = pgTable("time_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  professionalId: uuid("professional_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
})

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  appointmentId: uuid("appointment_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
})

export type BusinessRow = typeof businesses.$inferSelect
export type ProfessionalRow = typeof professionals.$inferSelect
export type ServiceRow = typeof services.$inferSelect
export type ClientRow = typeof clients.$inferSelect
export type AppointmentRow = typeof appointments.$inferSelect
export type PaymentRow = typeof payments.$inferSelect
export type ExpenseRow = typeof expenses.$inferSelect
export type TimeBlockRow = typeof timeBlocks.$inferSelect
export type NotificationRow = typeof notifications.$inferSelect
