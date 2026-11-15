-- 006: painel administrativo central (super admin) da MARCAÍ.
-- Cria planos, assinaturas, transações, webhooks de pagamento, auditoria,
-- suspensão de contas e observações internas.
-- Idempotente: pode ser executado mais de uma vez.
-- ANTES DE RODAR: troque o e-mail na seção 9 pelo e-mail da sua conta.

-- 1. Administradores da plataforma --------------------------------------------
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('super_admin', 'admin', 'finance', 'support')),
  active     boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Planos comerciais ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  description      text,
  price_cents      integer NOT NULL CHECK (price_cents >= 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  trial_days       integer NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 365),
  features         jsonb NOT NULL DEFAULT '[]'::jsonb,
  limits           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. Assinaturas (cada contrato guarda uma cópia do plano: alterar o plano não
--    muda contratos existentes) ----------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  plan_id                 uuid NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  plan_version            integer NOT NULL DEFAULT 1,
  status                  text NOT NULL CHECK (status IN (
                            'trialing', 'active', 'awaiting_payment', 'payment_pending',
                            'past_due', 'canceled', 'expired', 'suspended')),
  price_cents             integer NOT NULL CHECK (price_cents >= 0),
  billing_interval        text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  features                jsonb NOT NULL DEFAULT '[]'::jsonb,
  limits                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method          text,
  gateway                 text,
  gateway_customer_id     text,
  gateway_subscription_id text,
  started_at              timestamptz NOT NULL DEFAULT now(),
  trial_ends_at           timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  courtesy_until          timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  cancel_requested_at     timestamptz,
  canceled_at             timestamptz,
  ended_at                timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_gateway_id_key
  ON subscriptions (gateway, gateway_subscription_id)
  WHERE gateway_subscription_id IS NOT NULL;

-- No máximo uma assinatura vigente por estabelecimento.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_per_business
  ON subscriptions (business_id)
  WHERE status NOT IN ('canceled', 'expired');

CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions (status);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx ON subscriptions (business_id, created_at DESC);

-- 4. Histórico de cada assinatura -----------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions (id) ON DELETE RESTRICT,
  business_id     uuid NOT NULL,
  type            text NOT NULL,
  from_status     text,
  to_status       text,
  source          text NOT NULL CHECK (source IN ('admin', 'gateway', 'system')),
  actor_user_id   text,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_sub_idx
  ON subscription_events (subscription_id, created_at DESC);

-- 5. Transações recebidas do gateway (somente dados não sensíveis) ------------
CREATE TABLE IF NOT EXISTS billing_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
  subscription_id        uuid REFERENCES subscriptions (id) ON DELETE RESTRICT,
  plan_id                uuid REFERENCES plans (id) ON DELETE RESTRICT,
  amount_cents           integer NOT NULL CHECK (amount_cents >= 0),
  refunded_cents         integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  currency               text NOT NULL DEFAULT 'BRL',
  status                 text NOT NULL CHECK (status IN (
                           'approved', 'pending', 'declined', 'charged_back', 'refunded')),
  payment_method         text,
  gateway                text NOT NULL,
  gateway_transaction_id text NOT NULL,
  description            text,
  paid_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_transaction_id)
);

CREATE INDEX IF NOT EXISTS billing_transactions_paid_idx ON billing_transactions (paid_at);
CREATE INDEX IF NOT EXISTS billing_transactions_business_idx ON billing_transactions (business_id, created_at DESC);

-- 6. Webhooks: um registro por evento do gateway (impede processamento duplicado)
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway      text NOT NULL,
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'received'
               CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (gateway, event_id)
);

-- 7. Suspensão de contas e observações internas -------------------------------
CREATE TABLE IF NOT EXISTS business_suspensions (
  business_id  uuid PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
  reason       text NOT NULL,
  suspended_by text NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  body           text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_notes_business_idx ON business_notes (business_id, created_at DESC);

-- 8. Auditoria administrativa (somente inserção) -------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text NOT NULL,
  actor_email   text NOT NULL,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     text,
  business_id   uuid,
  reason        text,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_business_idx ON admin_audit_log (business_id, created_at DESC);

CREATE OR REPLACE FUNCTION admin_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log é somente inserção';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_no_change ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_change
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_immutable();

-- Planos demonstrativos (configuração, não geram receita). Ajuste no painel.
INSERT INTO plans (code, name, description, price_cents, billing_interval, trial_days, features, limits, sort_order)
VALUES
  ('start', 'Start', 'Para profissionais autônomos.', 4990, 'month', 14,
   '["online_booking"]'::jsonb,
   '{"professionals": 1, "services": 15, "members": 1}'::jsonb, 1),
  ('pro', 'Pro', 'Para estabelecimentos em crescimento.', 9990, 'month', 14,
   '["online_booking", "reports", "finance", "team"]'::jsonb,
   '{"professionals": 5, "services": 60, "members": 5}'::jsonb, 2),
  ('elite', 'Elite', 'Para operações com várias equipes.', 17990, 'month', 14,
   '["online_booking", "reports", "finance", "team", "automations", "custom_branding"]'::jsonb,
   '{}'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;

-- 9. Libera o seu acesso de super admin ----------------------------------------
DO $$
DECLARE
  v_email text := 'cascadebala1900@gmail.com';
  v_user  text;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE lower(email) = lower(v_email);

  IF v_user IS NULL THEN
    RAISE NOTICE 'Usuário % não encontrado: tabelas criadas, mas nenhum super admin foi liberado.', v_email;
    RETURN;
  END IF;

  INSERT INTO platform_admins (user_id, role, active, created_by)
  VALUES (v_user, 'super_admin', true, 'script-006')
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', active = true;

  RAISE NOTICE 'Usuário % agora é super admin da MARCAÍ.', v_email;
END $$;

-- Conferência:
-- SELECT u.email, a.role, a.active FROM platform_admins a JOIN "user" u ON u.id = a.user_id;
