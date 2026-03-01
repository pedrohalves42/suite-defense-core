CREATE OR REPLACE FUNCTION public.get_agents_list(p_tenant_id uuid, p_include_archived boolean DEFAULT false)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', id,
    'tenant_id', tenant_id,
    'agent_name', agent_name,
    'hostname', hostname,
    'status', status,
    'os_type', os_type,
    'os_version', os_version,
    'agent_version', agent_version,
    'agent_version_code', agent_version_code,
    'display_name', display_name,
    'enrolled_at', enrolled_at,
    'last_heartbeat', last_heartbeat,
    'last_block_sync_at', last_block_sync_at,
    'agent_state', agent_state,
    'is_throttled', is_throttled,
    'is_isolated', is_isolated,
    'skip_firewall_remediation', COALESCE(skip_firewall_remediation, false),
    'archived_at', archived_at
  )
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND (p_include_archived OR archived_at IS NULL);
$function$;