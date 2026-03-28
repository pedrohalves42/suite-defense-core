
-- =============================================================================
-- VELLUM AUDIT: Fix CRITICAL + HIGH RPCs (V-14001 to V-14009)
-- =============================================================================

-- V-14001 (CRITICAL): auto_activate_emergency_mode uses (SELECT id FROM tenants LIMIT 1)
-- which picks a RANDOM tenant for audit_logs. Must use NEW.tenant_id from the alert.
CREATE OR REPLACE FUNCTION public.auto_activate_emergency_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.alert_type IN ('rls_violation', 'rls_disabled') 
     AND NEW.severity = 'critical' THEN
    
    IF NOT EXISTS (
      SELECT 1 FROM system_global_state 
      WHERE mode = 'emergency_stop' 
      AND triggered_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO system_global_state (mode, reason, triggered_by)
      VALUES (
        'emergency_stop',
        format('Auto-triggered: %s', NEW.message),
        '00000000-0000-0000-0000-000000000000'::uuid
      );
      
      -- V-14001 FIX: Use NEW.tenant_id instead of random (SELECT id FROM tenants LIMIT 1)
      INSERT INTO audit_logs (event_type, details, user_id, tenant_id)
      VALUES (
        'emergency_mode_auto_activated',
        jsonb_build_object(
          'alert_id', NEW.id,
          'alert_type', NEW.alert_type,
          'reason', NEW.message,
          'triggered_at', now()
        ),
        '00000000-0000-0000-0000-000000000000'::uuid,
        NEW.tenant_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- V-14002 (CRITICAL): _guard_hard_delete_agent checks role across ALL tenants
-- Must validate user has admin role in the SAME tenant as the agent being deleted
CREATE OR REPLACE FUNCTION public._guard_hard_delete_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_tenant_id uuid;
BEGIN
  -- Get the agent's tenant
  SELECT tenant_id INTO v_agent_tenant_id FROM agents WHERE id = OLD.id;
  
  -- V-14002 FIX: Check role is scoped to the agent's tenant, not any tenant
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin')
    AND (tenant_id = v_agent_tenant_id OR role = 'super_admin')
  ) THEN
    INSERT INTO security_logs (event_type, severity, message, user_id, tenant_id)
    VALUES ('UNAUTHORIZED_DELETE_ATTEMPT', 'critical', 
      'Unauthorized hard_delete_agent attempt', auth.uid()::text, 
      COALESCE(v_agent_tenant_id::text, 'unknown'));
    RAISE EXCEPTION 'Unauthorized: admin role in agent tenant required for hard_delete_agent';
  END IF;
  RETURN OLD;
END;
$function$;

-- V-14003 (CRITICAL): archive_agent(uuid) DELETEs from tables without tenant_id filter
-- A compromised agent_id could cause cross-tenant data deletion
CREATE OR REPLACE FUNCTION public.archive_agent(p_agent_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent RECORD;
BEGIN
  SELECT id, agent_name, tenant_id, status INTO v_agent
  FROM agents 
  WHERE id = p_agent_id
    AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());
  
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND_OR_UNAUTHORIZED');
  END IF;
  
  -- Deactivate all tokens
  UPDATE agent_tokens SET is_active = false WHERE agent_id = p_agent_id;
  
  -- Archive agent
  UPDATE agents SET
    status = 'inactive',
    archived_at = NOW(),
    archived_reason = 'manual_archive',
    agent_state = 'archived',
    agent_state_changed_at = NOW(),
    agent_state_reason = 'Arquivado manualmente pelo administrador'
  WHERE id = p_agent_id;
  
  -- V-14003 FIX: Add tenant_id filter on ALL DELETE operations
  DELETE FROM agent_disk_metrics WHERE agent_id = p_agent_id AND tenant_id = v_agent.tenant_id;
  DELETE FROM agent_network_info WHERE agent_id = p_agent_id AND tenant_id = v_agent.tenant_id;
  DELETE FROM agent_system_metrics WHERE agent_id = p_agent_id AND tenant_id = v_agent.tenant_id;
  DELETE FROM agent_web_activity WHERE agent_id = p_agent_id AND tenant_id = v_agent.tenant_id;
  DELETE FROM system_alerts WHERE agent_id = p_agent_id AND tenant_id = v_agent.tenant_id;
  DELETE FROM ai_insights WHERE agent_id = p_agent_id AND tenant_id = v_agent.tenant_id;
  
  RETURN json_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent.agent_name,
    'action', 'archived'
  );
END;
$function$;

-- V-14004 (HIGH): alert_long_offline_agents - No auth guard, scans ALL tenants
CREATE OR REPLACE FUNCTION public.alert_long_offline_agents()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent RECORD;
  v_count int := 0;
  v_existing int;
BEGIN
  -- V-14004 FIX: Require service_role or super_admin
  PERFORM _assert_service_role_or_super_admin();

  FOR v_agent IN
    SELECT id, agent_name, tenant_id, last_heartbeat,
      EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) / 3600 AS hours_offline
    FROM agents
    WHERE status = 'inactive'
      AND last_heartbeat IS NOT NULL
      AND last_heartbeat < NOW() - interval '48 hours'
  LOOP
    SELECT COUNT(*) INTO v_existing FROM system_alerts
    WHERE agent_id = v_agent.id AND alert_type = 'agent_long_offline' AND resolved = false;

    IF v_existing = 0 THEN
      INSERT INTO system_alerts (
        tenant_id, agent_id, alert_type, severity, title, message, details, source
      ) VALUES (
        v_agent.tenant_id, v_agent.id, 'agent_long_offline', 'high',
        'Agente offline ha mais de 48h: ' || v_agent.agent_name,
        'O agente ' || v_agent.agent_name || ' esta sem comunicacao ha ' || ROUND(v_agent.hours_offline::numeric) || ' horas.',
        jsonb_build_object('agent_name', v_agent.agent_name, 'hours_offline', ROUND(v_agent.hours_offline::numeric), 'last_heartbeat', v_agent.last_heartbeat),
        'system'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_count);
END;
$function$;

-- V-14005 (HIGH): auto_cleanup_stale_operations - No auth guard
CREATE OR REPLACE FUNCTION public.auto_cleanup_stale_operations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  dlq_cleaned int := 0;
  jobs_cancelled int := 0;
BEGIN
  -- V-14005 FIX: Require service_role or super_admin
  PERFORM _assert_service_role_or_super_admin();

  WITH resolved AS (
    UPDATE failed_jobs_dlq 
    SET status = 'resolved',
        resolved_at = now(),
        resolution_notes = 'Auto-cleanup: item pendente por mais de 6h',
        resolution_source = 'auto_cleanup'
    WHERE status = 'pending' 
      AND created_at < now() - interval '6 hours'
    RETURNING id
  )
  SELECT count(*) INTO dlq_cleaned FROM resolved;

  WITH cancelled AS (
    UPDATE jobs 
    SET status = 'cancelled', completed_at = now()
    WHERE status = 'delivered' 
      AND completed_at IS NULL
      AND created_at < now() - interval '1 hour'
      AND agent_id IN (
        SELECT id FROM agents WHERE status IN ('offline', 'inactive')
      )
    RETURNING id
  )
  SELECT count(*) INTO jobs_cancelled FROM cancelled;

  RETURN jsonb_build_object(
    'dlq_cleaned', dlq_cleaned,
    'jobs_cancelled', jobs_cancelled,
    'executed_at', now()
  );
END;
$function$;

-- V-14006 (HIGH): auto_cancel_archived_agent_jobs - No auth guard
CREATE OR REPLACE FUNCTION public.auto_cancel_archived_agent_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cancelled_count integer := 0;
BEGIN
  -- V-14006 FIX: Require service_role or super_admin
  PERFORM _assert_service_role_or_super_admin();

  WITH cancelled AS (
    UPDATE jobs j
    SET 
      status = 'cancelled',
      finished_at = now(),
      error_message = 'Auto-cancelled: agent archived'
    FROM agents a
    WHERE j.agent_id = a.id
      AND a.archived_at IS NOT NULL
      AND j.status IN ('pending', 'queued', 'delivered')
    RETURNING j.id, j.tenant_id, j.agent_id, j.agent_name, j.type, j.payload
  )
  SELECT count(*) INTO v_cancelled_count FROM cancelled;

  INSERT INTO failed_jobs_dlq (original_job_id, tenant_id, agent_id, agent_name, job_type, payload, error_message, status, first_failure_at, last_failure_at, failure_class, created_at)
  SELECT j.id, j.tenant_id, j.agent_id, j.agent_name, j.type, j.payload, 
    'Auto-cancelled: agent archived', 'ignored', now(), now(), 'agent_archived', now()
  FROM jobs j
  JOIN agents a ON j.agent_id = a.id
  WHERE a.archived_at IS NOT NULL
    AND j.status = 'cancelled'
    AND j.error_message = 'Auto-cancelled: agent archived'
    AND NOT EXISTS (SELECT 1 FROM failed_jobs_dlq dlq WHERE dlq.original_job_id = j.id)
  ON CONFLICT DO NOTHING;

  RETURN v_cancelled_count;
END;
$function$;

-- V-14007 (HIGH): capture_forensic_snapshot_full - No tenant validation for caller
CREATE OR REPLACE FUNCTION public.capture_forensic_snapshot_full(p_agent_id uuid, p_trigger_reason text, p_trigger_event_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_snapshot_id UUID;
  v_config JSONB;
  v_process JSONB;
  v_network JSONB;
  v_liveness JSONB;
  v_caller_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Agent not found'; END IF;
  
  -- V-14007 FIX: Validate caller has access to agent's tenant
  v_caller_tenant := get_active_tenant_id();
  IF v_caller_tenant IS NOT NULL AND v_caller_tenant != v_tenant_id AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'capture_forensic_snapshot_full', 'target_agent', p_agent_id, 'agent_tenant', v_tenant_id));
    RAISE EXCEPTION 'TENANT_MISMATCH: Caller cannot access agent in another tenant';
  END IF;
  
  SELECT jsonb_build_object('agent', to_jsonb(a.*)) INTO v_config
  FROM agents a WHERE a.id = p_agent_id;
  
  SELECT jsonb_build_object(
    'recent_jobs', (SELECT jsonb_agg(j.*) FROM (
      SELECT * FROM jobs WHERE agent_id = p_agent_id ORDER BY created_at DESC LIMIT 20
    ) j)
  ) INTO v_process;
  
  -- V-14007 FIX: Add tenant filter to network info query
  SELECT jsonb_agg(n.*) INTO v_network
  FROM agent_network_info n WHERE n.agent_id = p_agent_id AND n.tenant_id = v_tenant_id LIMIT 5;
  
  SELECT jsonb_agg(l.*) INTO v_liveness FROM system_liveness l;
  
  INSERT INTO forensic_snapshots (
    agent_id, tenant_id, trigger_reason, trigger_event_id,
    config_snapshot, process_snapshot, network_snapshot,
    system_liveness_snapshot, metadata
  ) VALUES (
    p_agent_id, v_tenant_id, p_trigger_reason, 
    COALESCE(p_trigger_event_id, gen_random_uuid()),
    COALESCE(v_config, '{}'), COALESCE(v_process, '{}'),
    COALESCE(v_network, '[]'), COALESCE(v_liveness, '[]'), p_metadata
  )
  ON CONFLICT (trigger_event_id, trigger_reason) DO NOTHING
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$function$;

-- V-14008 (HIGH): check_expired_risks - No auth guard, scans all tenants
CREATE OR REPLACE FUNCTION public.check_expired_risks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_task RECORD;
BEGIN
  -- V-14008 FIX: Require service_role or super_admin
  PERFORM _assert_service_role_or_super_admin();

  FOR expired_task IN
    SELECT * FROM public.tasks
    WHERE status = 'accepted_risk'
      AND risk_expiry_at IS NOT NULL
      AND risk_expiry_at <= now()
  LOOP
    INSERT INTO public.tasks (
      tenant_id, source_type, source_id, title, description, severity, 
      status, requires_human_review, auto_generated
    ) VALUES (
      expired_task.tenant_id,
      'manual',
      expired_task.id::text,
      'Reavaliacao de Risco: ' || expired_task.title,
      'O risco aceito para "' || expired_task.title || '" expirou e precisa ser reavaliado.',
      expired_task.severity,
      'open',
      true,
      true
    );
    
    INSERT INTO public.task_events (task_id, tenant_id, actor_type, action, metadata)
    VALUES (
      expired_task.id, 
      expired_task.tenant_id, 
      'system', 
      'risk_expired', 
      jsonb_build_object('expiry_at', expired_task.risk_expiry_at)
    );
    
    UPDATE public.tasks 
    SET status = 'open', updated_at = now()
    WHERE id = expired_task.id;
  END LOOP;
END;
$function$;

-- V-14009 (HIGH): auto_close_stale_orphan_tasks - No auth guard
CREATE OR REPLACE FUNCTION public.auto_close_stale_orphan_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer;
BEGIN
  -- V-14009 FIX: Require service_role or super_admin
  PERFORM _assert_service_role_or_super_admin();

  UPDATE tasks 
  SET status = 'resolved', updated_at = now()
  WHERE assigned_to IS NULL 
    AND status NOT IN ('completed', 'cancelled', 'resolved')
    AND created_at < now() - interval '24 hours';
  
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  
  IF closed_count > 0 THEN
    RAISE NOTICE 'Auto-resolved % orphan tasks older than 24h', closed_count;
  END IF;
END;
$function$;
