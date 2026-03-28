
-- AUDIT FIX: Documentar views globais por design (SOC2/ISO27001 compliance)
-- Estas views sao intencionalmente sem filtro de tenant por serem administrativas

-- 1. Documentar rate_limit_stats
COMMENT ON VIEW public.rate_limit_stats IS 
'GLOBAL_VIEW: Rate limiting statistics for admin monitoring. No tenant isolation - restricted to admin/super_admin roles via RLS. Last audit: 2026-02-05.';

-- 2. Documentar v_cron_health
COMMENT ON VIEW public.v_cron_health IS 
'GLOBAL_VIEW: Cron job health monitoring. System-wide data without tenant isolation. Intended for internal system monitoring. Last audit: 2026-02-05.';

-- 3. Documentar v_security_invariants
COMMENT ON VIEW public.v_security_invariants IS 
'GLOBAL_VIEW: Security invariants proof-of-existence view. Aggregates system-wide security metrics for audit purposes. No tenant isolation by design. Last audit: 2026-02-05.';

-- 4. Fix NULL handling: Update agent with NULL heartbeat to proper state
UPDATE agents 
SET 
  agent_state = 'pending',
  agent_state_reason = 'Awaiting first heartbeat',
  agent_state_changed_at = NOW()
WHERE id = '72d3bf11-6c93-4084-83ea-1c66ddec0143'
  AND last_heartbeat IS NULL;

-- 5. Add NOT NULL constraint with default for future agent_state issues
-- First, backfill any NULL agent_state values
UPDATE agents
SET agent_state = COALESCE(agent_state, 
  CASE 
    WHEN archived_at IS NOT NULL THEN 'archived'
    WHEN last_heartbeat IS NULL THEN 'pending'
    WHEN last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    ELSE 'healthy'
  END
)
WHERE agent_state IS NULL;

-- 6. Create function to auto-derive agent_state if NULL (defensive)
CREATE OR REPLACE FUNCTION public.derive_agent_state_if_null()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.agent_state IS NULL THEN
    NEW.agent_state := CASE 
      WHEN NEW.archived_at IS NOT NULL THEN 'archived'
      WHEN NEW.last_heartbeat IS NULL THEN 'pending'
      WHEN NEW.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
      ELSE 'healthy'
    END;
    NEW.agent_state_reason := 'Auto-derived by system trigger';
    NEW.agent_state_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Create trigger to prevent NULL agent_state
DROP TRIGGER IF EXISTS trg_derive_agent_state ON agents;
CREATE TRIGGER trg_derive_agent_state
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION derive_agent_state_if_null();

-- 8. Verify all SECURITY DEFINER functions have search_path (extra validation)
-- This is a read-only check, logged for audit purposes
DO $$
DECLARE
  func_count INTEGER;
  unsafe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO func_count 
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true;
  
  SELECT COUNT(*) INTO unsafe_count 
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' 
    AND p.prosecdef = true 
    AND (p.proconfig IS NULL OR NOT 'search_path=public' = ANY(p.proconfig));
  
  IF unsafe_count > 0 THEN
    RAISE WARNING 'AUDIT: % SECURITY DEFINER functions without search_path=public', unsafe_count;
  ELSE
    RAISE NOTICE 'AUDIT PASSED: All % SECURITY DEFINER functions have search_path=public', func_count;
  END IF;
END;
$$;
