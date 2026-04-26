-- =====================================================
-- PHASE 1: CLEANUP CRITICAL ALERTS AND PREVENT DUPLICATES
-- =====================================================

-- Step 1: Delete duplicate alerts, keeping only most recent per type/agent
WITH ranked_alerts AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, agent_id, alert_type 
      ORDER BY created_at DESC
    ) as rn
  FROM system_alerts
  WHERE alert_type IN ('high_disk', 'high_cpu', 'high_memory')
    AND resolved = false
)
DELETE FROM system_alerts
WHERE id IN (
  SELECT id FROM ranked_alerts WHERE rn > 1
);

-- Step 2: Delete resolved alerts older than 7 days
DELETE FROM system_alerts
WHERE resolved = true
  AND created_at < NOW() - INTERVAL '7 days';

-- Step 3: Delete unresolved alerts older than 30 days
DELETE FROM system_alerts
WHERE resolved = false
  AND created_at < NOW() - INTERVAL '30 days';

-- Step 4: Create function to acknowledge all alerts for a tenant
CREATE OR REPLACE FUNCTION acknowledge_all_alerts(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Verify user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Acknowledge all unresolved alerts
  UPDATE system_alerts
  SET 
    resolved = true,
    resolved_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND resolved = false
  RETURNING * INTO v_count;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'acknowledged_count', v_count
  );
END;
$$;

-- Step 5: Add index for better alert query performance
CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_type_resolved 
  ON system_alerts(tenant_id, alert_type, resolved, created_at DESC);

-- Verification query
SELECT 
  alert_type,
  severity,
  resolved,
  COUNT(*) as count,
  MAX(created_at) as most_recent
FROM system_alerts
GROUP BY alert_type, severity, resolved
ORDER BY count DESC;