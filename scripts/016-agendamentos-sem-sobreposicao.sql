-- 016 - Impede dois agendamentos simultâneos para o mesmo profissional no mesmo estabelecimento
-- Alvo: public.appointments (tabela física, confirmada na auditoria de produção).
-- Idempotente e não destrutivo: não apaga, não altera e não move nenhuma linha existente.
-- Roda numa transação única: se qualquer verificação falhar, o script ABORTA e nada é aplicado
-- (nem a extensão, nem a constraint). Em clientes que mantêm a sessão aberta (psql, DBeaver),
-- execute ROLLBACK; após um aborto antes de tentar de novo.
--
-- Nomes de colunas: o script NÃO presume os nomes. Para cada papel, procura no catálogo do banco
-- exatamente uma das colunas abaixo e usa a que existir de fato. Se nenhuma existir, ou se as duas
-- existirem, aborta sem alterar nada.
--   estabelecimento : id_do_negocio   ou business_id      (uuid)
--   profissional    : id_profissional ou professional_id  (uuid)
--   início          : comeca_em       ou starts_at        (timestamptz ou timestamp)
--   término         : termina_em      ou ends_at          (mesmo tipo do início)
--   status          : status                               (text ou varchar)
--   chave           : id                                   (uuid)
--
-- Status que ocupam o horário (lib/appointment-status.ts → ACTIVE_STATUSES):
--   pending, confirmed, in_progress, completed
-- Status que liberam o horário: cancelled, no_show
-- Intervalo semiaberto [início, fim): 09:00–09:30 e 09:30–10:00 NÃO conflitam.

/* ---------------------------------------------------------------------------
   PASSO 0 · Diagnóstico (somente leitura). Opcional; rode antes, separadamente.
   Desative a tradução automática do navegador antes de ler o resultado: ela traduz
   nomes de colunas na tela (ex.: business_id → id_do_negocio). A coluna nome_hex
   não é traduzida e mostra o nome real byte a byte.
   ---------------------------------------------------------------------------

-- 0.1 Colunas e tipos reais:
SELECT column_name, encode(convert_to(column_name, 'UTF8'), 'hex') AS nome_hex,
       data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'appointments'
ORDER BY ordinal_position;

-- 0.2 Extensão btree_gist (vazio = ainda não instalada; o script instala):
SELECT extname, extversion FROM pg_extension WHERE extname = 'btree_gist';

-- 0.3 Constraints atuais (contype x = EXCLUDE):
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass;

-- 0.4 Status existentes:
SELECT status, count(*) FROM public.appointments GROUP BY status ORDER BY status;

-- Conflitos já existentes são contados pelo próprio script (passo 1), com os nomes reais.
--------------------------------------------------------------------------- */

BEGIN;

-- Não espera indefinidamente por locks: se a tabela estiver ocupada, falha e pode ser repetido.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  app_kind         "char";
  col_business     text;
  col_professional text;
  col_start        text;
  col_end          text;
  type_business    text;
  type_professional text;
  type_start       text;
  type_end         text;
  type_status      text;
  type_id          text;
  role_label       text;
  candidates       text[];
  found            text[];
  range_fn         text;
  unknown_statuses text;
  invalid_count    bigint;
  overlap_count    bigint;
  active_filter    constant text := $q$status IN ('pending', 'confirmed', 'in_progress', 'completed')$q$;
BEGIN
  /* 1.1 A tabela existe e é física */
  SELECT c.relkind INTO app_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'appointments';

  IF app_kind IS NULL THEN
    RAISE EXCEPTION 'public.appointments não existe. Nada foi alterado.';
  ELSIF app_kind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION 'public.appointments não é uma tabela física (relkind = %). Nada foi alterado.', app_kind;
  END IF;

  /* 1.2 Resolve o nome real de cada coluna (exatamente um candidato deve existir) */
  FOR role_label, candidates IN
    SELECT * FROM (VALUES
      ('estabelecimento', ARRAY['id_do_negocio', 'business_id']),
      ('profissional',    ARRAY['id_profissional', 'professional_id']),
      ('início',          ARRAY['comeca_em', 'starts_at']),
      ('término',         ARRAY['termina_em', 'ends_at'])
    ) AS r(label, names)
  LOOP
    SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO found
    FROM pg_attribute a
    WHERE a.attrelid = 'public.appointments'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname = ANY (candidates);

    IF found IS NULL THEN
      RAISE EXCEPTION 'Coluna de % não encontrada em public.appointments (procurado: %). Nada foi alterado. Veja o passo 0.1.',
        role_label, array_to_string(candidates, ' ou ');
    ELSIF cardinality(found) > 1 THEN
      RAISE EXCEPTION 'Ambíguo: public.appointments tem mais de uma coluna de % (%). Nada foi alterado.',
        role_label, array_to_string(found, ', ');
    END IF;

    CASE role_label
      WHEN 'estabelecimento' THEN col_business     := found[1];
      WHEN 'profissional'    THEN col_professional := found[1];
      WHEN 'início'          THEN col_start        := found[1];
      WHEN 'término'         THEN col_end          := found[1];
    END CASE;
  END LOOP;

  /* 1.3 Confere os tipos reais */
  SELECT max(data_type) FILTER (WHERE column_name = col_business),
         max(data_type) FILTER (WHERE column_name = col_professional),
         max(data_type) FILTER (WHERE column_name = col_start),
         max(data_type) FILTER (WHERE column_name = col_end),
         max(data_type) FILTER (WHERE column_name = 'status'),
         max(data_type) FILTER (WHERE column_name = 'id')
  INTO type_business, type_professional, type_start, type_end, type_status, type_id
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'appointments';

  IF type_business IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Coluna % deveria ser uuid, encontrado %. Nada foi alterado.', col_business, coalesce(type_business, 'ausente');
  END IF;
  IF type_professional IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Coluna % deveria ser uuid, encontrado %. Nada foi alterado.', col_professional, coalesce(type_professional, 'ausente');
  END IF;
  IF type_id IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Coluna id deveria ser uuid, encontrado %. Nada foi alterado.', coalesce(type_id, 'ausente');
  END IF;
  IF type_start IS NULL OR type_start NOT IN ('timestamp with time zone', 'timestamp without time zone') THEN
    RAISE EXCEPTION 'Coluna % deveria ser timestamptz ou timestamp, encontrado %. Nada foi alterado.', col_start, coalesce(type_start, 'ausente');
  END IF;
  IF type_end IS DISTINCT FROM type_start THEN
    RAISE EXCEPTION 'Colunas % (%) e % (%) têm tipos diferentes. Nada foi alterado.', col_start, type_start, col_end, coalesce(type_end, 'ausente');
  END IF;
  IF type_status IS NULL OR type_status NOT IN ('text', 'character varying') THEN
    RAISE EXCEPTION 'Coluna status deveria ser text ou varchar, encontrado %. Nada foi alterado.', coalesce(type_status, 'ausente');
  END IF;

  /* 1.4 Dados existentes compatíveis com a regra */
  EXECUTE $q$
    SELECT string_agg(DISTINCT coalesce(status::text, 'NULL'), ', ')
    FROM public.appointments
    WHERE status IS NULL
       OR status::text NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
  $q$ INTO unknown_statuses;
  IF unknown_statuses IS NOT NULL THEN
    RAISE EXCEPTION 'public.appointments tem status desconhecidos: %. Nada foi alterado. Veja o passo 0.4.', unknown_statuses;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM public.appointments WHERE %2$I < %1$I AND ' || active_filter,
    col_start, col_end
  ) INTO invalid_count;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION '% agendamento(s) ativo(s) com término antes do início. Nada foi alterado.', invalid_count;
  END IF;

  EXECUTE format(
    $q$SELECT count(*)
       FROM public.appointments a
       JOIN public.appointments b
         ON b.%1$I = a.%1$I
        AND b.%2$I = a.%2$I
        AND a.id < b.id
        AND a.%3$I < b.%4$I
        AND b.%3$I < a.%4$I
       WHERE a.status IN ('pending', 'confirmed', 'in_progress', 'completed')
         AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')$q$,
    col_business, col_professional, col_start, col_end
  ) INTO overlap_count;
  IF overlap_count > 0 THEN
    RAISE EXCEPTION '% par(es) de agendamentos ativos já se sobrepõem. Nada foi alterado. Resolva (cancelar ou remarcar) e rode de novo.', overlap_count;
  END IF;

  /* 2) Extensão necessária para combinar igualdade de uuid com sobreposição de intervalo no GiST */
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS btree_gist';

  /* 3) Regra de exclusão (criada uma única vez) */
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_no_overlap' AND conrelid = 'public.appointments'::regclass
  ) THEN
    RAISE NOTICE 'Constraint appointments_no_overlap já existia em public.appointments. Nada foi alterado.';
    RETURN;
  END IF;

  range_fn := CASE type_start WHEN 'timestamp with time zone' THEN 'tstzrange' ELSE 'tsrange' END;

  EXECUTE format(
    $f$ALTER TABLE public.appointments
         ADD CONSTRAINT appointments_no_overlap
         EXCLUDE USING gist (
           %1$I WITH =,
           %2$I WITH =,
           %5$s(%3$I, %4$I, '[)') WITH &&
         )
         WHERE (status IN ('pending', 'confirmed', 'in_progress', 'completed'))$f$,
    col_business, col_professional, col_start, col_end, range_fn
  );

  RAISE NOTICE 'Constraint appointments_no_overlap criada em public.appointments usando %, %, %(%, %).',
    col_business, col_professional, range_fn, col_start, col_end;

  IF col_business <> 'business_id' OR col_professional <> 'professional_id'
     OR col_start <> 'starts_at' OR col_end <> 'ends_at' THEN
    RAISE WARNING 'A aplicação (lib/db/schema.ts) lê e grava business_id, professional_id, starts_at e ends_at. Com as colunas atuais (%, %, %, %), as consultas da aplicação a public.appointments não funcionam.',
      col_business, col_professional, col_start, col_end;
  END IF;
END $$;

COMMIT;

-- Conferência (deve retornar 1 linha com EXCLUDE USING gist ...):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_no_overlap';
--
-- Reversão, se necessário (remove só a regra; nenhum dado é afetado; a extensão pode permanecer):
-- ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
