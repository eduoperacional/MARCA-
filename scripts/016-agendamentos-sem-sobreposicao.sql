-- 016 - Impede dois agendamentos simultâneos para o mesmo profissional no mesmo estabelecimento
-- Idempotente e não destrutivo: não apaga, não altera e não move nenhuma linha existente.
-- Se o banco não estiver em um dos formatos abaixo, tiver status desconhecidos ou já houver conflitos,
-- o script ABORTA sem aplicar nada.
-- Em clientes que mantêm a sessão aberta (psql, DBeaver), execute ROLLBACK; após um aborto antes de tentar de novo.
--
-- Formatos aceitos (detectados automaticamente, nada é presumido):
--   A) public.appointments é TABELA com business_id, professional_id, starts_at, ends_at, status
--      (bancos criados pelos scripts deste repositório; lib/db/schema.ts).
--   B) public.appointments é VIEW que lê somente public.agendamentos, mapeando
--      id_do_negocio → business_id, id_profissional → professional_id,
--      comeca_em → starts_at, termina_em → ends_at e status → status
--      (formato encontrado na auditoria de produção). A regra é criada na tabela física agendamentos;
--      escritas feitas pela view (pelo app) também são barradas.
--
-- Status que ocupam o horário (lib/appointment-status.ts → ACTIVE_STATUSES):
--   pending, confirmed, in_progress, completed
-- Status que liberam o horário: cancelled, no_show
-- Intervalo semiaberto [início, fim): 09:00–09:30 e 09:30–10:00 NÃO conflitam.

/* ---------------------------------------------------------------------------
   PASSO 0 · Diagnóstico (somente leitura). Rode antes, separadamente, e confira.
   ---------------------------------------------------------------------------

-- 0.1 O que é cada nome? relkind: r = tabela, p = particionada, v = view, m = view materializada
SELECT n.nspname AS schema, c.relname AS nome, c.relkind AS tipo
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('appointments', 'agendamentos');

-- 0.2 Se appointments for view (tipo v), a definição real e as tabelas que ela lê:
SELECT pg_get_viewdef('public.appointments'::regclass, true);
SELECT DISTINCT d.refobjid::regclass AS tabela_lida
FROM pg_rewrite r
JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid AND d.refclassid = 'pg_class'::regclass
WHERE r.ev_class = 'public.appointments'::regclass AND d.refobjid <> 'public.appointments'::regclass;

-- 0.3 Colunas e tipos reais da tabela física:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agendamentos'
ORDER BY ordinal_position;

-- 0.4 Índices e constraints atuais da tabela física:
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agendamentos';
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.agendamentos'::regclass;

-- 0.5 Status existentes (qualquer valor fora dos 6 conhecidos faz o script abortar):
SELECT status, count(*) FROM public.agendamentos GROUP BY status ORDER BY status;

-- 0.6 Conflitos já existentes entre agendamentos que ocupam horário (precisam ser resolvidos à mão):
SELECT a.id_do_negocio, a.id_profissional,
       a.id AS agendamento_a, a.comeca_em AS inicio_a, a.termina_em AS fim_a, a.status AS status_a,
       b.id AS agendamento_b, b.comeca_em AS inicio_b, b.termina_em AS fim_b, b.status AS status_b
FROM public.agendamentos a
JOIN public.agendamentos b
  ON b.id_do_negocio = a.id_do_negocio
 AND b.id_profissional = a.id_profissional
 AND a.id < b.id
 AND a.comeca_em < b.termina_em
 AND b.comeca_em < a.termina_em
WHERE a.status IN ('pending', 'confirmed', 'in_progress', 'completed')
  AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')
ORDER BY a.id_do_negocio, a.id_profissional, a.comeca_em;

-- 0.7 Intervalos invertidos (fim antes do início) em agendamentos que ocupam horário:
SELECT id, id_do_negocio, id_profissional, comeca_em, termina_em, status
FROM public.agendamentos
WHERE termina_em < comeca_em AND status IN ('pending', 'confirmed', 'in_progress', 'completed');

-- Em bancos no formato A, troque agendamentos/colunas em português por appointments e
-- business_id, professional_id, starts_at, ends_at nas consultas 0.3 a 0.7.
--------------------------------------------------------------------------- */

BEGIN;

-- Não espera indefinidamente por locks: se a tabela estiver ocupada, falha e pode ser repetido.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  app_kind         "char";
  target_name      text;
  target_kind      "char";
  col_business     text;
  col_professional text;
  col_start        text;
  col_end          text;
  col_status       text := 'status';
  view_def         text;
  read_tables      text;
  missing_cols     text;
  start_type       text;
  end_type         text;
  range_fn         text;
  unknown_statuses text;
  invalid_count    bigint;
  overlap_count    bigint;
BEGIN
  SELECT c.relkind INTO app_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'appointments';

  IF app_kind IS NULL THEN
    RAISE EXCEPTION 'public.appointments não existe. Nada foi alterado. Rode o diagnóstico (passo 0) e revise.';

  ELSIF app_kind IN ('r', 'p') THEN
    target_name      := 'appointments';
    col_business     := 'business_id';
    col_professional := 'professional_id';
    col_start        := 'starts_at';
    col_end          := 'ends_at';

  ELSIF app_kind = 'v' THEN
    SELECT string_agg(DISTINCT d.refobjid::regclass::text, ', ') INTO read_tables
    FROM pg_rewrite r
    JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid AND d.refclassid = 'pg_class'::regclass
    WHERE r.ev_class = 'public.appointments'::regclass AND d.refobjid <> 'public.appointments'::regclass;

    IF to_regclass('public.agendamentos') IS NULL
       OR read_tables IS DISTINCT FROM to_regclass('public.agendamentos')::text THEN
      RAISE EXCEPTION 'public.appointments é uma view, mas não lê somente public.agendamentos (lê: %). Nada foi alterado. Veja o passo 0.2.', coalesce(read_tables, 'nenhuma');
    END IF;

    view_def := pg_get_viewdef('public.appointments'::regclass, true);
    IF view_def !~ '\mid_do_negocio AS business_id\M'
       OR view_def !~ '\mid_profissional AS professional_id\M'
       OR view_def !~ '\mcomeca_em AS starts_at\M'
       OR view_def !~ '\mtermina_em AS ends_at\M'
       OR view_def ~ '\mAS status\M' THEN
      RAISE EXCEPTION 'A view public.appointments não mapeia as colunas como esperado (id_do_negocio, id_profissional, comeca_em, termina_em, status). Nada foi alterado. Veja o passo 0.2.';
    END IF;

    target_name      := 'agendamentos';
    col_business     := 'id_do_negocio';
    col_professional := 'id_profissional';
    col_start        := 'comeca_em';
    col_end          := 'termina_em';

  ELSE
    RAISE EXCEPTION 'public.appointments não é tabela nem view (relkind = %). Nada foi alterado.', app_kind;
  END IF;

  SELECT c.relkind INTO target_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = target_name;
  IF target_kind IS NULL OR target_kind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION 'public.% não é uma tabela física (relkind = %). Nada foi alterado.', target_name, coalesce(target_kind::text, 'inexistente');
  END IF;

  SELECT string_agg(expected.col || ' ' || expected.typ, ', ' ORDER BY expected.ord) INTO missing_cols
  FROM (VALUES
    (1, col_business,     'uuid'),
    (2, col_professional, 'uuid'),
    (3, col_start,        'timestamp'),
    (4, col_end,          'timestamp'),
    (5, col_status,       'text')
  ) AS expected(ord, col, typ)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = target_name
      AND c.column_name = expected.col
      AND CASE expected.typ
            WHEN 'timestamp' THEN c.data_type IN ('timestamp with time zone', 'timestamp without time zone')
            WHEN 'text'      THEN c.data_type IN ('text', 'character varying')
            ELSE c.data_type = expected.typ
          END
  );
  IF missing_cols IS NOT NULL THEN
    RAISE EXCEPTION 'public.% não tem as colunas esperadas: %. Nada foi alterado.', target_name, missing_cols;
  END IF;

  SELECT data_type INTO start_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = target_name AND column_name = col_start;
  SELECT data_type INTO end_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = target_name AND column_name = col_end;
  IF start_type <> end_type THEN
    RAISE EXCEPTION '% (%) e % (%) têm tipos diferentes. Nada foi alterado.', col_start, start_type, col_end, end_type;
  END IF;
  range_fn := CASE start_type WHEN 'timestamp with time zone' THEN 'tstzrange' ELSE 'tsrange' END;

  EXECUTE format(
    $f$SELECT string_agg(DISTINCT coalesce(%1$I::text, 'NULL'), ', ') FROM public.%2$I
       WHERE %1$I IS NULL OR %1$I::text NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')$f$,
    col_status, target_name
  ) INTO unknown_statuses;
  IF unknown_statuses IS NOT NULL THEN
    RAISE EXCEPTION 'public.% tem status desconhecidos: %. Nada foi alterado. Veja o passo 0.5.', target_name, unknown_statuses;
  END IF;

  EXECUTE format(
    $f$SELECT count(*) FROM public.%1$I
       WHERE %3$I < %2$I AND %4$I IN ('pending', 'confirmed', 'in_progress', 'completed')$f$,
    target_name, col_start, col_end, col_status
  ) INTO invalid_count;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION '% agendamento(s) ativo(s) com término antes do início. Nada foi alterado. Veja o passo 0.7.', invalid_count;
  END IF;

  EXECUTE format(
    $f$SELECT count(*) FROM public.%1$I a
       JOIN public.%1$I b
         ON b.%2$I = a.%2$I
        AND b.%3$I = a.%3$I
        AND a.id < b.id
        AND a.%4$I < b.%5$I
        AND b.%4$I < a.%5$I
       WHERE a.%6$I IN ('pending', 'confirmed', 'in_progress', 'completed')
         AND b.%6$I IN ('pending', 'confirmed', 'in_progress', 'completed')$f$,
    target_name, col_business, col_professional, col_start, col_end, col_status
  ) INTO overlap_count;
  IF overlap_count > 0 THEN
    RAISE EXCEPTION '% par(es) de agendamentos já se sobrepõem. Nada foi alterado. Liste com o passo 0.6, resolva (cancelar ou remarcar) e rode de novo.', overlap_count;
  END IF;

  -- Necessária para combinar igualdade de uuid com sobreposição de intervalo no mesmo índice GiST.
  CREATE EXTENSION IF NOT EXISTS btree_gist;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_no_overlap' AND conrelid = format('public.%I', target_name)::regclass
  ) THEN
    EXECUTE format(
      $f$ALTER TABLE public.%I
           ADD CONSTRAINT appointments_no_overlap
           EXCLUDE USING gist (
             %I WITH =,
             %I WITH =,
             %s(%I, %I, '[)') WITH &&
           )
           WHERE (%I IN ('pending', 'confirmed', 'in_progress', 'completed'))$f$,
      target_name, col_business, col_professional, range_fn, col_start, col_end, col_status
    );
    RAISE NOTICE 'Constraint appointments_no_overlap criada em public.%.', target_name;
  ELSE
    RAISE NOTICE 'Constraint appointments_no_overlap já existia em public.%. Nada foi alterado.', target_name;
  END IF;
END $$;

COMMIT;

-- Conferência (deve retornar 1 linha com EXCLUDE USING gist ... na tabela física):
-- SELECT conrelid::regclass AS tabela, conname, pg_get_constraintdef(oid)
-- FROM pg_constraint WHERE conname = 'appointments_no_overlap';
--
-- Reversão, se necessário (remove só a regra; nenhum dado é afetado). Use a tabela mostrada na conferência:
-- ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS appointments_no_overlap;
-- ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;  -- só no formato A
