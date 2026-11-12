import "server-only"

import { and, desc, eq, gte, lt, lte } from "drizzle-orm"

import { db } from "@/lib/db"
import { appointments, clients, expenses, payments, services } from "@/lib/db/schema"
import type { LocalRange } from "@/lib/period"
import { listAppointments } from "@/lib/queries/appointments"
import { addDays, toInstant } from "@/lib/time"
import type { PaymentMethod } from "@/lib/types"

export interface PaymentItem {
  id: string
  amount: number
  method: PaymentMethod
  paidAt: string
  clientName: string | null
  serviceName: string | null
  appointmentId: string | null
}

export interface ExpenseItem {
  id: string
  description: string
  category: string
  amount: number
  date: string
}

export async function getFinanceOverview(businessId: string, range: LocalRange) {
  const rangeStart = toInstant(range.from)
  const rangeEnd = toInstant(addDays(range.to, 1))

  const [paymentRows, expenseRows, periodAppointments] = await Promise.all([
    db
      .select({
        payment: payments,
        clientName: clients.name,
        serviceName: services.name,
      })
      .from(payments)
      .leftJoin(appointments, eq(appointments.id, payments.appointmentId))
      .leftJoin(clients, eq(clients.id, appointments.clientId))
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(payments.businessId, businessId), gte(payments.paidAt, rangeStart), lt(payments.paidAt, rangeEnd)))
      .orderBy(desc(payments.paidAt)),
    db
      .select()
      .from(expenses)
      .where(and(eq(expenses.businessId, businessId), gte(expenses.date, range.from), lte(expenses.date, range.to)))
      .orderBy(desc(expenses.date)),
    listAppointments(businessId, { from: range.from, to: range.to, order: "desc", limit: 5000 }),
  ])

  const paymentItems = paymentRows.map<PaymentItem>((r) => ({
    id: r.payment.id,
    amount: r.payment.amountCents / 100,
    method: r.payment.method,
    paidAt: r.payment.paidAt.toISOString(),
    clientName: r.clientName,
    serviceName: r.serviceName,
    appointmentId: r.payment.appointmentId,
  }))
  const expenseItems = expenseRows.map<ExpenseItem>((e) => ({
    id: e.id,
    description: e.description,
    category: e.category,
    amount: e.amountCents / 100,
    date: e.date,
  }))

  const completed = periodAppointments.filter((a) => a.status === "completed")
  const upcoming = periodAppointments.filter((a) => ["pending", "confirmed", "in_progress"].includes(a.status))
  const pendingPayments = completed.filter((a) => a.paidAmount < a.price)

  const received = paymentItems.reduce((sum, p) => sum + p.amount, 0)
  const expensesTotal = expenseItems.reduce((sum, e) => sum + e.amount, 0)
  const realized = completed.reduce((sum, a) => sum + a.price, 0)

  const byMethod = new Map<PaymentMethod, number>()
  for (const p of paymentItems) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)

  return {
    realized,
    scheduled: upcoming.reduce((sum, a) => sum + a.price, 0),
    scheduledCount: upcoming.length,
    completedCount: completed.length,
    received,
    pending: pendingPayments.reduce((sum, a) => sum + (a.price - a.paidAmount), 0),
    expenses: expensesTotal,
    profit: received - expensesTotal,
    averageTicket: completed.length ? realized / completed.length : 0,
    byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    payments: paymentItems,
    expenseItems,
    pendingPayments,
  }
}
