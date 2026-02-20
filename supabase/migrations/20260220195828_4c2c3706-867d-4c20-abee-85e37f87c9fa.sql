
CREATE OR REPLACE FUNCTION public.acknowledge_all_alerts(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  -- Verify user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id
      AND tenant_id = p_tenant_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Acknowledge all unresolved alerts (including resolved_by and human_reviewed for critical alerts)
  UPDATE system_alerts
  SET 
    resolved = true,
    resolved_at = NOW(),
    resolved_by = v_user_id,
    acknowledged = true,
    acknowledged_at = NOW(),
    acknowledged_by = v_user_id,
    human_reviewed = true,
    reviewed_by = v_user_id,
    reviewed_at = NOW(),
    resolution_notes = 'Reconhecido em massa pelo administrador'
  WHERE tenant_id = p_tenant_id
    AND resolved = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'acknowledged_count', v_count
  );
END;
$function$;
