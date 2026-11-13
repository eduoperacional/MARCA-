-- 004: libera acesso de proprietário (owner) a um usuário já cadastrado.
-- Uso: troque o e-mail abaixo pelo e-mail usado em /cadastro e rode o script.
-- Idempotente: pode ser executado mais de uma vez.
-- Vincula o usuário como owner de todos os estabelecimentos que ainda não têm
-- outro proprietário. Estabelecimentos com outro owner não são alterados.

DO $$
DECLARE
  v_email text := 'SEU_EMAIL_AQUI@exemplo.com';
  v_user  text;
  v_biz   uuid;
  v_count int := 0;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE lower(email) = lower(v_email);

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado. Crie a conta em /cadastro primeiro.', v_email;
  END IF;

  FOR v_biz IN
    SELECT b.id
    FROM businesses b
    WHERE NOT EXISTS (
      SELECT 1 FROM business_members m
      WHERE m.business_id = b.id AND m.role = 'owner' AND m.user_id <> v_user
    )
  LOOP
    INSERT INTO business_members (business_id, user_id, role, active)
    VALUES (v_biz, v_user, 'owner', true)
    ON CONFLICT (business_id, user_id)
    DO UPDATE SET role = 'owner', active = true;
    v_count := v_count + 1;
  END LOOP;

  UPDATE "user" SET "emailVerified" = true WHERE id = v_user;

  RAISE NOTICE 'Usuário % agora é owner de % estabelecimento(s).', v_email, v_count;
END $$;

-- Conferência:
-- SELECT b.name, m.role, m.active
-- FROM business_members m JOIN businesses b ON b.id = m.business_id
-- JOIN "user" u ON u.id = m.user_id
-- WHERE lower(u.email) = lower('SEU_EMAIL_AQUI@exemplo.com');
