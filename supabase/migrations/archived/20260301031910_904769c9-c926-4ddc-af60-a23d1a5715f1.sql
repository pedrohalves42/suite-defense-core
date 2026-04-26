
-- =============================================================================
-- DR. VELLUM AUDIT: CRITICAL/HIGH SECURITY DEFINER HARDENING
-- =============================================================================
-- V-401: get_enrollment_key_full - CRITICAL: Returns plaintext key without auth
-- V-402: get_alert_decision_chain - HIGH: Cross-tenant data leak
-- V-403: get_balanced_pending_actions - HIGH: Cross-tenant data leak  
-- V-404: create_retroactive_execution - HIGH: Cross-tenant write
-- V-405: cleanup_rls_test_results - MEDIUM: No auth check on delete
-- =============================================================================

-- V-401 FIX: get_enrollment_key_full MUST require service_role
CREATE OR REPLACE FUNCTION public.get_enrollment_key_full(p_key_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key TEXT;
BEGIN
  -- SSA-SEC: MUST be service_role only - this exposes plaintext keys
  PERFORM _assert_service_role_or_super_admin();
  
  SELECT key INTO v_key
  FROM public.enrollment_keys
  WHERE id = p_key_id
    AND is_active = true
    AND expires_at > NOW();
  
  RETURN v_key;
END;
$function$;

-- Revoke from anon/public - only service_role should call this
REVOKE EXECUTE ON FUNCTION public.get_enrollment_key_full(uuid) FROM anon, public;

-- V-402 FIX: get_alert_decision_chain - add tenant validation
CREATE OR REPLACE FUNCTION public.get_alert_decision_chain(p_alert_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_caller_tenant uuid;
  v_alert_tenant uuid;
BEGIN
  -- SSA-SEC: Tenant isolation guard
  v_caller_tenant := get_active_tenant_id();
  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: No active tenant';
  END IF;
  
  -- Verify alert belongs to caller's tenant
  SELECT sa.tenant_id INTO v_alert_tenant
  FROM system_alerts sa WHERE sa.id = p_alert_id;
  
  IF v_alert_tenant IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF v_alert_tenant != v_caller_tenant THEN
    -- Log cross-tenant attempt
    INSERT INTO security_logs (event_type, severity, details, tenant_id)
    VALUES ('cross_tenant_attempt', 'high', 
      jsonb_build_object('function', 'get_alert_decision_chain', 'target_alert', p_alert_id, 'caller_tenant', v_caller_tenant, 'target_tenant', v_alert_tenant),
      v_caller_tenant);
    RAISE EXCEPTION 'TENANT_MISMATCH: Alert does not belong to caller tenant';
  END IF;

  SELECT jsonb_build_object(
    'alert_id', p_alert_id,
    'current_state', CASE WHEN sa.resolved THEN 'resolved' ELSE 'open' END,
    'reason_tree', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'at', e.created_at,
          'event_type', e.event_type,
          'source', e.source,
          'reason', e.reason,
          'evidence', e.evidence
        ) ORDER BY e.created_at
      )
      FROM (
        SELECT sa2.created_at, 'alert_created' AS event_type, 'system' AS source,
          sa2.title AS reason,
          jsonb_build_object('severity', sa2.severity, 'alert_type', sa2.alert_type, 'message', sa2.message) AS evidence
        FROM system_alerts sa2 WHERE sa2.id = p_alert_id
        UNION ALL
        SELECT de.created_at, de.decision_type AS event_type, de.decision_source AS source,
          de.action AS reason, de.evidence
        FROM decision_events de WHERE de.evidence->>'alert_id' = p_alert_id::text
      ) e
    )
  )
  INTO result
  FROM system_alerts sa
  WHERE sa.id = p_alert_id;

  RETURN result;
END;
$function$;

-- V-403 FIX: get_balanced_pending_actions - restrict to service_role (used by cron/edge functions)
CREATE OR REPLACE FUNCTION public.get_balanced_pending_actions(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, tenant_id uuid, action_type text, action_payload jsonb, insight_id uuid, ai_insights jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- SSA-SEC: This returns cross-tenant data by design (for system processing)
  -- Must be restricted to service_role only
  PERFORM _assert_service_role_or_super_admin();

  RETURN QUERY
  WITH ranked_actions AS (
    SELECT 
      a.id, a.tenant_id, a.action_type, a.action_payload, a.insight_id, a.created_at,
      ROW_NUMBER() OVER (PARTITION BY a.tenant_id ORDER BY a.created_at ASC) as tenant_rank
    FROM ai_actions a
    WHERE a.status = 'pending'
  ),
  balanced_actions AS (
    SELECT ra.id, ra.tenant_id, ra.action_type, ra.action_payload, ra.insight_id, ra.created_at
    FROM ranked_actions ra
    ORDER BY ra.tenant_rank ASC, ra.created_at ASC
    LIMIT p_limit
  )
  SELECT 
    ba.id, ba.tenant_id, ba.action_type, ba.action_payload, ba.insight_id,
    (SELECT jsonb_build_object('id', i.id, 'confidence_score', i.confidence_score, 'insight_type', i.insight_type, 'status', i.status)
     FROM ai_insights i WHERE i.id = ba.insight_id
    ) as ai_insights
  FROM balanced_actions ba;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_balanced_pending_actions(integer) FROM anon, public;

-- V-404 FIX: create_retroactive_execution - add service_role guard
CREATE OR REPLACE FUNCTION public.create_retroactive_execution(p_job_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_execution_id UUID;
  v_job RECORD;
BEGIN
  -- SSA-SEC: Only service_role can create retroactive executions
  PERFORM _assert_service_role_or_super_admin();
  
  IF EXISTS (SELECT 1 FROM job_executions WHERE job_id = p_job_id) THEN
    RAISE NOTICE 'Job % already has execution - skipping', p_job_id;
    RETURN NULL;
  END IF;
  
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND status IN ('done', 'completed', 'failed');
  
  IF NOT FOUND THEN
    RAISE NOTICE 'Job % not found or not completed', p_job_id;
    RETURN NULL;
  END IF;
  
  INSERT INTO job_executions (
    job_id, agent_id, tenant_id, agent_name, agent_version, payload_hash,
    status, legacy, claimed_at, started_at, finished_at, error_message
  ) VALUES (
    v_job.id, v_job.agent_id, v_job.tenant_id,
    COALESCE(v_job.agent_name, 'legacy-agent'), 'pre-execution-model',
    COALESCE(v_job.payload_hash, 'legacy-no-hash'),
    CASE v_job.status WHEN 'done' THEN 'completed' ELSE v_job.status END,
    true, v_job.created_at,
    COALESCE(v_job.started_at, v_job.delivered_at, v_job.created_at),
    COALESCE(v_job.finished_at, v_job.completed_at)
  )
  RETURNING id INTO v_execution_id;
  
  RETURN v_execution_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_retroactive_execution(uuid) FROM anon, public;

-- V-405 FIX: cleanup_rls_test_results - add service_role guard
CREATE OR REPLACE FUNCTION public.cleanup_rls_test_results()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM public.rls_test_results
  WHERE tested_at < now() - interval '30 days';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cleanup_rls_test_results() FROM anon, public;
