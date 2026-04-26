
-- =============================================================================
-- Smart Notifications RPC for Simple Mode
-- Returns notifications in simple business language
-- =============================================================================

CREATE OR REPLACE FUNCTION get_smart_notifications(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  result jsonb := '[]'::jsonb;
  v_offline_count integer;
  v_critical_alerts integer;
  v_pending_jobs integer;
  v_last_scan timestamptz;
BEGIN
  -- Get tenant context
  v_tenant_id := COALESCE(p_tenant_id, get_active_tenant_id());
  
  IF v_tenant_id IS NULL THEN
    RETURN result;
  END IF;

  -- Check offline agents
  SELECT COUNT(*) INTO v_offline_count
  FROM agents 
  WHERE tenant_id = v_tenant_id 
    AND archived_at IS NULL
    AND (last_heartbeat IS NULL OR last_heartbeat < NOW() - INTERVAL '10 minutes');

  IF v_offline_count > 0 THEN
    result := result || jsonb_build_object(
      'type', 'agents_offline',
      'title', format('%s computador%s desconectado%s', 
        v_offline_count, 
        CASE WHEN v_offline_count > 1 THEN 'es' ELSE '' END,
        CASE WHEN v_offline_count > 1 THEN 's' ELSE '' END
      ),
      'message', 'Verifique se estao ligados e conectados a internet',
      'urgency', CASE WHEN v_offline_count > 5 THEN 'high' ELSE 'medium' END,
      'action', 'Ver computadores',
      'actionHref', '/admin/agent-health'
    );
  END IF;

  -- Check critical alerts
  SELECT COUNT(*) INTO v_critical_alerts
  FROM system_alerts 
  WHERE tenant_id = v_tenant_id 
    AND severity IN ('critical', 'high')
    AND resolved = false;

  IF v_critical_alerts > 0 THEN
    result := result || jsonb_build_object(
      'type', 'critical_alerts',
      'title', format('%s alerta%s de seguranca', 
        v_critical_alerts,
        CASE WHEN v_critical_alerts > 1 THEN 's' ELSE '' END
      ),
      'message', 'Ameacas detectadas que precisam de atencao',
      'urgency', 'high',
      'action', 'Ver alertas',
      'actionHref', '/admin/security-monitoring'
    );
  END IF;

  -- Check pending jobs
  SELECT COUNT(*) INTO v_pending_jobs
  FROM jobs 
  WHERE tenant_id = v_tenant_id 
    AND status IN ('queued', 'pending')
    AND created_at < NOW() - INTERVAL '1 hour';

  IF v_pending_jobs > 3 THEN
    result := result || jsonb_build_object(
      'type', 'pending_jobs',
      'title', 'Tarefas pendentes',
      'message', format('%s tarefas aguardando execucao ha mais de 1 hora', v_pending_jobs),
      'urgency', 'medium',
      'action', 'Ver tarefas',
      'actionHref', '/admin/job-orchestration'
    );
  END IF;

  -- All good notification
  IF jsonb_array_length(result) = 0 THEN
    result := result || jsonb_build_object(
      'type', 'all_good',
      'title', 'Tudo em ordem!',
      'message', 'Seus computadores estao protegidos e funcionando normalmente',
      'urgency', 'low'
    );
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION get_smart_notifications IS 
'Returns notifications in simple business language for the Simple Mode dashboard.
Designed for non-technical users (business owners).';
