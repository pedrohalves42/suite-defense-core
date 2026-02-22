
-- =====================================================
-- VELLUM AUDIT: Revoke anon/public EXECUTE on sensitive RPCs
-- V-001 CRITICAL: submit_agent_evidence (DML, no auth)
-- V-002 CRITICAL: recalculate_tenant_risk_score (DML, no auth) 
-- V-003 HIGH: check_rate_limit_atomic (DML, DoS vector)
-- Plus data-exposing RPCs callable by anon
-- =====================================================

REVOKE ALL ON FUNCTION public.submit_agent_evidence(uuid, uuid, text, text, text, jsonb, text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.recalculate_tenant_risk_score(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.check_rate_limit_atomic(text, text, integer, integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_action_center_feed(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_problematic_agents(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_job_health_summary() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_installation_health_status(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.installation_health_summary() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_rate_limit_summary(integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_replay_attempts(integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.diagnose_agent(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_adaptive_blast_radius(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.detect_improdutive_agents() FROM public, anon;
