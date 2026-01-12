-- =============================================================================
-- Fix: v_security_invariants view to not flag intentional blocking policies
-- Backfill: task fingerprints for existing tasks
-- =============================================================================

-- Drop and recreate v_security_invariants with better logic
DROP VIEW IF EXISTS public.v_security_invariants;

CREATE VIEW public.v_security_invariants 
WITH (security_invoker = on)
AS
SELECT 
  'PUBLIC_WRITE_POLICIES' as invariant,
  CASE WHEN COUNT(*) > 0 THEN 'CRITICAL' ELSE 'OK' END as status,
  COUNT(*)::int as violations
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text LIKE '%public%'
  AND (
    -- Truly dangerous: UPDATE/DELETE with USING(true) or null
    (cmd IN ('UPDATE', 'DELETE', 'ALL') AND (qual = 'true' OR (qual IS NULL AND with_check != 'false')))
    OR
    -- Truly dangerous: INSERT with WITH CHECK(true) - but NOT WITH CHECK(false) which blocks
    (cmd = 'INSERT' AND with_check = 'true')
  )
  -- Exclude service_role only policies 
  AND qual IS DISTINCT FROM '(auth.role() = ''service_role''::text)'
  AND qual IS DISTINCT FROM '((auth.jwt() ->> ''role''::text) = ''service_role''::text)';

COMMENT ON VIEW public.v_security_invariants IS 
'Security invariants check - fixed to not flag intentional blocking policies (WITH CHECK false)';

-- Backfill fingerprints for tasks without one
-- The trigger calculate_task_fingerprint should handle new tasks
-- For existing, we update to trigger recalculation

DO $$
DECLARE
  v_updated int;
BEGIN
  -- Update tasks without fingerprint to trigger the fingerprint calculation
  WITH tasks_to_update AS (
    SELECT id FROM tasks 
    WHERE fingerprint_id IS NULL 
    AND source_type IS NOT NULL
    LIMIT 500
  )
  UPDATE tasks t
  SET updated_at = NOW()
  FROM tasks_to_update ttu
  WHERE t.id = ttu.id;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % tasks to trigger fingerprint calculation', v_updated;
END $$;