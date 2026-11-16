-- 015 - Notificações por WhatsApp para o proprietário
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 014.
-- O código funciona antes deste script (o card de WhatsApp avisa que a configuração está indisponível),
-- mas as preferências só são salvas depois que ele for executado.
--
-- business_whatsapp_settings  número de destino e preferências, uma linha por estabelecimento
-- whatsapp_deliveries         registro de cada tentativa de envio (enviado, falhou, ignorado)
--
-- Não altera nenhuma tabela existente. Estabelecimentos já cadastrados recebem o telefone
-- do próprio estabelecimento como sugestão de destino, com as notificações ativadas.

BEGIN;

CREATE TABLE IF NOT EXISTS business_whatsapp_settings (
  business_id         uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  phone               text,
  enabled             boolean NOT NULL DEFAULT true,
  notify_new_booking  boolean NOT NULL DEFAULT true,
  notify_cancellation boolean NOT NULL DEFAULT true,
  notify_reschedule   boolean NOT NULL DEFAULT true,
  last_test_at        timestamptz,
  last_test_status    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id      uuid,
  event               text NOT NULL,
  to_phone            text NOT NULL,
  status              text NOT NULL,
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_deliveries_status_check') THEN
    ALTER TABLE whatsapp_deliveries
      ADD CONSTRAINT whatsapp_deliveries_status_check CHECK (status IN ('sent', 'failed', 'skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS whatsapp_deliveries_business_idx ON whatsapp_deliveries (business_id, created_at DESC);

INSERT INTO business_whatsapp_settings (business_id, phone)
SELECT id, regexp_replace(phone, '\D', '', 'g')
FROM businesses
WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 13
ON CONFLICT (business_id) DO NOTHING;

COMMIT;
