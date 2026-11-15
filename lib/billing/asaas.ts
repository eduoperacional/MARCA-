import "server-only"

/**
 * Cliente mínimo da API v3 do Asaas.
 * Variáveis: ASAAS_API_KEY (obrigatória), ASAAS_ENV = "production" | "sandbox" (padrão sandbox).
 */
const BASE_URL =
  process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3"

export class AsaasError extends Error {}

export function isAsaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY)
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new AsaasError("Pagamentos ainda não configurados (ASAAS_API_KEY ausente).")

  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      access_token: key,
      "Content-Type": "application/json",
      "User-Agent": "marcai-saas",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  })

  const data = (await response.json().catch(() => ({}))) as { errors?: { description?: string }[] }
  if (!response.ok) {
    const message = data.errors?.[0]?.description ?? `Asaas respondeu ${response.status}`
    console.error("[asaas]", init.method ?? "GET", path, response.status, message)
    throw new AsaasError(message)
  }
  return data as T
}

export type AsaasCustomer = { id: string }
export type AsaasSubscription = { id: string; status: string; nextDueDate: string }
export type AsaasPaymentSummary = {
  id: string
  status: string
  dueDate: string
  value: number
  invoiceUrl: string | null
}

export function createCustomer(input: {
  name: string
  cpfCnpj: string
  email?: string | null
  mobilePhone?: string | null
  externalReference: string
}) {
  return request<AsaasCustomer>("/customers", { method: "POST", body: { ...input, notificationDisabled: false } })
}

export function updateCustomer(id: string, input: { cpfCnpj: string }) {
  return request<AsaasCustomer>(`/customers/${encodeURIComponent(id)}`, { method: "PUT", body: input })
}

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED"

export function createSubscription(input: {
  customer: string
  value: number
  nextDueDate: string
  cycle: "MONTHLY" | "YEARLY"
  description: string
  externalReference: string
  billingType?: AsaasBillingType
}) {
  return request<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: { ...input, billingType: input.billingType ?? "UNDEFINED" },
  })
}

export function getSubscription(id: string) {
  return request<AsaasSubscription>(`/subscriptions/${encodeURIComponent(id)}`)
}

export async function findCustomerByReference(externalReference: string) {
  const result = await request<{ data: AsaasCustomer[] }>(
    `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`
  )
  return result.data?.[0] ?? null
}

export type AsaasPaymentDetail = AsaasPaymentSummary & {
  billingType: string
  bankSlipUrl: string | null
  subscription?: string | null
}

export function getPayment(id: string) {
  return request<AsaasPaymentDetail>(`/payments/${encodeURIComponent(id)}`)
}

export function getPixQrCode(paymentId: string) {
  return request<{ encodedImage: string; payload: string; expirationDate: string }>(
    `/payments/${encodeURIComponent(paymentId)}/pixQrCode`
  )
}

/** Formas de pagamento habilitadas na conta (ASAAS_BILLING_TYPES="PIX,BOLETO,CREDIT_CARD"). */
export function enabledBillingTypes(): Exclude<AsaasBillingType, "UNDEFINED">[] {
  const all = ["PIX", "BOLETO", "CREDIT_CARD"] as const
  const raw = process.env.ASAAS_BILLING_TYPES
  if (!raw) return [...all]
  const wanted = new Set(raw.split(",").map((v) => v.trim().toUpperCase()))
  return all.filter((type) => wanted.has(type))
}

export function updateSubscription(
  id: string,
  input: { value: number; cycle: "MONTHLY" | "YEARLY"; description: string; billingType?: AsaasBillingType }
) {
  return request<AsaasSubscription>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { ...input, updatePendingPayments: true },
  })
}

export function cancelSubscription(id: string) {
  return request<{ deleted: boolean }>(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function listSubscriptionPayments(id: string) {
  const result = await request<{ data: AsaasPaymentSummary[] }>(
    `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`
  )
  return result.data ?? []
}

export function toAsaasCycle(interval: "month" | "year") {
  return interval === "year" ? "YEARLY" : "MONTHLY"
}
