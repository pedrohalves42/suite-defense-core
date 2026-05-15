CREATE OR REPLACE FUNCTION public.get_agents_list(
  p_tenant_id uuid, 
  p_include_archived boolean DEFAULT false,
  p_agent_id uuid DEFAULT NULL
)
 RETURNS TABLE(
   id uuid, 
   tenant_id uuid, 
   agent_name text, 
   hostname text, 
   status text, 
   os_type text, 
   os_version text, 
   agent_version text, 
   agent_version_code integer, 
   display_name text, 
   enrolled_at timestamp with time zone, 
   last_heartbeat timestamp with time zone, 
   last_block_sync_at timestamp with time zone, 
   agent_state text, 
   is_throttled boolean, 
   is_isolated boolean, 
   skip_firewall_remediation boolean, 
   archived_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Use the robust assertion logic
  PERFORM public._assert_caller_tenant(p_tenant_id);

  RETURN QUERY
  SELECT 
    a.id, a.tenant_id, a.agent_name,
    a.hostname, a.status, a.os_type,
    a.os_version, a.agent_version,
    a.agent_version_code, a.display_name,
    a.enrolled_at, a.last_heartbeat,
    a.last_block_sync_at, a.agent_state,
    a.is_throttled, a.is_isolated,
    COALESCE(a.skip_firewall_remediation, false),
    a.archived_at
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND (p_agent_id IS NULL OR a.id = p_agent_id)
    AND (p_include_archived OR a.archived_at IS NULL);
END;
$function$;