-- ============================================================================
-- FASE 1B: Correcao de Permissoes de Seguranca em Views
-- Revogar acesso anon e aplicar permissoes corretas
-- ============================================================================

-- 1. DROP da view desnecessaria
DROP VIEW IF EXISTS public.v_security_definer_inventory CASCADE;

-- 2. REVOGAR acesso anon de TODAS as views de seguranca
REVOKE ALL ON public.agent_releases_public FROM anon;
REVOKE ALL ON public.agent_system_metrics_unified FROM anon;
REVOKE ALL ON public.agents_health_view FROM anon;
REVOKE ALL ON public.agents_safe FROM anon;
REVOKE ALL ON public.agent_timeline_events FROM anon;
REVOKE ALL ON public.agent_installation_metrics FROM anon;
REVOKE ALL ON public.audit_logs_safe FROM anon;
REVOKE ALL ON public.enrollment_keys_safe FROM anon;
REVOKE ALL ON public.hmac_signatures FROM anon;
REVOKE ALL ON public.installation_error_summary FROM anon;
REVOKE ALL ON public.installation_health_status FROM anon;
REVOKE ALL ON public.installation_metrics_summary FROM anon;
REVOKE ALL ON public.jobs_normalized FROM anon;
REVOKE ALL ON public.rate_limit_stats FROM anon;
REVOKE ALL ON public.v_agent_health_summary FROM anon;
REVOKE ALL ON public.v_agent_lifecycle_state FROM anon;
REVOKE ALL ON public.v_edge_function_stats FROM anon;
REVOKE ALL ON public.v_problematic_agents FROM anon;
REVOKE ALL ON public.v_problematic_jobs FROM anon;
REVOKE ALL ON public.v_stuck_jobs_report FROM anon;
REVOKE ALL ON public.v_system_operations_summary FROM anon;

-- 3. REVOGAR acesso public de hmac_signatures (apenas service_role deve acessar)
REVOKE ALL ON public.hmac_signatures FROM authenticated;
REVOKE ALL ON public.hmac_signatures FROM public;

-- 4. GRANT SELECT para authenticated em views de tenant (com security_invoker)
GRANT SELECT ON public.agent_releases_public TO authenticated;
GRANT SELECT ON public.agent_system_metrics_unified TO authenticated;
GRANT SELECT ON public.agents_health_view TO authenticated;
GRANT SELECT ON public.agents_safe TO authenticated;
GRANT SELECT ON public.agent_timeline_events TO authenticated;
GRANT SELECT ON public.agent_installation_metrics TO authenticated;
GRANT SELECT ON public.audit_logs_safe TO authenticated;
GRANT SELECT ON public.enrollment_keys_safe TO authenticated;
GRANT SELECT ON public.installation_error_summary TO authenticated;
GRANT SELECT ON public.installation_health_status TO authenticated;
GRANT SELECT ON public.installation_metrics_summary TO authenticated;
GRANT SELECT ON public.jobs_normalized TO authenticated;
GRANT SELECT ON public.v_agent_health_summary TO authenticated;
GRANT SELECT ON public.v_agent_lifecycle_state TO authenticated;
GRANT SELECT ON public.v_problematic_agents TO authenticated;
GRANT SELECT ON public.v_problematic_jobs TO authenticated;
GRANT SELECT ON public.v_stuck_jobs_report TO authenticated;
GRANT SELECT ON public.v_system_operations_summary TO authenticated;

-- 5. Views de admin (rate_limit_stats, v_edge_function_stats) - apenas authenticated
-- O filtro de super_admin sera feito nas queries do frontend
GRANT SELECT ON public.rate_limit_stats TO authenticated;
GRANT SELECT ON public.v_edge_function_stats TO authenticated;

-- 6. hmac_signatures - apenas service_role pode acessar
GRANT ALL ON public.hmac_signatures TO service_role;