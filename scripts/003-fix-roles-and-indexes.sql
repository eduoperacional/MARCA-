-- MARCAÍ · Correção de funções da equipe e índices.
-- Necessário em bancos onde business_members/invitations já existiam antes do
-- script 002 (o CREATE TABLE IF NOT EXISTS não atualiza restrições antigas).
-- Idempotente: pode ser executado mais de uma vez com segurança.

BEGIN;

ALTER TABLE business_members DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE business_members
  ADD CONSTRAINT business_members_role_check
  CHECK (role IN ('owner', 'manager', 'professional', 'receptionist'));

ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('manager', 'professional', 'receptionist'));

-- Garante no máximo um dono por estabelecimento.
CREATE UNIQUE INDEX IF NOT EXISTS business_members_one_owner
  ON business_members (business_id) WHERE role = 'owner';

-- Listagem de convites por estabelecimento, mais recentes primeiro.
DROP INDEX IF EXISTS invitations_business_idx;
CREATE INDEX invitations_business_idx
  ON invitations (business_id, created_at DESC);

COMMIT;
