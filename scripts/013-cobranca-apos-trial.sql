-- 013 - Assinatura no Asaas criada somente ao fim dos 7 dias grátis
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 012 e ANTES de publicar o código.
--
-- Durante o trial a contratação só registra o plano, a periodicidade e a forma de pagamento.
-- O cron cria a assinatura no Asaas quando o trial termina (gateway_activation_status):
--   NULL      fluxo anterior / contratação após o trial (assinatura criada no ato)
--   'pending' aguardando o fim do trial ou nova tentativa após falha de comunicação
--   'done'    assinatura criada no Asaas (nunca é repetida)

BEGIN;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_billing_type text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_activation_status text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_activation_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_activation_last_error text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_activation_last_attempt_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_activated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_gateway_activation_status_check') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_gateway_activation_status_check
      CHECK (gateway_activation_status IS NULL OR gateway_activation_status IN ('pending', 'done'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_gateway_billing_type_check') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_gateway_billing_type_check
      CHECK (gateway_billing_type IS NULL OR gateway_billing_type IN ('PIX', 'BOLETO', 'CREDIT_CARD'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_gateway_activation_pending_idx
  ON subscriptions (trial_ends_at)
  WHERE gateway_activation_status = 'pending';

-- Garante no banco que uma assinatura do Asaas nunca fica vinculada a dois registros locais.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_gateway_subscription_uidx
  ON subscriptions (gateway, gateway_subscription_id)
  WHERE gateway_subscription_id IS NOT NULL;

COMMIT;

-- Conferência
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'subscriptions' AND (column_name LIKE 'gateway_activ%' OR column_name = 'gateway_billing_type')
ORDER BY column_name;
