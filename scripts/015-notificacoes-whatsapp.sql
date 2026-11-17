-- 015 - Notificações por WhatsApp para o proprietário (fila persistente + consentimento)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 014.
-- Também atualiza com segurança um banco onde a versão anterior deste script já tenha sido executada.
--
-- business_whatsapp_settings  número de destino, consentimento e preferências (1 linha por estabelecimento)
-- whatsapp_deliveries         fila de envio e histórico (pending, processing, sent, failed, skipped)
--
-- Consentimento: nenhum número é copiado de businesses.phone e nada é ativado automaticamente.
-- O envio só acontece quando o proprietário cadastra o número e ativa voluntariamente (consent_at).
-- Não altera nenhuma tabela existente do sistema.

BEGIN;

/* ------------------------------ Preferências ------------------------------ */

CREATE TABLE IF NOT EXISTS business_whatsapp_settings (
  business_id         uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  phone               text,
  enabled             boolean NOT NULL DEFAULT false,
  consent_at          timestamptz,
  notify_new_booking  boolean NOT NULL DEFAULT true,
  notify_cancellation boolean NOT NULL DEFAULT true,
  notify_reschedule   boolean NOT NULL DEFAULT true,
  last_test_at        timestamptz,
  last_test_status    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Atualização a partir da versão anterior do 015
ALTER TABLE business_whatsapp_settings ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE business_whatsapp_settings ALTER COLUMN enabled SET DEFAULT false;

-- Remove linhas criadas pela cópia automática de businesses.phone na versão anterior
-- (nunca editadas nem testadas pelo proprietário).
DELETE FROM business_whatsapp_settings s
USING businesses b
WHERE b.id = s.business_id
  AND s.consent_at IS NULL
  AND s.last_test_at IS NULL
  AND s.updated_at = s.created_at
  AND s.phone = regexp_replace(coalesce(b.phone, ''), '\D', '', 'g');

-- Sem consentimento registrado, nada fica ativo.
UPDATE business_whatsapp_settings SET enabled = false, updated_at = now()
WHERE consent_at IS NULL AND enabled;

-- Padroniza o número armazenado: DDD + número, sem o 55 (mesma regra de normalizeWhatsappPhone).
UPDATE business_whatsapp_settings
SET phone = CASE
    WHEN length(regexp_replace(phone, '\D', '', 'g')) IN (12, 13) AND regexp_replace(phone, '\D', '', 'g') LIKE '55%'
      THEN substring(regexp_replace(phone, '\D', '', 'g') FROM 3)
    WHEN length(regexp_replace(phone, '\D', '', 'g')) IN (10, 11)
      THEN regexp_replace(phone, '\D', '', 'g')
    ELSE NULL
  END
WHERE phone IS NOT NULL;

UPDATE business_whatsapp_settings SET enabled = false, consent_at = NULL WHERE phone IS NULL AND enabled;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_whatsapp_settings_consent_check') THEN
    ALTER TABLE business_whatsapp_settings
      ADD CONSTRAINT business_whatsapp_settings_consent_check
      CHECK (NOT enabled OR (phone IS NOT NULL AND consent_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_whatsapp_settings_phone_check') THEN
    ALTER TABLE business_whatsapp_settings
      ADD CONSTRAINT business_whatsapp_settings_phone_check
      CHECK (phone IS NULL OR phone ~ '^[0-9]{10,11}$');
  END IF;
END $$;

/* ------------------------------ Fila de envio ------------------------------ */

CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id      uuid,
  event               text NOT NULL,
  to_phone            text NOT NULL,
  params              jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedupe_key          text,
  status              text NOT NULL DEFAULT 'pending',
  attempts            integer NOT NULL DEFAULT 0,
  max_attempts        integer NOT NULL DEFAULT 5,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  locked_until        timestamptz,
  last_attempt_at     timestamptz,
  sent_at             timestamptz,
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Atualização a partir da versão anterior do 015 (que só registrava o resultado)
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS params          jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS dedupe_key      text;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS attempts        integer NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS max_attempts    integer NOT NULL DEFAULT 5;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours');
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS locked_until    timestamptz;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS sent_at         timestamptz;
ALTER TABLE whatsapp_deliveries ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();
ALTER TABLE whatsapp_deliveries ALTER COLUMN status SET DEFAULT 'pending';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_deliveries_status_check') THEN
    ALTER TABLE whatsapp_deliveries DROP CONSTRAINT whatsapp_deliveries_status_check;
  END IF;
  ALTER TABLE whatsapp_deliveries
    ADD CONSTRAINT whatsapp_deliveries_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_deliveries_event_check') THEN
    ALTER TABLE whatsapp_deliveries
      ADD CONSTRAINT whatsapp_deliveries_event_check
      CHECK (event IN ('new_booking', 'cancellation', 'reschedule', 'test'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_deliveries_attempts_check') THEN
    ALTER TABLE whatsapp_deliveries
      ADD CONSTRAINT whatsapp_deliveries_attempts_check
      CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10);
  END IF;
END $$;

-- Idempotência: o mesmo evento do mesmo agendamento nunca entra duas vezes na fila.
-- A chave de reagendamento inclui o novo horário e o updated_at, então remarcações sucessivas são distintas.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_deliveries_dedupe_idx
  ON whatsapp_deliveries (business_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Busca da fila pelo processador
CREATE INDEX IF NOT EXISTS whatsapp_deliveries_queue_idx
  ON whatsapp_deliveries (next_attempt_at) WHERE status IN ('pending', 'processing');

-- Histórico por estabelecimento
CREATE INDEX IF NOT EXISTS whatsapp_deliveries_business_idx
  ON whatsapp_deliveries (business_id, created_at DESC);

COMMIT;
