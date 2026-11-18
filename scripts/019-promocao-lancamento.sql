-- 019 - Promoção oficial de lançamento
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 018 e ANTES de publicar o código.
--
-- Oferta: após os 7 dias grátis, 30% de desconto nos 2 primeiros ciclos pagos dos planos Start, Pro e
-- Elite (mensais), limitada aos 10 primeiros novos clientes. A partir do 3º ciclo, preço integral.
--
-- promo_campaigns    configuração da campanha (desconto, ciclos, vagas, planos e periodicidades).
-- promo_redemptions  uma linha por estabelecimento que reservou/usou a promoção:
--   reserved   vaga segurada por um checkout ainda sem pagamento (expira em expires_at)
--   confirmed  primeiro pagamento aprovado: vaga consumida definitivamente
--   completed  ciclos com desconto esgotados; o valor no Asaas volta ao preço integral
--   released   vaga devolvida (checkout abandonado, trial não pago ou assinatura encerrada)
-- price_sync_status: fila para restaurar o preço integral no Asaas (pending -> done | failed).
-- billing_transactions.promo_cycle: ciclo promocional contabilizado por cobrança (evita contar duas vezes).

BEGIN;

CREATE TABLE IF NOT EXISTS promo_campaigns (
  code              text PRIMARY KEY,
  name              text NOT NULL,
  discount_percent  integer NOT NULL CHECK (discount_percent > 0 AND discount_percent < 100),
  discounted_cycles integer NOT NULL CHECK (discounted_cycles > 0),
  max_redemptions   integer NOT NULL CHECK (max_redemptions > 0),
  plan_families     text[] NOT NULL DEFAULT '{}',
  billing_intervals text[] NOT NULL DEFAULT '{month}',
  starts_at         timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_code              text NOT NULL REFERENCES promo_campaigns(code),
  business_id                uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Checkout recusado pelo Asaas apaga a assinatura local: a reserva some junto e a vaga volta.
  subscription_id            uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  status                     text NOT NULL CHECK (status IN ('reserved', 'confirmed', 'completed', 'released')),
  discount_percent           integer NOT NULL CHECK (discount_percent > 0 AND discount_percent < 100),
  discounted_cycles          integer NOT NULL CHECK (discounted_cycles > 0),
  paid_cycles                integer NOT NULL DEFAULT 0 CHECK (paid_cycles >= 0),
  reserved_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                 timestamptz NOT NULL,
  confirmed_at               timestamptz,
  completed_at               timestamptz,
  released_at                timestamptz,
  release_reason             text,
  price_sync_status          text CHECK (price_sync_status IS NULL OR price_sync_status IN ('pending', 'done', 'failed')),
  price_sync_attempts        integer NOT NULL DEFAULT 0,
  price_sync_last_error      text,
  price_sync_last_attempt_at timestamptz,
  price_synced_at            timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Uma promoção por estabelecimento por campanha, e uma reserva por assinatura.
CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_campaign_business_uidx
  ON promo_redemptions (campaign_code, business_id);
CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_subscription_uidx
  ON promo_redemptions (subscription_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_campaign_status_idx
  ON promo_redemptions (campaign_code, status);
CREATE INDEX IF NOT EXISTS promo_redemptions_price_sync_idx
  ON promo_redemptions (price_sync_last_attempt_at)
  WHERE price_sync_status = 'pending';

ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS promo_cycle integer;

-- Campanha oficial. Usa os preços já cadastrados em plans (nenhum preço é alterado aqui).
INSERT INTO promo_campaigns (code, name, discount_percent, discounted_cycles, max_redemptions, plan_families, billing_intervals)
VALUES ('lancamento', 'Promoção de lançamento', 30, 2, 10, '{start,pro,elite}', '{month}')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Conferência
SELECT code, discount_percent, discounted_cycles, max_redemptions, plan_families, billing_intervals, starts_at, is_active
FROM promo_campaigns;

SELECT p.code, p.name, p.billing_interval, p.price_cents AS preco_integral,
       ROUND(p.price_cents * 0.7) AS preco_promocional
FROM plans p
WHERE p.is_active AND NOT p.is_test AND COALESCE(p.family, p.code) IN ('start', 'pro', 'elite') AND p.billing_interval = 'month'
ORDER BY p.sort_order;
