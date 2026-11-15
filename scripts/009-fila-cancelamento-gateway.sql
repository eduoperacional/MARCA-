-- 009 - Fila persistente de cancelamentos no Asaas (trials expirados pelo cron)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 008 e ANTES de publicar o código.
--
-- gateway_cancel_status:
--   NULL      nada a cancelar no gateway
--   'pending' aguardando cancelamento (o cron tenta a cada execução)
--   'done'    cancelamento confirmado pelo Asaas (nunca é repetido)
--   'failed'  tentativas esgotadas; exige verificação manual no painel do Asaas

BEGIN;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_cancel_status text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_cancel_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_cancel_last_error text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_cancel_last_attempt_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_canceled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_gateway_cancel_status_check') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_gateway_cancel_status_check
      CHECK (gateway_cancel_status IS NULL OR gateway_cancel_status IN ('pending', 'done', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_gateway_cancel_pending_idx
  ON subscriptions (gateway_cancel_last_attempt_at)
  WHERE gateway_cancel_status = 'pending';

COMMIT;
