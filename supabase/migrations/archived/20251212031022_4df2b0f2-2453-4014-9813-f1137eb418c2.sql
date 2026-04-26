-- ============================================================================
-- FASE 3: Corrigir v_agent_lifecycle_state para usar agent_name nos JOINs
-- Problema: installation_analytics tem agent_id = NULL, mas agent_name preenchido
-- Solucao: Alterar LEFT JOINs para usar agent_name + tenant_id
-- ============================================================================

DROP VIEW IF EXISTS public.v_agent_lifecycle_state;

CREATE VIEW public.v_agent_lifecycle_state 
WITH (security_invoker=on) AS
SELECT 
    a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.status AS agent_status,
    a.os_type,
    a.os_version,
    a.hostname,
    a.agent_version,
    a.enrolled_at,
    a.last_heartbeat,
    ek.created_at AS generated_at,
    ek.installer_generated_at AS downloaded_at,
    ia_copy.created_at AS command_copied_at,
    ia_install.created_at AS installed_at,
    CASE
        WHEN a.last_heartbeat > (now() - interval '5 minutes') THEN 'active'
        WHEN a.last_heartbeat IS NOT NULL THEN 'installed_offline'
        WHEN ia_install.success = true THEN 'installed'
        WHEN ia_copy.created_at IS NOT NULL THEN 'command_copied'
        WHEN ek.installer_generated_at IS NOT NULL THEN 'downloaded'
        WHEN ek.created_at IS NOT NULL THEN 'generated'
        ELSE 'pending'
    END AS lifecycle_stage,
    EXTRACT(epoch FROM now() - a.last_heartbeat)::integer / 60 AS minutes_since_heartbeat,
    EXTRACT(epoch FROM now() - a.enrolled_at)::integer / 60 AS minutes_since_enrollment,
    EXTRACT(epoch FROM ia_install.created_at - ia_copy.created_at)::integer / 60 AS minutes_between_copy_and_install,
    EXTRACT(epoch FROM ia_install.created_at - a.enrolled_at)::integer AS installation_time_seconds,
    ia_install.platform,
    ia_install.installation_method,
    ia_install.success AS installation_success,
    ia_install.network_connectivity,
    ia_install.metadata AS installation_metadata,
    ia_install.error_message AS last_error_message,
    ia_install.created_at AS last_error_at,
    CASE
        WHEN a.status = 'pending' AND a.last_heartbeat IS NULL 
             AND a.enrolled_at < (now() - interval '10 minutes') THEN true
        WHEN ia_install.success = false 
             AND ia_install.created_at > (now() - interval '24 hours') THEN true
        ELSE false
    END AS is_stuck
FROM public.agents a
    LEFT JOIN public.enrollment_keys ek ON ek.agent_id = a.id
    -- CORRIGIDO: Usar agent_name + tenant_id ao inves de agent_id
    LEFT JOIN LATERAL (
        SELECT ia.created_at
        FROM public.installation_analytics ia
        WHERE ia.agent_name = a.agent_name
          AND ia.tenant_id = a.tenant_id
          AND ia.event_type = 'command_copied'
        ORDER BY ia.created_at DESC
        LIMIT 1
    ) ia_copy ON true
    -- CORRIGIDO: Usar agent_name + tenant_id ao inves de agent_id
    LEFT JOIN LATERAL (
        SELECT 
            ia.created_at,
            ia.success,
            ia.error_message,
            ia.network_connectivity,
            ia.platform,
            ia.installation_method,
            ia.metadata
        FROM public.installation_analytics ia
        WHERE ia.agent_name = a.agent_name
          AND ia.tenant_id = a.tenant_id
          AND ia.event_type IN ('post_installation', 'post_installation_unverified', 'installation_failed')
        ORDER BY ia.created_at DESC
        LIMIT 1
    ) ia_install ON true
WHERE a.tenant_id IN (
    SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
);

-- Comentario explicativo
COMMENT ON VIEW public.v_agent_lifecycle_state IS 
'View do ciclo de vida do agente. Corrigida em 2025-01-12 para usar agent_name nos JOINs com installation_analytics (agent_id era NULL nos eventos de telemetria).';