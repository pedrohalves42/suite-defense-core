-- CI Validation: Verify agents_public view does not expose sensitive fields
-- This test ensures cryptographic secrets are never exposed through public views

DO $$
DECLARE
  exposed_fields text[];
BEGIN
  -- Check for sensitive field exposure in agents_public view
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE viewname = 'agents_public' 
    AND schemaname = 'public'
    AND (
      definition LIKE '%hmac_secret%' 
      OR definition LIKE '%payload_hash%'
      OR definition LIKE '%result_public_key%'
      OR definition LIKE '%result_key_fingerprint%'
      OR definition LIKE '%nonce%'
    )
  ) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: agents_public view exposes sensitive cryptographic fields!';
  END IF;

  -- Check agents_safe doesn't expose secrets either
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE viewname = 'agents_safe' 
    AND schemaname = 'public'
    AND (
      definition LIKE '%hmac_secret%' 
      OR definition LIKE '%payload_hash%'
      OR definition LIKE '%result_public_key%'
    )
  ) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: agents_safe view exposes sensitive cryptographic fields!';
  END IF;
  
  RAISE NOTICE 'PASS: No sensitive fields exposed in public agent views';
END $$;
