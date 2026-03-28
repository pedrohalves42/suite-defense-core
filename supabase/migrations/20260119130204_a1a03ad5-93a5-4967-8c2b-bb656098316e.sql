-- =============================================================================
-- CORRECAO: v_agent_lifecycle_state - Adicionar alias agent_id para compatibilidade
-- =============================================================================
-- Recriando com colunas que realmente existem na tabela agents
-- =============================================================================

DROP VIEW IF EXISTS public.v_agent_lifecycle_state;

CREATE VIEW public.v_agent_lifecycle_state WITH (security_invoker = on) AS
SELECT 
  a.id,
  a.id AS agent_id,  -- Alias para compatibilidade com codigo existente
  a.tenant_id, 
  a.agent_name, 
  a.display_name, 
  a.status, 
  a.agent_state, 
  a.enrolled_at, 
  a.last_heartbeat,
  a.archived_at, 
  a.archived_reason,
  -- Campos derivados para compatibilidade (usando enrolled_at como fallback)
  a.enrolled_at AS command_copied_at,
  a.last_heartbeat AS agent_installed_at,
  -- Calculo de minutos entre enrolled e first heartbeat
  CASE 
    WHEN a.enrolled_at IS NOT NULL AND a.last_heartbeat IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (a.last_heartbeat - a.enrolled_at)) / 60.0
    ELSE NULL
  END AS minutes_between_copy_and_install,
  -- Lifecycle status derivado
  CASE 
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN a.agent_state = 'safe_mode' THEN 'safe_mode'
    WHEN a.is_isolated THEN 'isolated'
    WHEN a.last_heartbeat < now() - '1 hour'::interval THEN 'offline'
    WHEN a.last_heartbeat IS NOT NULL THEN 'active'
    WHEN a.enrolled_at IS NOT NULL AND a.last_heartbeat IS NULL THEN 'pending_install'
    ELSE 'enrolled_only'
  END AS lifecycle_status,
  -- is_stuck: enrolled ha mais de 30 min mas agente nunca fez heartbeat
  CASE 
    WHEN a.enrolled_at IS NOT NULL 
     AND a.last_heartbeat IS NULL 
     AND a.enrolled_at < now() - '30 minutes'::interval 
    THEN true
    ELSE false
  END AS is_stuck
FROM agents a
JOIN user_roles ur ON ur.tenant_id = a.tenant_id
WHERE ur.user_id = auth.uid()
  AND a.archived_at IS NULL;