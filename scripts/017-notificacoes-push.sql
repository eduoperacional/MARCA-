-- 017 - Notificações push nativas (Web Push + Service Worker)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 016.
-- Não altera nenhuma tabela existente do sistema.
--
-- push_subscriptions       uma inscrição por dispositivo/navegador, por usuário e estabelecimento
-- push_preferences         preferências pessoais (ligar/desligar, som, eventos) por usuário e estabelecimento
-- business_push_settings   regra de lembretes do estabelecimento (antecedência)
-- push_deliveries          fila de envio e histórico (pending, processing, sent, failed, skipped)

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  endpoint        text NOT NULL,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  last_success_at timestamptz,
  revoked_at      timestamptz,
  revoked_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Um dispositivo é inscrito uma vez por estabelecimento; reinscrever atualiza a mesma linha.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_business_endpoint_idx
  ON push_subscriptions (business_id, endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_active_idx
  ON push_subscriptions (business_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS push_preferences (
  business_id         uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id             text NOT NULL,
  enabled             boolean NOT NULL DEFAULT true,
  sound               boolean NOT NULL DEFAULT true,
  notify_new_booking  boolean NOT NULL DEFAULT true,
  notify_cancellation boolean NOT NULL DEFAULT true,
  notify_reschedule   boolean NOT NULL DEFAULT true,
  notify_reminder     boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS business_push_settings (
  business_id        uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  reminders_enabled  boolean NOT NULL DEFAULT true,
  reminder_lead_min  integer NOT NULL DEFAULT 60,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_push_settings_lead_check') THEN
    ALTER TABLE business_push_settings
      ADD CONSTRAINT business_push_settings_lead_check CHECK (reminder_lead_min BETWEEN 15 AND 1440);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS push_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id  uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  appointment_id   uuid,
  event            text NOT NULL,
  payload          jsonb NOT NULL,
  dedupe_key       text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  locked_until     timestamptz,
  last_attempt_at  timestamptz,
  sent_at          timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_deliveries_status_check') THEN
    ALTER TABLE push_deliveries
      ADD CONSTRAINT push_deliveries_status_check
      CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_deliveries_event_check') THEN
    ALTER TABLE push_deliveries
      ADD CONSTRAINT push_deliveries_event_check
      CHECK (event IN ('new_booking', 'cancellation', 'reschedule', 'reminder', 'test'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_deliveries_attempts_check') THEN
    ALTER TABLE push_deliveries
      ADD CONSTRAINT push_deliveries_attempts_check
      CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10);
  END IF;
END $$;

-- Idempotência: o mesmo evento nunca é entregue duas vezes ao mesmo dispositivo.
CREATE UNIQUE INDEX IF NOT EXISTS push_deliveries_dedupe_idx
  ON push_deliveries (subscription_id, dedupe_key);

-- Busca da fila pelo processador
CREATE INDEX IF NOT EXISTS push_deliveries_queue_idx
  ON push_deliveries (next_attempt_at) WHERE status IN ('pending', 'processing');

-- Lembretes já enfileirados por agendamento
CREATE INDEX IF NOT EXISTS push_deliveries_appointment_idx
  ON push_deliveries (business_id, appointment_id, event);

COMMIT;
