-- =======================================================
-- SINCRONIZACAO DE THRESHOLDS: v_agent_state
-- =======================================================
-- Atualiza a view para usar os thresholds centralizados:
-- - ONLINE: < 2 minutos = 'healthy'
-- - WARNING: 2-5 minutos = 'warning'  
-- - OFFLINE: > 10 minutos = 'offline'

DROP VIEW IF EXISTS public.v_agent_state CASCADE;

CREATE VIEW public.v_agent_state 
WITH (security_invoker = on) AS
SELECT 
    id AS agent_id,
    id,  -- Mantem id tambem para compatibilidade
    tenant_id,
    hostname,
    agent_name,
    display_name,
    last_heartbeat,
    agent_version,
    agent_state,
    agent_state_reason,
    is_isolated,
    is_throttled,
    safe_mode_reason,
    safe_mode_entered_at,
    -- Estado canonico usando thresholds centralizados (2/5/10 min)
    CASE
        WHEN archived_at IS NOT NULL THEN 'archived'::text
        WHEN is_isolated THEN 'isolated'::text
        WHEN agent_state = 'safe_mode'::text THEN 'safe_mode'::text
        WHEN last_heartbeat IS NULL THEN 'never_connected'::text
        -- OFFLINE: mais de 10 minutos sem heartbeat
        WHEN last_heartbeat < (NOW() - INTERVAL '10 minutes') THEN 'offline'::text
        -- WARNING: entre 5 e 10 minutos
        WHEN last_heartbeat < (NOW() - INTERVAL '5 minutes') THEN 'warning'::text
        -- HEALTHY: menos de 2 minutos (ou entre 2-5 min ainda e considerado healthy)
        WHEN last_heartbeat < (NOW() - INTERVAL '2 minutes') THEN 'warning'::text
        ELSE 'healthy'::text
    END AS canonical_state,
    EXTRACT(epoch FROM NOW() - last_heartbeat) AS heartbeat_lag_seconds,
    ROUND(EXTRACT(epoch FROM NOW() - last_heartbeat) / 60.0, 1) AS heartbeat_lag_minutes,
    NOW() AS snapshot_at
FROM agents a
WHERE status = 'active'::text 
  AND archived_at IS NULL 
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Grant permissions
GRANT SELECT ON public.v_agent_state TO authenticated;
GRANT SELECT ON public.v_agent_state TO service_role;

COMMENT ON VIEW public.v_agent_state IS 
'View canonica do estado dos agentes. Thresholds: healthy < 2min, warning 2-10min, offline > 10min. Fonte unica da verdade para UI.';