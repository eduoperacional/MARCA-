-- 021 - Índices da limpeza automática de dados temporários (/api/cron/retention)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 020.
--
-- Só cria índices; não apaga nada. A rotina funciona sem eles, apenas com varredura completa.
-- As chaves antigas de rate limit com telefone em texto puro NÃO são apagadas aqui, para não
-- zerar contadores ainda vigentes: elas expiram em até 24 h e a limpeza diária as remove.

BEGIN;

CREATE INDEX IF NOT EXISTS app_rate_limits_reset_idx ON app_rate_limits (reset_at);

CREATE INDEX IF NOT EXISTS invitations_unaccepted_expiry_idx
  ON invitations (expires_at) WHERE accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_deliveries_retention_idx
  ON whatsapp_deliveries (updated_at) WHERE status IN ('sent', 'skipped', 'failed');

CREATE INDEX IF NOT EXISTS push_deliveries_retention_idx
  ON push_deliveries (updated_at) WHERE status IN ('sent', 'skipped', 'failed');

COMMIT;
