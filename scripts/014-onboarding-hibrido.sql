-- 014 - Onboarding híbrido (configuração guiada + checklist no painel)
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 013 e ANTES de publicar o código.
--
-- Cria a tabela business_onboarding, que guarda o progresso de configuração de cada estabelecimento:
--   mode            'guided' (assistente) ou 'manual' (pelo painel); o cliente pode trocar quando quiser
--   reviewed_steps  etapas confirmadas explicitamente ('business','hours','rules','page'); serviços e
--                   profissionais são detectados pelos próprios cadastros e não dependem desta coluna
--   dismissed_at    checklist ocultado no painel (pode ser reexibido pela Central de Ajuda)
--   ready_at        momento em que o estabelecimento ficou pronto para receber agendamentos
--
-- Não altera nenhuma tabela existente. Estabelecimentos que já concluíram o cadastro antigo
-- (onboarding_completed_at preenchido) recebem as etapas como revisadas e ready_at preenchido.

BEGIN;

CREATE TABLE IF NOT EXISTS business_onboarding (
  business_id    uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  mode           text NOT NULL DEFAULT 'guided',
  reviewed_steps text[] NOT NULL DEFAULT '{}',
  dismissed_at   timestamptz,
  ready_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_onboarding_mode_check'
  ) THEN
    ALTER TABLE business_onboarding
      ADD CONSTRAINT business_onboarding_mode_check CHECK (mode IN ('guided', 'manual'));
  END IF;
END $$;

INSERT INTO business_onboarding (business_id, mode, reviewed_steps, ready_at)
SELECT id, 'guided', ARRAY['business', 'hours', 'rules', 'page']::text[], onboarding_completed_at
FROM businesses
WHERE onboarding_completed_at IS NOT NULL
ON CONFLICT (business_id) DO NOTHING;

COMMIT;

-- Conferência (opcional): deve listar a tabela e a quantidade de estabelecimentos migrados.
SELECT
  (SELECT count(*) FROM business_onboarding)                       AS registros_onboarding,
  (SELECT count(*) FROM businesses WHERE onboarding_completed_at IS NOT NULL) AS estabelecimentos_concluidos;
