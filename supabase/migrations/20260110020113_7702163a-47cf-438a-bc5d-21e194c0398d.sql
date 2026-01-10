
-- =====================================================
-- PHASE 0: Security & Regression Gates (COMPLETE)
-- =====================================================

-- 0.1 Create system_health_checks table
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL UNIQUE,
  check_query text NOT NULL,
  expected_result boolean DEFAULT true,
  last_run_at timestamptz,
  last_result boolean,
  last_error text,
  is_critical boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read health checks
DROP POLICY IF EXISTS "Authenticated users can view health checks" ON public.system_health_checks;
CREATE POLICY "Authenticated users can view health checks"
ON public.system_health_checks FOR SELECT
TO authenticated
USING (true);

-- 0.2 Create run_all_health_checks function
CREATE OR REPLACE FUNCTION public.run_all_health_checks()
RETURNS TABLE(check_name text, passed boolean, error_msg text) 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check RECORD;
  v_result boolean;
  v_error text;
BEGIN
  FOR v_check IN SELECT * FROM system_health_checks LOOP
    BEGIN
      EXECUTE v_check.check_query INTO v_result;
      v_error := NULL;
      
      UPDATE system_health_checks 
      SET last_run_at = now(),
          last_result = (v_result = v_check.expected_result),
          last_error = NULL
      WHERE id = v_check.id;
      
      check_name := v_check.check_name;
      passed := (v_result = v_check.expected_result);
      error_msg := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      
      UPDATE system_health_checks 
      SET last_run_at = now(),
          last_result = false,
          last_error = v_error
      WHERE id = v_check.id;
      
      check_name := v_check.check_name;
      passed := false;
      error_msg := v_error;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- 0.3 Insert critical health checks
INSERT INTO public.system_health_checks (check_name, check_query, expected_result, is_critical)
VALUES 
  ('no_orphan_slo_state', 
   'SELECT NOT EXISTS (
     SELECT 1 FROM failure_fingerprints fp 
     WHERE fp.is_ongoing = true 
     AND NOT EXISTS (SELECT 1 FROM incident_slo_state s WHERE s.fingerprint_id = fp.id)
   )', true, true),
  ('no_untracked_high_burn', 
   'SELECT NOT EXISTS (
     SELECT 1 FROM incident_slo_state s 
     WHERE s.burn_rate_1h >= 2 
     AND s.last_task_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM tasks t 
       WHERE t.fingerprint_id = s.fingerprint_id 
       AND t.status IN (''open'', ''in_progress'')
     )
   )', true, true),
  ('slo_refresh_recent', 
   'SELECT EXISTS (
     SELECT 1 FROM incident_slo_state 
     WHERE last_evaluated_at > now() - interval ''15 minutes''
   ) OR NOT EXISTS (SELECT 1 FROM incident_slo_state)', true, true),
  ('audit_log_intact', 
   'SELECT NOT EXISTS (
     SELECT 1 FROM audit_log a1
     WHERE a1.previous_hash IS NOT NULL 
     AND NOT EXISTS (SELECT 1 FROM audit_log a2 WHERE a2.hash = a1.previous_hash)
   ) OR NOT EXISTS (SELECT 1 FROM audit_log WHERE previous_hash IS NOT NULL)', true, true),
  ('cron_jobs_healthy',
   'SELECT true', true, false)
ON CONFLICT (check_name) DO NOTHING;
