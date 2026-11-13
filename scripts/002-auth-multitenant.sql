-- MARCAÍ · Autenticação, equipe e isolamento por estabelecimento.
-- Idempotente: pode ser executado mais de uma vez com segurança.

-- 1. Tabelas do Better Auth --------------------------------------------------
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "phone" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" text PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" text;
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- 2. Estabelecimento: identidade visual e onboarding ------------------------
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#7B3FF2';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES "user" ("id") ON DELETE SET NULL;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
CREATE INDEX IF NOT EXISTS businesses_owner_idx ON businesses (owner_user_id);

-- 3. Equipe, convites e preferências -----------------------------------------
CREATE TABLE IF NOT EXISTS business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'professional', 'receptionist')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  professional_id uuid REFERENCES professionals (id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS business_members_user_idx ON business_members (user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'professional', 'receptionist')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  professional_id uuid REFERENCES professionals (id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_business_idx ON invitations (business_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  notify_new_booking boolean NOT NULL DEFAULT true,
  notify_cancellation boolean NOT NULL DEFAULT true,
  weekly_summary boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);

-- 4. Índices de isolamento por estabelecimento -------------------------------
CREATE INDEX IF NOT EXISTS professionals_business_idx ON professionals (business_id);
CREATE INDEX IF NOT EXISTS services_business_idx ON services (business_id);
CREATE INDEX IF NOT EXISTS clients_business_idx ON clients (business_id);
CREATE INDEX IF NOT EXISTS appointments_business_starts_idx ON appointments (business_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_professional_starts_idx ON appointments (professional_id, starts_at);
CREATE INDEX IF NOT EXISTS payments_business_idx ON payments (business_id, paid_at);
CREATE INDEX IF NOT EXISTS expenses_business_idx ON expenses (business_id, date);
CREATE INDEX IF NOT EXISTS time_blocks_business_idx ON time_blocks (business_id, starts_at);
CREATE INDEX IF NOT EXISTS notifications_business_idx ON notifications (business_id, created_at);
