-- Fix: REVOKE from PUBLIC role (PostgreSQL default grant)
-- The previous REVOKE from 'anon' is insufficient because PUBLIC role inherits execute

REVOKE EXECUTE ON FUNCTION public.claim_event_buffer_batch(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_telemetry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_evidence_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_threat_intel_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_archived_agent_heartbeat(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_incident_event_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.summarize_telemetry_hourly(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_version_soar_playbook() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_threat_indicators_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_role_self_promotion() FROM PUBLIC;

-- Re-grant to authenticated for user-facing RPCs only
GRANT EXECUTE ON FUNCTION public.get_evidence_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_threat_intel_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_archived_agent_heartbeat(uuid, uuid) TO authenticated