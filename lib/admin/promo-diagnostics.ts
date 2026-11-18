import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { db as defaultDb } from "@/lib/db"
import type { BillingDb } from "@/lib/billing/process-asaas-event"

export type DiagnosticRow = Record<string, unknown>

export type DiagnosticBlock = {
  key: string
  title: string
  description: string
  expectation?: string
  rows: DiagnosticRow[]
  error?: string
}

const escapeLike = (value: string) => value.replace(/[%_\\]/g, "\\$&")

function buildQueries(term: string): { key: string; title: string; description: string; expectation?: string; query: SQL }[] {
  const pattern = `%${escapeLike(term)}%`
  const slugPattern = `%${escapeLike(term.toLowerCase().replace(/\s+/g, "-"))}%`
  const matchBusiness = sql`(b.name ILIKE ${pattern} OR b.display_name ILIKE ${pattern} OR b.slug ILIKE ${slugPattern})`

  return [
    {
      key: "estabelecimento",
      title: "Estabelecimento",
      description: "Confira se aparece apenas um estabelecimento e anote o id.",
      query: sql`
        SELECT b.id AS business_id, b.name, b.display_name, b.slug, b.created_at,
               b.created_at + interval '7 days' AS fim_trial_estabelecimento
        FROM businesses b
        WHERE ${matchBusiness}
        ORDER BY b.created_at`,
    },
    {
      key: "assinaturas",
      title: "Assinaturas",
      description: "A vigente é a que não está canceled nem expired.",
      query: sql`
        SELECT s.id AS subscription_id, s.status, p.code AS plano, p.is_test, s.price_cents, s.billing_interval,
               s.started_at, s.trial_ends_at, s.gateway_billing_type,
               s.gateway_activation_status, s.gateway_activated_at, s.gateway_activation_last_error,
               s.gateway_subscription_id, s.current_period_end
        FROM subscriptions s
        JOIN businesses b ON b.id = s.business_id
        JOIN plans p ON p.id = s.plan_id
        WHERE ${matchBusiness}
        ORDER BY s.started_at`,
    },
    {
      key: "reserva",
      title: "Reserva na campanha lancamento",
      description: "Status da reserva, ciclos pagos e vínculo com a assinatura vigente.",
      expectation: "vinculada_a_assinatura_vigente deve ser true.",
      query: sql`
        SELECT r.id, r.campaign_code, r.status, r.discount_percent, r.discounted_cycles, r.paid_cycles,
               r.reserved_at, r.expires_at, r.confirmed_at, r.completed_at, r.released_at, r.release_reason,
               r.price_sync_status, r.price_sync_attempts, r.price_sync_last_error,
               r.subscription_id, s.status AS status_assinatura,
               (r.subscription_id = vig.id) AS vinculada_a_assinatura_vigente
        FROM promo_redemptions r
        JOIN subscriptions s ON s.id = r.subscription_id
        JOIN businesses b ON b.id = r.business_id
        LEFT JOIN LATERAL (
          SELECT id FROM subscriptions
          WHERE business_id = b.id AND status NOT IN ('canceled', 'expired')
          ORDER BY started_at DESC LIMIT 1
        ) vig ON true
        WHERE r.campaign_code = 'lancamento' AND ${matchBusiness}`,
    },
    {
      key: "valor-asaas",
      title: "Valor enviado ao Asaas",
      description: "Mesma regra de gatewayPriceCents aplicada à assinatura vigente.",
      expectation: "Pro mensal: preco_integral = 9990 e valor_enviado_ao_asaas_cents = 6993.",
      query: sql`
        SELECT s.id AS subscription_id, p.code AS plano, s.price_cents AS preco_integral,
               r.status AS status_promo, r.paid_cycles, r.discounted_cycles,
               CASE
                 WHEN r.status IN ('reserved', 'confirmed') AND r.paid_cycles < r.discounted_cycles
                      AND NOT p.is_test
                      AND COALESCE(p.family, p.code) = ANY (c.plan_families)
                      AND s.billing_interval = ANY (c.billing_intervals)
                 THEN ROUND(s.price_cents * (100 - r.discount_percent) / 100.0)
                 ELSE s.price_cents
               END AS valor_enviado_ao_asaas_cents
        FROM subscriptions s
        JOIN businesses b ON b.id = s.business_id
        JOIN plans p ON p.id = s.plan_id
        LEFT JOIN promo_redemptions r ON r.subscription_id = s.id
        LEFT JOIN promo_campaigns c ON c.code = r.campaign_code
        WHERE ${matchBusiness} AND s.status NOT IN ('canceled', 'expired')`,
    },
    {
      key: "cobrancas",
      title: "Cobranças registradas",
      description: "Transações já criadas no gateway para o estabelecimento.",
      expectation: "Nenhuma cobrança deve existir enquanto o trial estiver em andamento.",
      query: sql`
        SELECT t.gateway_transaction_id, t.status, t.amount_cents, t.due_date, t.paid_at,
               t.payment_method, t.promo_cycle, t.created_at
        FROM billing_transactions t
        JOIN businesses b ON b.id = t.business_id
        WHERE ${matchBusiness}
        ORDER BY t.created_at`,
    },
    {
      key: "eventos",
      title: "Histórico de eventos",
      description: "scheduled, promo_reserved, created, promo_confirmed e demais eventos da assinatura.",
      query: sql`
        SELECT e.created_at, e.type, e.from_status, e.to_status, e.source, e.details
        FROM subscription_events e
        JOIN businesses b ON b.id = e.business_id
        WHERE ${matchBusiness}
        ORDER BY e.created_at`,
    },
    {
      key: "elegibilidade",
      title: "Elegibilidade de novo cliente",
      description: "Critérios que bloqueiam a promoção para clientes antigos.",
      expectation: "Todas as colunas devem ser false para ter direito.",
      query: sql`
        SELECT b.id AS business_id,
               EXISTS (SELECT 1 FROM subscriptions s WHERE s.business_id = b.id AND s.gateway_subscription_id IS NOT NULL) AS ja_teve_assinatura_no_asaas,
               EXISTS (SELECT 1 FROM billing_transactions t WHERE t.business_id = b.id AND t.status IN ('approved', 'refunded', 'charged_back')) AS ja_pagou_algo
        FROM businesses b
        WHERE ${matchBusiness}`,
    },
    {
      key: "campanha",
      title: "Campanha e vagas",
      description: "Configuração da campanha lancamento e vagas já ocupadas.",
      query: sql`
        SELECT c.code, c.is_active, c.starts_at, c.ends_at, c.discount_percent, c.discounted_cycles,
               c.max_redemptions, c.plan_families, c.billing_intervals,
               (SELECT count(*) FROM promo_redemptions r WHERE r.campaign_code = c.code AND r.status IN ('reserved', 'confirmed', 'completed')) AS reservas_ativas_ou_pagas
        FROM promo_campaigns c
        WHERE c.code = 'lancamento'`,
    },
  ]
}

export async function getPromoDiagnostics(term: string, db: BillingDb = defaultDb): Promise<DiagnosticBlock[]> {
  return Promise.all(
    buildQueries(term).map(async ({ query, ...meta }) => {
      try {
        const result = (await db.execute(query)) as unknown as { rows: DiagnosticRow[] }
        return { ...meta, rows: result.rows }
      } catch (error) {
        return { ...meta, rows: [], error: error instanceof Error ? error.message : "Falha ao consultar." }
      }
    })
  )
}
