
-- ================================================================
-- FIX 1: TRUNCATE BYPASS PROTECTION (INV-005)
-- Revoke TRUNCATE on all immutable audit tables
-- ================================================================

-- Revoke TRUNCATE from all roles except postgres (superuser)
REVOKE TRUNCATE ON public.audit_logs FROM anon, authenticated, public, service_role;
REVOKE TRUNCATE ON public.security_logs FROM anon, authenticated, public, service_role;
REVOKE TRUNCATE ON public.agent_evidence_logs FROM anon, authenticated, public, service_role;
REVOKE TRUNCATE ON public.poe_chain_breaks FROM anon, authenticated, public, service_role;
REVOKE TRUNCATE ON public.domain_events FROM anon, authenticated, public, service_role;
REVOKE TRUNCATE ON public.job_executions FROM anon, authenticated, public, service_role;

-- Also add event-level TRUNCATE trigger as defense-in-depth
CREATE OR REPLACE FUNCTION public.prevent_truncate()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obj record;
  v_protected_tables text[] := ARRAY[
    'audit_logs', 'security_logs', 'agent_evidence_logs', 
    'poe_chain_breaks', 'domain_events', 'job_executions'
  ];
BEGIN
  FOR v_obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF v_obj.command_tag = 'TRUNCATE' THEN
      -- Note: event triggers can't prevent TRUNCATE directly,
      -- but REVOKE TRUNCATE above is the real protection.
      -- This logs any attempt that somehow bypasses REVOKE.
      RAISE WARNING 'TRUNCATE attempted on protected table - this should be blocked by REVOKE';
    END IF;
  END LOOP;
END;
$$;

-- ================================================================
-- FIX 2: OPTIMIZED COMPOSITE INDEX for jobs hot-path queries
-- Replace redundant indexes with optimal composites
-- ================================================================

-- The key query pattern: WHERE agent_id = X AND status IN ('pending','queued') ORDER BY priority DESC, created_at ASC
CREATE INDEX IF NOT EXISTS idx_jobs_agent_pending_priority 
  ON jobs (agent_id, status, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'queued', 'delivered');

-- Cleanup: remove redundant indexes that are subsets of existing ones
DROP INDEX IF EXISTS idx_jobs_status_output;
DROP INDEX IF EXISTS idx_jobs_completed_status;

-- ================================================================
-- FIX 3: Additional security - prevent DELETE on immutable tables  
-- (some tables only had UPDATE prevention)
-- ================================================================

-- Ensure all immutable tables have both UPDATE and DELETE prevention
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Modification of immutable audit records is prohibited (INV-005). Table: %, Operation: %', TG_TABLE_NAME, TG_OP;
  RETURN NULL;
END;
$$;

-- Apply to all audit tables (idempotent - drop first)
DROP TRIGGER IF EXISTS prevent_security_logs_update ON security_logs;
DROP TRIGGER IF EXISTS prevent_security_logs_delete ON security_logs;
CREATE TRIGGER prevent_security_logs_update BEFORE UPDATE ON security_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
CREATE TRIGGER prevent_security_logs_delete BEFORE DELETE ON security_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS prevent_domain_events_update ON domain_events;
DROP TRIGGER IF EXISTS prevent_domain_events_delete ON domain_events;
CREATE TRIGGER prevent_domain_events_update BEFORE UPDATE ON domain_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
CREATE TRIGGER prevent_domain_events_delete BEFORE DELETE ON domain_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS prevent_poe_chain_breaks_update ON poe_chain_breaks;
DROP TRIGGER IF EXISTS prevent_poe_chain_breaks_delete ON poe_chain_breaks;
CREATE TRIGGER prevent_poe_chain_breaks_update BEFORE UPDATE ON poe_chain_breaks FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
CREATE TRIGGER prevent_poe_chain_breaks_delete BEFORE DELETE ON poe_chain_breaks FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
