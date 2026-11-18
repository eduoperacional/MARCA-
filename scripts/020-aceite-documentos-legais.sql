-- 020 - Registro do aceite dos Termos de Uso e da Política de Privacidade
-- Idempotente: pode ser executado mais de uma vez. Rode DEPOIS do 019.
--
-- Uma linha por usuário e por combinação de versões aceitas. Ao publicar uma nova versão
-- dos documentos, um novo aceite gera uma nova linha; o histórico anterior é preservado.
-- accepted_at é preenchido pelo banco (horário do servidor), nunca pelo navegador.
--
-- O código publicado antes desta migration continua cadastrando usuários normalmente:
-- se a tabela não existir, o aceite apenas não é gravado e o erro aparece no log
-- "[legal] Falha ao registrar aceite dos documentos".

BEGIN;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  terms_version   text NOT NULL,
  privacy_version text NOT NULL,
  source          text NOT NULL DEFAULT 'signup',
  accepted_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_versions_uidx
  ON legal_acceptances (user_id, terms_version, privacy_version);

COMMIT;

-- Conferência
SELECT terms_version, privacy_version, count(*) AS aceites, max(accepted_at) AS ultimo_aceite
FROM legal_acceptances
GROUP BY terms_version, privacy_version
ORDER BY ultimo_aceite DESC;
