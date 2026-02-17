
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
    AND resolved = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'acknowledged_count', v_count
  );
END;
$$;
