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

import type { MemberRole, Permission } from "@/lib/permissions"
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
  displayName: text("display_name"),
  description: text("description"),
  city: text("city"),
  state: text("state"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  primaryColor: text("primary_color").notNull().default("#7B3FF2"),
  ownerUserId: text("owner_user_id"),
  onboardingStep: integer("onboarding_step").notNull().default(1),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  billingExempt: boolean("billing_exempt").notNull().default(false),
  partnerBenefitActive: boolean("partner_benefit_active").notNull().default(false),
  partnerBenefitCategory: text("partner_benefit_category"),
  partnerBenefitGrantedBy: text("partner_benefit_granted_by"),
  partnerBenefitGrantedAt: timestamp("partner_benefit_granted_at", { withTimezone: true }),
  partnerBenefitRevokedBy: text("partner_benefit_revoked_by"),
  partnerBenefitRevokedAt: timestamp("partner_benefit_revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
})

/** Endereços públicos usados anteriormente, mantidos para não quebrar links antigos (script 018). */
export const businessSlugHistory = pgTable("business_slug_history", {
  slug: text("slug").primaryKey(),
  businessId: uuid("business_id").notNull(),
  createdAt: createdAt(),
})

/** Progresso da configuração inicial (script 014). */
export const businessOnboarding = pgTable("business_onboarding", {
  businessId: uuid("business_id").primaryKey(),
  mode: text("mode").$type<"guided" | "manual">().notNull().default("guided"),
  reviewedSteps: text("reviewed_steps").array().notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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

/** Preferências de notificação por WhatsApp do proprietário, uma linha por estabelecimento (script 015). */
export const businessWhatsappSettings = pgTable("business_whatsapp_settings", {
  businessId: uuid("business_id").primaryKey(),
  /** DDD + número, só dígitos, sem o 55 (normalizeWhatsappPhone). */
  phone: text("phone"),
  enabled: boolean("enabled").notNull().default(false),
  /** Momento em que o proprietário ativou voluntariamente o envio. Sem ele, nada é enviado. */
  consentAt: timestamp("consent_at", { withTimezone: true }),
  notifyNewBooking: boolean("notify_new_booking").notNull().default(true),
  notifyCancellation: boolean("notify_cancellation").notNull().default(true),
  notifyReschedule: boolean("notify_reschedule").notNull().default(true),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestStatus: text("last_test_status"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Fila de envio por WhatsApp e histórico de entregas (script 015). */
export const whatsappDeliveries = pgTable("whatsapp_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  appointmentId: uuid("appointment_id"),
  event: text("event").$type<"new_booking" | "cancellation" | "reschedule" | "test">().notNull(),
  /** Destino no formato da API: 55 + DDD + número. */
  toPhone: text("to_phone").notNull(),
  params: jsonb("params").$type<string[]>().notNull().default([]),
  dedupeKey: text("dedupe_key"),
  status: text("status").$type<"pending" | "processing" | "sent" | "failed" | "skipped">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/* ---------------------------- Notificações push (script 017) ---------------------------- */

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: text("revoked_reason"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const pushPreferences = pgTable(
  "push_preferences",
  {
    businessId: uuid("business_id").notNull(),
    userId: text("user_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sound: boolean("sound").notNull().default(true),
    notifyNewBooking: boolean("notify_new_booking").notNull().default(true),
    notifyCancellation: boolean("notify_cancellation").notNull().default(true),
    notifyReschedule: boolean("notify_reschedule").notNull().default(true),
    notifyReminder: boolean("notify_reminder").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.businessId, table.userId] })]
)

export const businessPushSettings = pgTable("business_push_settings", {
  businessId: uuid("business_id").primaryKey(),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  reminderLeadMin: integer("reminder_lead_min").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const pushDeliveries = pgTable("push_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  appointmentId: uuid("appointment_id"),
  event: text("event").$type<"new_booking" | "cancellation" | "reschedule" | "reminder" | "test">().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").$type<"pending" | "processing" | "sent" | "failed" | "skipped">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------- Contas, equipe e convites ------------------------ */

/** Tabela de usuários do Better Auth (somente leitura pelo app; escrita via Better Auth). */
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  phone: text("phone"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
})

export const businessMembers = pgTable("business_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").$type<MemberRole>().notNull(),
  permissions: jsonb("permissions").$type<Permission[]>().notNull().default([]),
  professionalId: uuid("professional_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
})

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  email: text("email").notNull(),
  role: text("role").$type<MemberRole>().notNull(),
  permissions: jsonb("permissions").$type<Permission[]>().notNull().default([]),
  professionalId: uuid("professional_id"),
  tokenHash: text("token_hash").notNull(),
  invitedBy: text("invited_by").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
})

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  notifyNewBooking: boolean("notify_new_booking").notNull().default(true),
  notifyCancellation: boolean("notify_cancellation").notNull().default(true),
  weeklySummary: boolean("weekly_summary").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const appRateLimits = pgTable("app_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
})

export type MemberRow = typeof businessMembers.$inferSelect
export type InvitationRow = typeof invitations.$inferSelect
export type BusinessRow = typeof businesses.$inferSelect
export type ProfessionalRow = typeof professionals.$inferSelect
export type ServiceRow = typeof services.$inferSelect
export type ClientRow = typeof clients.$inferSelect
export type AppointmentRow = typeof appointments.$inferSelect
export type PaymentRow = typeof payments.$inferSelect
export type ExpenseRow = typeof expenses.$inferSelect
export type TimeBlockRow = typeof timeBlocks.$inferSelect
export type NotificationRow = typeof notifications.$inferSelect

/* ---------- Plataforma (super admin) ---------- */

export type PlanLimits = Partial<Record<"professionals" | "services" | "members", number>>
export type BillingInterval = "month" | "year"
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "awaiting_payment"
  | "payment_pending"
  | "past_due"
  | "canceled"
  | "expired"
  | "suspended"
export type TransactionStatus = "approved" | "pending" | "declined" | "charged_back" | "refunded"
export type AdminRole = "super_admin" | "admin" | "finance" | "support"

/** Sessões do Better Auth (somente leitura: último acesso). */
export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
})

export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id").primaryKey(),
  role: text("role").$type<AdminRole>().notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: createdAt(),
})

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  billingInterval: text("billing_interval").$type<BillingInterval>().notNull(),
  trialDays: integer("trial_days").notNull().default(0),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  limits: jsonb("limits").$type<PlanLimits>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  isRecommended: boolean("is_recommended").notNull().default(false),
  family: text("family"),
  isHidden: boolean("is_hidden").notNull().default(false),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  planId: uuid("plan_id").notNull(),
  planVersion: integer("plan_version").notNull().default(1),
  status: text("status").$type<SubscriptionStatus>().notNull(),
  priceCents: integer("price_cents").notNull(),
  billingInterval: text("billing_interval").$type<BillingInterval>().notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  limits: jsonb("limits").$type<PlanLimits>().notNull().default({}),
  paymentMethod: text("payment_method"),
  gateway: text("gateway"),
  gatewayCustomerId: text("gateway_customer_id"),
  gatewaySubscriptionId: text("gateway_subscription_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  courtesyUntil: timestamp("courtesy_until", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  gatewayCancelStatus: text("gateway_cancel_status").$type<GatewayCancelStatus>(),
  gatewayCancelAttempts: integer("gateway_cancel_attempts").notNull().default(0),
  gatewayCancelLastError: text("gateway_cancel_last_error"),
  gatewayCancelLastAttemptAt: timestamp("gateway_cancel_last_attempt_at", { withTimezone: true }),
  gatewayCanceledAt: timestamp("gateway_canceled_at", { withTimezone: true }),
  gatewayBillingType: text("gateway_billing_type").$type<GatewayBillingType>(),
  gatewayActivationStatus: text("gateway_activation_status").$type<GatewayActivationStatus>(),
  gatewayActivationAttempts: integer("gateway_activation_attempts").notNull().default(0),
  gatewayActivationLastError: text("gateway_activation_last_error"),
  gatewayActivationLastAttemptAt: timestamp("gateway_activation_last_attempt_at", { withTimezone: true }),
  gatewayActivatedAt: timestamp("gateway_activated_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type GatewayCancelStatus = "pending" | "done" | "failed"
/** pending: plano escolhido no trial, assinatura no Asaas ainda não criada; done: criada pelo cron. */
export type GatewayActivationStatus = "pending" | "done"
export type GatewayBillingType = "PIX" | "BOLETO" | "CREDIT_CARD"

export const subscriptionEvents = pgTable("subscription_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull(),
  businessId: uuid("business_id").notNull(),
  type: text("type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  source: text("source").$type<"admin" | "gateway" | "system" | "owner">().notNull(),
  actorUserId: text("actor_user_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
})

export const billingTransactions = pgTable("billing_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  subscriptionId: uuid("subscription_id"),
  planId: uuid("plan_id"),
  amountCents: integer("amount_cents").notNull(),
  refundedCents: integer("refunded_cents").notNull().default(0),
  currency: text("currency").notNull().default("BRL"),
  status: text("status").$type<TransactionStatus>().notNull(),
  paymentMethod: text("payment_method"),
  gateway: text("gateway").notNull(),
  gatewayTransactionId: text("gateway_transaction_id").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  invoiceUrl: text("invoice_url"),
  bankSlipUrl: text("bank_slip_url"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  /** Ciclo promocional (1, 2...) já contabilizado por esta cobrança; evita contar o desconto duas vezes. */
  promoCycle: integer("promo_cycle"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const promoCampaigns = pgTable("promo_campaigns", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  discountedCycles: integer("discounted_cycles").notNull(),
  maxRedemptions: integer("max_redemptions").notNull(),
  planFamilies: text("plan_families").array().notNull().default([]),
  billingIntervals: text("billing_intervals").array().$type<BillingInterval[]>().notNull().default(["month"]),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * reserved: vaga segurada por um checkout ainda sem pagamento; confirmed: primeiro pagamento aprovado;
 * completed: ciclos com desconto esgotados; released: vaga devolvida (checkout abandonado ou encerrado).
 */
export type PromoRedemptionStatus = "reserved" | "confirmed" | "completed" | "released"
export type PromoPriceSyncStatus = "pending" | "done" | "failed"

export const promoRedemptions = pgTable("promo_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignCode: text("campaign_code").notNull(),
  businessId: uuid("business_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  status: text("status").$type<PromoRedemptionStatus>().notNull(),
  discountPercent: integer("discount_percent").notNull(),
  discountedCycles: integer("discounted_cycles").notNull(),
  paidCycles: integer("paid_cycles").notNull().default(0),
  reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releaseReason: text("release_reason"),
  priceSyncStatus: text("price_sync_status").$type<PromoPriceSyncStatus>(),
  priceSyncAttempts: integer("price_sync_attempts").notNull().default(0),
  priceSyncLastError: text("price_sync_last_error"),
  priceSyncLastAttemptAt: timestamp("price_sync_last_attempt_at", { withTimezone: true }),
  priceSyncedAt: timestamp("price_synced_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateway: text("gateway").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").$type<"received" | "processed" | "failed" | "ignored">().notNull().default("received"),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
})

export const businessSuspensions = pgTable("business_suspensions", {
  businessId: uuid("business_id").primaryKey(),
  reason: text("reason").notNull(),
  suspendedBy: text("suspended_by").notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }).notNull().defaultNow(),
})

export const businessNotes = pgTable("business_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull(),
  authorUserId: text("author_user_id").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
})

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  businessId: uuid("business_id"),
  reason: text("reason"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
})

export type PlanRow = typeof plans.$inferSelect
export type SubscriptionRow = typeof subscriptions.$inferSelect
export type BillingTransactionRow = typeof billingTransactions.$inferSelect
export type PromoCampaignRow = typeof promoCampaigns.$inferSelect
export type PromoRedemptionRow = typeof promoRedemptions.$inferSelect
