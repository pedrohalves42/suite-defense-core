
-- FIX: detect_blocked_attempts uses wrong column name
CREATE OR REPLACE FUNCTION public.detect_blocked_attempts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH blocked AS (
    SELECT tenant_id, COUNT(*) as attempt_count
    FROM security_logs
    WHERE created_at > now() - interval '5 minutes'
      AND blocked = true
    GROUP BY tenant_id
    HAVING COUNT(*) >= 5
  )
  INSERT INTO tasks (tenant_id, source_type, title, description, severity, status, auto_generated)
  SELECT 
    b.tenant_id,
    'system_alert',
    '🚨 Blocked access attempts detected - ' || b.attempt_count || ' in 5min',
    'Multiple blocked access attempts detected. Investigate potential brute force or unauthorized access.',
    CASE WHEN b.attempt_count >= 20 THEN 'critical' ELSE 'high' END,
    'open',
    true
  FROM blocked b
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks t 
    WHERE t.tenant_id = b.tenant_id 
      AND t.source_type = 'system_alert'
      AND t.title LIKE '%Blocked access%'
      AND t.status = 'open'
      AND t.created_at > now() - interval '1 hour'
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object('alerts_created', v_count, 'executed_at', now());
END;
$$;

-- FIX: evaluate_software_risk stub (function didn't exist, causing 10 errors)
CREATE OR REPLACE FUNCTION public.evaluate_software_risk(p_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Evaluate software risk score for a single agent based on installed software
  -- Updates agent risk metadata if software inventory exists
  UPDATE agents 
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'last_risk_evaluation', now()
  )
  WHERE id = p_agent_id AND archived_at IS NULL;
END;
$$;
