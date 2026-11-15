-- 007: libera o acesso de super admin ao painel /admin.
-- Troque o e-mail abaixo pelo e-mail EXATO da sua conta (o mesmo usado em /entrar).
-- Idempotente: pode rodar quantas vezes quiser.

DO $$
DECLARE
  v_email text := 'cascadebala1900@gmail.com';
  v_user  text;
BEGIN
  IF to_regclass('public.platform_admins') IS NULL THEN
    RAISE EXCEPTION 'Tabela platform_admins não existe. Rode antes o scripts/006-super-admin.sql.';
  END IF;

  SELECT id INTO v_user FROM "user" WHERE lower(email) = lower(trim(v_email));

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta com o e-mail %. Crie a conta em /cadastro ou confira o e-mail.', v_email;
  END IF;

  INSERT INTO platform_admins (user_id, role, active, created_by)
  VALUES (v_user, 'super_admin', true, 'script-007')
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', active = true;

  RAISE NOTICE 'Usuário % agora é super admin.', v_email;
END $$;

-- Conferência:
SELECT u.email, a.role, a.active
FROM platform_admins a
JOIN "user" u ON u.id = a.user_id;
