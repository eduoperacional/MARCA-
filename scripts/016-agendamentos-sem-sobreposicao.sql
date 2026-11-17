-- 016 - Impede dois agendamentos simultâneos para o mesmo profissional no mesmo estabelecimento
-- Alvo: public.appointments (tabela física, confirmada na auditoria de produção).
-- Idempotente e não destrutivo: não apaga, não altera e não move nenhuma linha existente.
-- Roda numa transação única: se qualquer verificação falhar, o script ABORTA e nada é aplicado
-- (nem a extensão, nem a constraint). Em clientes que mantêm a sessão aberta (psql, DBeaver),
-- execute ROLLBACK; após um aborto antes de tentar de novo.
--
-- Colunas exigidas em public.appointments (lib/db/schema.ts), conferidas antes de criar a regra:
--   business_id uuid, professional_id uuid, starts_at e ends_at timestamptz (ou timestamp, ambas iguais),
--   status text ou varchar
--
-- Status que ocupam o horário (lib/appointment-status.ts → ACTIVE_STATUSES):
--   pending, confirmed, in_progress, completed
-- Status que liberam o horário: cancelled, no_show
-- Intervalo semiaberto [início, fim): 09:00–09:30 e 09:30–10:00 NÃO conflitam.

/* ---------------------------------------------------------------------------
   PASSO 0 · Diagnóstico (somente leitura). Opcional; rode antes, separadamente, se quiser conferir.
   ---------------------------------------------------------------------------

-- 0.1 Colunas e tipos reais:
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'appointments'
ORDER BY ordinal_position;

-- 0.2 Extensão btree_gist (vazio = ainda não instalada; o script instala):
SELECT extname, extversion FROM pg_extension WHERE extname = 'btree_gist';

-- 0.3 Constraints atuais (contype x = EXCLUDE):
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass;

-- 0.4 Status existentes:
SELECT status, count(*) FROM public.appointments GROUP BY status ORDER BY status;

-- 0.5 Conflitos já existentes entre agendamentos que ocupam horário:
SELECT a.business_id, a.professional_id,
       a.id AS agendamento_a, a.starts_at AS inicio_a, a.ends_at AS fim_a, a.status AS status_a,
       b.id AS agendamento_b, b.starts_at AS inicio_b, b.ends_at AS fim_b, b.status AS status_b
FROM public.appointments a
JOIN public.appointments b
  ON b.business_id = a.business_id
 AND b.professional_id = a.professional_id
 AND a.id < b.id
 AND a.starts_at < b.ends_at
 AND b.starts_at < a.ends_at
WHERE a.status IN ('pending', 'confirmed', 'in_progress', 'completed')
  AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')
ORDER BY a.business_id, a.professional_id, a.starts_at;
--------------------------------------------------------------------------- */

BEGIN;

-- Não espera indefinidamente por locks: se a tabela estiver ocupada, falha e pode ser repetido.
SET LOCAL lock_timeout = '5s';

-- 1) Verificações. Qualquer falha aborta a transação inteira.
DO $$
DECLARE
  app_kind         "char";
  wrong_cols       text;
  start_type       text;
  end_type         text;
  unknown_statuses text;
  invalid_count    bigint;
  overlap_count    bigint;
BEGIN
  SELECT c.relkind INTO app_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'appointments';

  IF app_kind IS NULL THEN
    RAISE EXCEPTION 'public.appointments não existe. Nada foi alterado.';
  ELSIF app_kind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION 'public.appointments não é uma tabela física (relkind = %). Nada foi alterado.', app_kind;
  END IF;

  SELECT string_agg(
           expected.col || ' (esperado ' || expected.label || ', encontrado ' || coalesce(c.data_type, 'ausente') || ')',
           ', ' ORDER BY expected.ord)
  INTO wrong_cols
  FROM (VALUES
    (1, 'business_id',     'uuid',        ARRAY['uuid']),
    (2, 'professional_id', 'uuid',        ARRAY['uuid']),
    (3, 'starts_at',       'timestamptz', ARRAY['timestamp with time zone', 'timestamp without time zone']),
    (4, 'ends_at',         'timestamptz', ARRAY['timestamp with time zone', 'timestamp without time zone']),
    (5, 'status',          'text',        ARRAY['text', 'character varying']),
    (6, 'id',              'uuid',        ARRAY['uuid'])
  ) AS expected(ord, col, label, accepted)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = 'appointments' AND c.column_name = expected.col
  WHERE c.data_type IS NULL OR NOT (c.data_type = ANY (expected.accepted));

  IF wrong_cols IS NOT NULL THEN
    RAISE EXCEPTION 'public.appointments não tem as colunas esperadas: %. Nada foi alterado. Veja o passo 0.1.', wrong_cols;
  END IF;

  SELECT data_type INTO start_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'starts_at';
  SELECT data_type INTO end_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'ends_at';
  IF start_type <> end_type THEN
    RAISE EXCEPTION 'starts_at (%) e ends_at (%) têm tipos diferentes. Nada foi alterado.', start_type, end_type;
  END IF;

  SELECT string_agg(DISTINCT coalesce(status::text, 'NULL'), ', ') INTO unknown_statuses
  FROM public.appointments
  WHERE status IS NULL
     OR status::text NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
  IF unknown_statuses IS NOT NULL THEN
    RAISE EXCEPTION 'public.appointments tem status desconhecidos: %. Nada foi alterado. Veja o passo 0.4.', unknown_statuses;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.appointments
  WHERE ends_at < starts_at AND status IN ('pending', 'confirmed', 'in_progress', 'completed');
  IF invalid_count > 0 THEN
    RAISE EXCEPTION '% agendamento(s) ativo(s) com término antes do início. Nada foi alterado.', invalid_count;
  END IF;

  SELECT count(*) INTO overlap_count
  FROM public.appointments a
  JOIN public.appointments b
    ON b.business_id = a.business_id
   AND b.professional_id = a.professional_id
   AND a.id < b.id
   AND a.starts_at < b.ends_at
   AND b.starts_at < a.ends_at
  WHERE a.status IN ('pending', 'confirmed', 'in_progress', 'completed')
    AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed');
  IF overlap_count > 0 THEN
    RAISE EXCEPTION '% par(es) de agendamentos já se sobrepõem. Nada foi alterado. Liste com o passo 0.5, resolva (cancelar ou remarcar) e rode de novo.', overlap_count;
  END IF;
END $$;

-- 2) Necessária para combinar igualdade de uuid com sobreposição de intervalo no mesmo índice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 3) Regra de exclusão (criada uma única vez).
DO $$
DECLARE
  range_fn text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_no_overlap' AND conrelid = 'public.appointments'::regclass
  ) THEN
    RAISE NOTICE 'Constraint appointments_no_overlap já existia em public.appointments. Nada foi alterado.';
    RETURN;
  END IF;

  SELECT CASE data_type WHEN 'timestamp with time zone' THEN 'tstzrange' ELSE 'tsrange' END INTO range_fn
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'starts_at';

  EXECUTE format(
    $f$ALTER TABLE public.appointments
         ADD CONSTRAINT appointments_no_overlap
         EXCLUDE USING gist (
           business_id WITH =,
           professional_id WITH =,
           %s(starts_at, ends_at, '[)') WITH &&
         )
         WHERE (status IN ('pending', 'confirmed', 'in_progress', 'completed'))$f$,
    range_fn
  );
  RAISE NOTICE 'Constraint appointments_no_overlap criada em public.appointments.';
END $$;

COMMIT;

-- Conferência (deve retornar 1 linha com EXCLUDE USING gist ...):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_no_overlap';
--
-- Reversão, se necessário (remove só a regra; nenhum dado é afetado; a extensão pode permanecer):
-- ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
