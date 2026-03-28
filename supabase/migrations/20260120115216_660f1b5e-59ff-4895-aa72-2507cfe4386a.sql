-- ADR-VELLUM V-201: Correcoes de Isolamento Multi-Tenant em Views
-- Data: 2026-01-20
-- Objetivo: Adicionar filtro get_active_tenant_id() OR is_current_super_admin() em 3 views
--           e documentar 8 views intencionalmente globais

-- ============================================================================
-- FASE 1: CORRECAO DE VIEWS SEM FILTRO DE TENANT ADEQUADO
-- ============================================================================

-- V-201.1: v_job_execution_health - Adicionar filtro de tenant no WHERE
DROP VIEW IF EXISTS public.v_job_execution_health;
CREATE VIEW public.v_job_execution_health WITH (security_invoker = on) AS
SELECT j.tenant_id,
    count(*) FILTER (WHERE (j.status = 'delivered'::text)) AS delivered_count,
    count(*) FILTER (WHERE (j.status = 'completed'::text)) AS completed_count,
    count(*) FILTER (WHERE (j.status = 'failed'::text)) AS failed_count,
    count(*) FILTER (WHERE ((j.status = 'completed'::text) AND (j.finished_at > j.expires_at))) AS expired_completed_count,
    count(*) FILTER (WHERE (j.id IN ( SELECT je2.job_id
           FROM job_executions je2
          GROUP BY je2.job_id
         HAVING (count(*) > 1)))) AS duplicate_execution_jobs,
    avg(EXTRACT(epoch FROM (j.delivered_at - j.created_at))) AS avg_queue_time_seconds,
    avg(je.execution_time_seconds) FILTER (WHERE (j.status = 'completed'::text)) AS avg_execution_time_seconds,
    now() AS calculated_at
   FROM (jobs j
     LEFT JOIN job_executions je ON ((j.current_execution_id = je.id)))
  WHERE (j.created_at > (now() - '24:00:00'::interval))
    AND (j.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  GROUP BY j.tenant_id;

-- V-201.2: v_agent_execution_health - Adicionar filtro de tenant no WHERE
DROP VIEW IF EXISTS public.v_agent_execution_health;
CREATE VIEW public.v_agent_execution_health WITH (security_invoker = on) AS
SELECT a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.status,
    a.last_heartbeat,
    a.agent_mode,
    a.agent_version,
    a.enrolled_at,
        CASE
            WHEN (a.last_heartbeat IS NULL) THEN 'never_seen'::text
            WHEN (a.last_heartbeat < (now() - '00:15:00'::interval)) THEN 'offline'::text
            WHEN (a.last_heartbeat < (now() - '00:05:00'::interval)) THEN 'degraded'::text
            WHEN (a.agent_mode = 'safe_mode'::text) THEN 'safe_mode'::text
            WHEN (le.last_execution_at IS NULL) THEN 'not_executing_jobs'::text
            WHEN (le.last_execution_at < (now() - '02:00:00'::interval)) THEN 'execution_stale'::text
            WHEN (COALESCE(jq.stale_queued, (0)::bigint) >= 3) THEN 'not_polling_jobs'::text
            ELSE 'healthy'::text
        END AS health_status,
    (EXTRACT(epoch FROM (now() - a.last_heartbeat)))::integer AS seconds_since_heartbeat,
    ((EXTRACT(epoch FROM (now() - a.last_heartbeat)) / (60)::numeric))::integer AS minutes_since_heartbeat,
    ((EXTRACT(epoch FROM (now() - le.last_execution_at)) / (60)::numeric))::integer AS minutes_since_execution,
    le.last_execution_at,
    (COALESCE(jq.stale_queued, (0)::bigint))::integer AS stale_queued_jobs,
    (COALESCE(jq.stale_delivered, (0)::bigint))::integer AS stale_delivered_jobs,
    (COALESCE(jq.pending, (0)::bigint))::integer AS pending_jobs
   FROM ((agents a
     LEFT JOIN LATERAL ( SELECT max(je.finished_at) AS last_execution_at
           FROM job_executions je
          WHERE (je.agent_id = a.id)) le ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE ((j.status = 'queued'::text) AND (j.created_at < (now() - '01:00:00'::interval)))) AS stale_queued,
            count(*) FILTER (WHERE ((j.status = 'delivered'::text) AND (j.created_at < (now() - '01:00:00'::interval)))) AS stale_delivered,
            count(*) FILTER (WHERE (j.status = ANY (ARRAY['queued'::text, 'delivered'::text]))) AS pending
           FROM jobs j
          WHERE (j.agent_id = a.id)) jq ON (true))
  WHERE (a.archived_at IS NULL)
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- V-201.3: v_agent_lifecycle_state - Ja tem filtro via user_roles, mas vamos padronizar
-- usando get_active_tenant_id() para consistencia com outras views
DROP VIEW IF EXISTS public.v_agent_lifecycle_state;
CREATE VIEW public.v_agent_lifecycle_state WITH (security_invoker = on) AS
SELECT a.id,
    a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.status,
    a.agent_state,
    a.enrolled_at,
    a.last_heartbeat,
    a.archived_at,
    a.archived_reason,
    a.enrolled_at AS command_copied_at,
    a.last_heartbeat AS agent_installed_at,
        CASE
            WHEN ((a.enrolled_at IS NOT NULL) AND (a.last_heartbeat IS NOT NULL)) THEN (EXTRACT(epoch FROM (a.last_heartbeat - a.enrolled_at)) / 60.0)
            ELSE NULL::numeric
        END AS minutes_between_copy_and_install,
        CASE
            WHEN (a.archived_at IS NOT NULL) THEN 'archived'::text
            WHEN (a.agent_state = 'safe_mode'::text) THEN 'safe_mode'::text
            WHEN a.is_isolated THEN 'isolated'::text
            WHEN (a.last_heartbeat < (now() - '01:00:00'::interval)) THEN 'offline'::text
            WHEN (a.last_heartbeat IS NOT NULL) THEN 'active'::text
            WHEN ((a.enrolled_at IS NOT NULL) AND (a.last_heartbeat IS NULL)) THEN 'pending_install'::text
            ELSE 'enrolled_only'::text
        END AS lifecycle_status,
        CASE
            WHEN ((a.enrolled_at IS NOT NULL) AND (a.last_heartbeat IS NULL) AND (a.enrolled_at < (now() - '00:30:00'::interval))) THEN true
            ELSE false
        END AS is_stuck
   FROM agents a
  WHERE (a.archived_at IS NULL)
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- ============================================================================
-- FASE 2: DOCUMENTACAO DE VIEWS INTENCIONALMENTE GLOBAIS (SUPER_ADMIN ONLY)
-- ============================================================================

-- v_integrity_score: Metricas globais de integridade
COMMENT ON VIEW public.v_integrity_score IS 
  'ADR-VELLUM V-201: Global integrity metrics - super_admin only via is_current_super_admin(). Intentionally global for cross-tenant monitoring.';

-- v_job_health: Metricas globais de saude de jobs
COMMENT ON VIEW public.v_job_health IS 
  'ADR-VELLUM V-201: Global job health metrics - super_admin only via is_current_super_admin(). Intentionally global for cross-tenant monitoring.';

-- v_rls_continuous_check: Monitoramento continuo de RLS
COMMENT ON VIEW public.v_rls_continuous_check IS 
  'ADR-VELLUM V-201: RLS continuous monitoring - super_admin only via is_current_super_admin(). Security audit view.';

-- v_rls_security_status: Status de seguranca RLS
COMMENT ON VIEW public.v_rls_security_status IS 
  'ADR-VELLUM V-201: RLS security test results - super_admin only via is_current_super_admin(). Security audit view.';

-- v_security_dashboard: Dashboard de seguranca global
COMMENT ON VIEW public.v_security_dashboard IS 
  'ADR-VELLUM V-201: Global security summary - super_admin only via is_current_super_admin(). Intentionally global for platform monitoring.';

-- v_security_invariants: Invariantes de seguranca
COMMENT ON VIEW public.v_security_invariants IS 
  'ADR-VELLUM V-201: Security invariants check - super_admin only via is_current_super_admin(). Platform-wide security validation.';

-- v_cron_silence: Monitoramento de silenciamento de crons
COMMENT ON VIEW public.v_cron_silence IS 
  'ADR-VELLUM V-201: Cron silence monitoring - global view for operational visibility. No sensitive tenant data exposed.';

-- hmac_agent_secrets: Acesso a secrets HMAC
COMMENT ON VIEW public.hmac_agent_secrets IS 
  'ADR-VELLUM V-201: HMAC secrets access - super_admin only via is_current_super_admin(). Critical security view for agent authentication.';

-- ============================================================================
-- VALIDACAO: Confirmar que views foram recriadas com filtros corretos
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Verificar v_job_execution_health
  SELECT COUNT(*) INTO v_count FROM pg_views 
  WHERE viewname = 'v_job_execution_health' 
  AND schemaname = 'public'
  AND definition LIKE '%get_active_tenant_id()%';
  
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-201.1 FAILED: v_job_execution_health missing tenant filter';
  END IF;
  
  -- Verificar v_agent_execution_health
  SELECT COUNT(*) INTO v_count FROM pg_views 
  WHERE viewname = 'v_agent_execution_health' 
  AND schemaname = 'public'
  AND definition LIKE '%get_active_tenant_id()%';
  
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-201.2 FAILED: v_agent_execution_health missing tenant filter';
  END IF;
  
  -- Verificar v_agent_lifecycle_state
  SELECT COUNT(*) INTO v_count FROM pg_views 
  WHERE viewname = 'v_agent_lifecycle_state' 
  AND schemaname = 'public'
  AND definition LIKE '%get_active_tenant_id()%';
  
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-201.3 FAILED: v_agent_lifecycle_state missing tenant filter';
  END IF;
  
  RAISE NOTICE 'V-201: All 3 views successfully updated with tenant filters';
END $$;