-- V-2001 + V-2005: REVOKE EXECUTE from anon on all SECURITY DEFINER RPCs
-- These functions bypass RLS and must NOT be callable without authentication

REVOKE EXECUTE ON FUNCTION public.claim_event_buffer_batch(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_telemetry() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_evidence_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_threat_intel_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_archived_agent_heartbeat(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_incident_event_count() FROM anon;
REVOKE EXECUTE ON FUNCTION public.summarize_telemetry_hourly(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_version_soar_playbook() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_threat_indicators_updated_at() FROM anon;

-- V-2005: Also revoke from authenticated for internal-only functions
REVOKE EXECUTE ON FUNCTION public.claim_event_buffer_batch(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_telemetry() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.summarize_telemetry_hourly(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_version_soar_playbook() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_threat_indicators_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_incident_event_count() FROM authenticated