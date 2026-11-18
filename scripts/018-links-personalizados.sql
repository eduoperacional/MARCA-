-- 018 - Links personalizados de agendamento (histórico de endereços antigos)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 017.
-- Não altera nenhuma coluna existente: businesses.slug continua sendo o endereço atual
-- e businesses.id continua sendo a identificação interna do estabelecimento.
--
-- business_slug_history guarda cada endereço que o estabelecimento já usou.
-- Links antigos (/agendar/<slug-antigo>) são resolvidos por esta tabela e
-- redirecionados permanentemente para o endereço atual. Um endereço antigo
-- continua reservado para o mesmo estabelecimento e nunca é cedido a outro.

BEGIN;

CREATE TABLE IF NOT EXISTS business_slug_history (
  slug        text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_slug_history_business_idx
  ON business_slug_history (business_id);

COMMIT;
