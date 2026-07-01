-- =============================================================================
-- HF-RLS-06B-EXTRA-A
-- Fecha NEW-P0-A: get_agents_snapshots_list retornava todos os tenants quando
-- v_effective_tenant_id era NULL (anon sem JWT + sem parametro). A guarda
-- _assert_caller_tenant era pulada e o WHERE degenerava para TRUE.
--
-- Correção: qualquer chamador sem tenant efetivo que NÃO seja super_admin é
-- rejeitado com insufficient_privilege. A guarda _assert_caller_tenant continua
-- exigida para caminhos com tenant explícito e chamadores autenticados.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_agents_snapshots_list(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(agent_id uuid, tenant_id uuid, hostname text, agent_name text, os_type text, version text, last_heartbeat timestamp with time zone, online boolean, latency_ms numeric, agent_state text, safe_mode boolean, safe_mode_reason text, is_isolated boolean, is_throttled boolean, active_issues bigint, unresolved_insights bigint, snapshot_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_effective_tenant_id uuid;
  v_is_super_admin boolean;
BEGIN
  v_effective_tenant_id := COALESCE(p_tenant_id, public.get_active_tenant_id());
  v_is_super_admin := public.is_current_super_admin();

  -- HF-RLS-06B-EXTRA-A: fail-closed quando não há tenant efetivo e o chamador
  -- não é super_admin. Antes, esse caminho retornava dados de todos os tenants.
  IF v_effective_tenant_id IS NULL AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: caller has no active tenant and is not super_admin'
      USING ERRCODE = '42501';
  END IF;

  -- Chamadores com tenant explícito continuam validados pela guarda compartilhada
  -- (que já foi corrigida em HF-RLS-06B para bloquear anon/blank role).
  IF v_effective_tenant_id IS NOT NULL AND NOT v_is_super_admin THEN
    PERFORM public._assert_caller_tenant(v_effective_tenant_id);
  END IF;

  RETURN QUERY
  SELECT 
    a.id as agent_id,
    a.tenant_id,
    a.hostname,
    a.agent_name,
    a.os_type,
    a.agent_version as version,
    a.last_heartbeat,
    (a.last_heartbeat > (now() - interval '15 minutes')) as online,
    EXTRACT(epoch FROM now() - a.last_heartbeat) * 1000::numeric as latency_ms,
    a.agent_state,
    COALESCE(a.safe_mode_entered_at IS NOT NULL, false) as safe_mode,
    a.safe_mode_reason,
    COALESCE(a.is_isolated, false) as is_isolated,
    COALESCE(a.is_throttled, false) as is_throttled,
    0::bigint as active_issues,
    (SELECT count(*) FROM ai_insights ai WHERE ai.agent_id = a.id AND ai.acknowledged = false) as unresolved_insights,
    now() as snapshot_at
  FROM agents a
  WHERE
    -- v_effective_tenant_id só é NULL aqui se v_is_super_admin=true (visão global explícita)
    (v_effective_tenant_id IS NULL OR a.tenant_id = v_effective_tenant_id)
    AND a.archived_at IS NULL
    AND a.status != 'archived';
END;
$function$;

-- Reafirma grants existentes (não amplia superfície; REVOKE de anon fica para HF-RLS-06C)
GRANT EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_agents_snapshots_list(uuid) IS
  'HF-RLS-06B-EXTRA-A: rejeita chamadores sem tenant efetivo que não sejam super_admin. Fecha vetor de enumeração cross-tenant quando p_tenant_id é omitido.';