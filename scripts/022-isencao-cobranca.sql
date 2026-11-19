ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;
