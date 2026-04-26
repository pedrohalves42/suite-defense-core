
-- =============================================================================
-- FASE 1: Correcoes Criticas ? V-301, V-302, V-303, V-308
-- =============================================================================

-- V-301: RLS nas particoes expostas
ALTER TABLE public.agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_system_metrics_2026_04 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for metrics 2026_03"
ON public.agent_system_metrics_2026_03
FOR SELECT USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role full access to metrics 2026_03"
ON public.agent_system_metrics_2026_03
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation for metrics 2026_04"
ON public.agent_system_metrics_2026_04
FOR SELECT USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role full access to metrics 2026_04"
ON public.agent_system_metrics_2026_04
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- V-302: Blindar get_agents_list
CREATE OR REPLACE FUNCTION public.get_agents_list(p_tenant_id uuid, p_include_archived boolean DEFAULT false)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_current_super_admin() 
     AND (get_active_tenant_id() IS NULL OR p_tenant_id IS DISTINCT FROM get_active_tenant_id()) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: Caller does not belong to requested tenant (INV-001)';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', id, 'tenant_id', tenant_id, 'agent_name', agent_name,
    'hostname', hostname, 'status', status, 'os_type', os_type,
    'os_version', os_version, 'agent_version', agent_version,
    'agent_version_code', agent_version_code, 'display_name', display_name,
    'enrolled_at', enrolled_at, 'last_heartbeat', last_heartbeat,
    'last_block_sync_at', last_block_sync_at, 'agent_state', agent_state,
    'is_throttled', is_throttled, 'is_isolated', is_isolated,
    'skip_firewall_remediation', COALESCE(skip_firewall_remediation, false),
    'archived_at', archived_at
  )
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND (p_include_archived OR archived_at IS NULL);
END;
$function$;

-- V-303: Revogar EXECUTE de anon (assinaturas corretas ? todas sem args)
REVOKE EXECUTE ON FUNCTION public.alert_long_offline_agents() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_cleanup_stale_operations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rls_test_results() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_default_software_policy() FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, text, boolean, text, text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_truncate() FROM anon;
REVOKE EXECUTE ON FUNCTION public.provision_tenant_baseline_features() FROM anon;
REVOKE EXECUTE ON FUNCTION public.soar_evaluate_alert() FROM anon;

-- V-308: Limpar force_update em agente ja atualizado
UPDATE agents
SET force_update_version = NULL, force_update_reason = NULL, force_update_at = NULL,
    force_update_override_safe_mode = false, force_update_override_safe_mode_expires_at = NULL
WHERE force_update_version IS NOT NULL AND agent_version = force_update_version AND archived_at IS NULL;

-- Trigger preventivo para futuros ciclos
CREATE OR REPLACE FUNCTION public.auto_clear_force_update_on_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.agent_version IS NOT NULL AND NEW.force_update_version IS NOT NULL
     AND NEW.agent_version = NEW.force_update_version THEN
    NEW.force_update_version := NULL;
    NEW.force_update_reason := NULL;
    NEW.force_update_at := NULL;
    NEW.force_update_override_safe_mode := false;
    NEW.force_update_override_safe_mode_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_clear_force_update ON agents;
CREATE TRIGGER trg_auto_clear_force_update
BEFORE UPDATE OF agent_version ON agents
FOR EACH ROW EXECUTE FUNCTION auto_clear_force_update_on_match();
