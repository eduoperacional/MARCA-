ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS partner_benefit_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_benefit_category text,
  ADD COLUMN IF NOT EXISTS partner_benefit_granted_by text,
  ADD COLUMN IF NOT EXISTS partner_benefit_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_benefit_revoked_by text,
  ADD COLUMN IF NOT EXISTS partner_benefit_revoked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'businesses_partner_benefit_category_check'
      AND conrelid = 'businesses'::regclass
  ) THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_partner_benefit_category_check
      CHECK (partner_benefit_category IS NULL OR partner_benefit_category IN ('promotion_partner'));
  END IF;
END
$$;
