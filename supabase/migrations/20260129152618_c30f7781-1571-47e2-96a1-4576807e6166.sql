-- =============================================================================
-- P0: Adicionar fallback para JWT vazio nas views agents_safe e agent_snapshots
-- =============================================================================

-- Primeiro, vamos obter a definicao atual de agents_safe e recria-la com fallback
DROP VIEW IF EXISTS agents_safe CASCADE;

CREATE OR REPLACE VIEW agents_safe 
WITH (security_invoker=on) AS
SELECT 
  id,
  tenant_id,
  agent_name,
  hostname,
  status,
  os_type,
  os_version,
  agent_version,
  agent_version_code,
  display_name,
  enrolled_at,
  last_heartbeat,
  last_block_sync_at,
  poll_interval_seconds,
  agent_mode,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  safe_mode_reason,
  safe_mode_entered_at,
  is_throttled,
  throttled_at,
  throttle_reason,
  is_isolated,
  isolated_at,
  isolation_reason,
  archived_at,
  archived_reason,
  force_update_version,
  force_update_reason,
  force_update_at,
  force_update_override_safe_mode,
  force_update_override_safe_mode_expires_at,
  last_forced_update_applied,
  offline_reason,
  offline_detected_at,
  ed25519_supported,
  signature_mode,
  result_public_key,
  result_key_fingerprint,
  result_key_registered_at,
  requires_revalidation,
  revalidation_reason,
  revalidation_required_at
FROM agents
WHERE 
  -- Aceita tenant_id do JWT OU fallback para qualquer tenant que o usuario tem acesso
  (tenant_id = get_active_tenant_id()) 
  OR 
  -- Fallback: verifica se usuario tem acesso via user_roles quando JWT esta vazio
  (get_active_tenant_id() IS NULL AND EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
      AND ur.tenant_id = agents.tenant_id
  ))
  OR
  -- Super admin ve tudo
  is_current_super_admin();

-- Comentario para documentar a decisao
COMMENT ON VIEW agents_safe IS 'ADR-026: View segura de agentes com fallback para JWT sem active_tenant_id. Exclui hmac_secret. Permite acesso via user_roles quando JWT claim esta ausente.';

-- Recriar agent_snapshots com o mesmo fallback
DROP VIEW IF EXISTS agent_snapshots CASCADE;

CREATE OR REPLACE VIEW agent_snapshots 
WITH (security_invoker=on) AS
SELECT 
  a.id AS agent_id,
  a.tenant_id,
  a.hostname,
  a.os_type,
  a.agent_version AS version,
  a.last_heartbeat,
  a.last_heartbeat > (now() - interval '2 minutes') AS online,
  EXTRACT(epoch FROM now() - a.last_heartbeat) * 1000::numeric AS latency_ms,
  a.agent_state,
  COALESCE(a.safe_mode_entered_at IS NOT NULL, false) AS safe_mode,
  a.safe_mode_reason,
  COALESCE(a.is_isolated, false) AS is_isolated,
  COALESCE(a.is_throttled, false) AS is_throttled,
  0::bigint AS active_issues,
  (SELECT count(*) FROM ai_insights ai WHERE ai.agent_id = a.id AND ai.status = 'open') AS unresolved_insights,
  now() AS snapshot_at
FROM agents a
WHERE 
  a.archived_at IS NULL
  AND a.status = 'active'
  AND (
    -- Aceita tenant_id do JWT OU fallback para qualquer tenant que o usuario tem acesso
    (a.tenant_id = get_active_tenant_id()) 
    OR 
    -- Fallback: verifica se usuario tem acesso via user_roles quando JWT esta vazio
    (get_active_tenant_id() IS NULL AND EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.tenant_id = a.tenant_id
    ))
    OR
    -- Super admin ve tudo
    is_current_super_admin()
  );

COMMENT ON VIEW agent_snapshots IS 'ADR-026: View de snapshots de agentes com fallback para JWT sem active_tenant_id. Inclui metricas de latencia e status online.';

-- =============================================================================
-- P1: Atualizar RPC get_agents_snapshots_list para usar tabela direta
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_agents_snapshots_list(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'agent_id', a.id,
    'tenant_id', a.tenant_id,
    'hostname', a.hostname,
    'os_type', a.os_type,
    'version', a.agent_version,
    'last_heartbeat', a.last_heartbeat,
    'online', a.last_heartbeat > (now() - interval '2 minutes'),
    'latency_ms', EXTRACT(epoch FROM now() - a.last_heartbeat) * 1000::numeric,
    'agent_state', a.agent_state,
    'safe_mode', COALESCE(a.safe_mode_entered_at IS NOT NULL, false),
    'safe_mode_reason', a.safe_mode_reason,
    'is_isolated', COALESCE(a.is_isolated, false),
    'is_throttled', COALESCE(a.is_throttled, false),
    'active_issues', 0::bigint,
    'unresolved_insights', (SELECT count(*) FROM ai_insights ai WHERE ai.agent_id = a.id AND ai.status = 'open'),
    'snapshot_at', now()
  )
  FROM agents a
  WHERE a.archived_at IS NULL
    AND a.status = 'active'
    AND (
      -- Parametro explicito tem prioridade
      a.tenant_id = p_tenant_id
      OR 
      -- Fallback para JWT quando parametro e NULL
      (p_tenant_id IS NULL AND a.tenant_id = get_active_tenant_id())
      OR
      -- Fallback para user_roles quando JWT tambem esta vazio
      (p_tenant_id IS NULL AND get_active_tenant_id() IS NULL AND EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.user_id = auth.uid() 
          AND ur.tenant_id = a.tenant_id
      ))
      OR
      -- Super admin ve tudo
      is_current_super_admin()
    );
$function$;

COMMENT ON FUNCTION public.get_agents_snapshots_list IS 'RPC SECURITY DEFINER para lista de snapshots de agentes. Prioriza p_tenant_id explicito, depois JWT, depois user_roles como fallback.';

-- =============================================================================
-- P1: Criar RPC get_agents_list para substituir queries diretas a view
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_agents_list(
  p_tenant_id uuid,
  p_include_archived boolean DEFAULT false
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
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
    'archived_at', archived_at
  )
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND (p_include_archived OR archived_at IS NULL)
    AND status = 'active';
$function$;

COMMENT ON FUNCTION public.get_agents_list IS 'RPC SECURITY DEFINER para lista de agentes com parametro tenant_id explicito. Nao depende de JWT claims.';