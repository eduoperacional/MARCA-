BEGIN;

DO $$
DECLARE
  studio_bella_id uuid;
  matching_businesses integer;
BEGIN
  SELECT count(*) INTO matching_businesses
  FROM businesses
  WHERE slug = 'studio-bella';

  IF matching_businesses <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente um estabelecimento com slug studio-bella; encontrados: %', matching_businesses;
  END IF;

  SELECT id INTO studio_bella_id
  FROM businesses
  WHERE slug = 'studio-bella';

  UPDATE businesses
  SET billing_exempt = true
  WHERE id = studio_bella_id;

  UPDATE subscriptions
  SET gateway_cancel_status = 'pending',
      gateway_cancel_attempts = 0,
      gateway_cancel_last_attempt_at = NULL,
      gateway_cancel_last_error = NULL
  WHERE business_id = studio_bella_id
    AND gateway_subscription_id IS NOT NULL
    AND (gateway_cancel_status IS NULL OR gateway_cancel_status = 'failed');
END $$;

COMMIT;
