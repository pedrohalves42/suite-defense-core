-- PP02-B canary rollback: remove tenant override for hmac_success_coalescing
-- Reason: NO-TRAFFIC at T+30 and T+60; canary tenant had no agent heartbeat in window.
-- Global flag remains OFF. Auth/HMAC group = PASS, coalescer = NO-TRAFFIC (not a bug).
-- See docs/audits/active/pp02b-canary-result.md

DELETE FROM public.feature_flags
WHERE id = 'b07ac461-bc8d-469d-a58e-d3aa0135ccfd'
  AND key = 'hmac_success_coalescing'
  AND tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e';

-- Sanity: confirm global row is still OFF (no-op SELECT inside DO block for logging)
DO $$
DECLARE
  global_enabled boolean;
BEGIN
  SELECT enabled INTO global_enabled
  FROM public.feature_flags
  WHERE key = 'hmac_success_coalescing' AND tenant_id IS NULL;

  IF global_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PP02-B rollback aborted: global hmac_success_coalescing is not OFF (value=%)', global_enabled;
  END IF;

  RAISE NOTICE 'PP02-B rollback OK: override removed, global remains OFF';
END$$;