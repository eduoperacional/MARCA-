-- 008 - Contratação self-service de assinaturas (checkout Asaas)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 006.

BEGIN;

-- 1. Planos: destaque e agrupamento mensal/anual -----------------------------
-- family agrupa versões mensal e anual do mesmo plano (ex.: 'pro' e 'pro-anual' com family = 'pro').
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS family text;

UPDATE plans SET family = code WHERE family IS NULL AND code IN ('start', 'pro', 'elite');
UPDATE plans SET is_recommended = true
WHERE code = 'pro' AND NOT EXISTS (SELECT 1 FROM plans WHERE is_recommended);

-- Versões anuais (10 meses pelo preço de 12). Não sobrescreve planos já existentes.
INSERT INTO plans (code, name, description, price_cents, billing_interval, trial_days, features, limits, sort_order, family, is_recommended)
SELECT p.code || '-anual', p.name, p.description, p.price_cents * 10, 'year', p.trial_days, p.features, p.limits,
       p.sort_order, p.code, false
FROM plans p
WHERE p.code IN ('start', 'pro', 'elite') AND p.billing_interval = 'month'
ON CONFLICT (code) DO NOTHING;

-- 2. Cobranças: dados para o estabelecimento pagar --------------------------
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS invoice_url text;
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS bank_slip_url text;

CREATE INDEX IF NOT EXISTS billing_transactions_pending_idx
  ON billing_transactions (business_id, due_date)
  WHERE status = 'pending';

-- 3. Histórico: ações feitas pelo próprio proprietário -----------------------
ALTER TABLE subscription_events DROP CONSTRAINT IF EXISTS subscription_events_source_check;
ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_source_check CHECK (source IN ('admin', 'gateway', 'system', 'owner'));

COMMIT;

-- Conferência
SELECT code, name, billing_interval, price_cents, family, is_recommended, is_active
FROM plans ORDER BY sort_order, billing_interval;
