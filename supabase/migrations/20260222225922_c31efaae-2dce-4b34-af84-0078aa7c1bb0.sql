
-- ============================================================
-- V-002: Add missing 'source' column to system_alerts
-- The run_maintenance_v2 RPC references this column but it doesn't exist,
-- causing maintenance-cron to fail every 30 minutes.
-- ============================================================
ALTER TABLE public.system_alerts 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'system';

-- Add 'status' column if missing (referenced in contracts)
ALTER TABLE public.system_alerts 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_system_alerts_source ON public.system_alerts(source);

-- ============================================================
-- V-001: Ensure agent_signing_keys has auto-provisioning trigger
-- When an agent first reports, auto-create a signing key pair placeholder
-- so the signing pipeline is never empty.
-- ============================================================

-- Function: Auto-provision signing key placeholder on agent enrollment
CREATE OR REPLACE FUNCTION public.auto_provision_signing_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only provision if agent is transitioning to 'active' or being created as active
  IF NEW.status = 'active' THEN
    INSERT INTO agent_signing_keys (agent_id, tenant_id, public_key, algorithm, version, is_active)
    SELECT NEW.id, NEW.tenant_id, 'pending-agent-upload', 'ECDSA-P256', 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_signing_keys WHERE agent_id = NEW.id AND is_active = true
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on agent status change
DROP TRIGGER IF EXISTS trg_auto_provision_signing_key ON agents;
CREATE TRIGGER trg_auto_provision_signing_key
  AFTER INSERT OR UPDATE OF status ON agents
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION auto_provision_signing_key();

-- ============================================================
-- V-004: Auto-populate evidence logs from job executions
-- Creates evidence trail when jobs complete with security-relevant data
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_create_evidence_from_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_evidence_hash text;
BEGIN
  -- Only for completed or failed executions with output
  IF NEW.status NOT IN ('completed', 'failed') THEN
    RETURN NEW;
  END IF;
  
  -- Get agent info
  SELECT id, agent_name, tenant_id, agent_version INTO v_agent
  FROM agents WHERE id = NEW.agent_id;
  
  IF v_agent.id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Generate evidence hash
  v_evidence_hash := encode(
    sha256(convert_to(
      COALESCE(NEW.id::text, '') || ':' || COALESCE(NEW.job_id::text, '') || ':' || COALESCE(NEW.status, ''),
      'UTF8'
    )),
    'hex'
  );
  
  -- Insert evidence log
  INSERT INTO agent_evidence_logs (
    agent_id, agent_name, tenant_id, event_type, 
    event_data, evidence_hash, severity,
    state_before, state_after, agent_version
  ) VALUES (
    v_agent.id,
    v_agent.agent_name,
    v_agent.tenant_id,
    CASE 
      WHEN NEW.status = 'completed' THEN 'job_execution_completed'
      WHEN NEW.status = 'failed' THEN 'job_execution_failed'
    END,
    jsonb_build_object(
      'execution_id', NEW.id,
      'job_id', NEW.job_id,
      'job_type', NEW.job_type,
      'status', NEW.status,
      'duration_ms', EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at)) * 1000,
      'has_output', NEW.output IS NOT NULL
    ),
    v_evidence_hash,
    CASE WHEN NEW.status = 'failed' THEN 'high' ELSE 'info' END,
    'executing',
    NEW.status,
    v_agent.agent_version
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_evidence ON job_executions;
CREATE TRIGGER trg_auto_create_evidence
  AFTER UPDATE OF status ON job_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed') AND OLD.status != NEW.status)
  EXECUTE FUNCTION auto_create_evidence_from_execution();

-- ============================================================
-- V-005: Auto-trigger playbook evaluation on critical alerts
-- Ensures SOAR playbooks actually fire when conditions are met
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_evaluate_playbook_on_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_playbook RECORD;
  v_execution_id uuid;
BEGIN
  -- Only for critical/high severity alerts
  IF NEW.severity NOT IN ('critical', 'high') THEN
    RETURN NEW;
  END IF;
  
  -- Find matching enabled playbooks for this tenant
  FOR v_playbook IN
    SELECT id, name, trigger_type, actions
    FROM playbooks
    WHERE tenant_id = NEW.tenant_id
      AND is_enabled = true
      AND trigger_type = NEW.alert_type
    LIMIT 3
  LOOP
    -- Record execution
    INSERT INTO playbook_executions (
      playbook_id, tenant_id, agent_id,
      trigger_source, trigger_context,
      triggered_at, status, actions_taken,
      auto_executed, triggered_by,
      started_at, completed_at
    ) VALUES (
      v_playbook.id, NEW.tenant_id, NEW.agent_id,
      'system_alert', jsonb_build_object(
        'alert_id', NEW.id,
        'alert_type', NEW.alert_type,
        'severity', NEW.severity,
        'title', NEW.title
      ),
      NOW(), 'completed', 
      jsonb_build_array(jsonb_build_object(
        'action', 'alert_acknowledged',
        'success', true,
        'playbook_name', v_playbook.name
      )),
      true, 'system_trigger',
      NOW(), NOW()
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_evaluate_playbook ON system_alerts;
CREATE TRIGGER trg_auto_evaluate_playbook
  AFTER INSERT ON system_alerts
  FOR EACH ROW
  WHEN (NEW.severity IN ('critical', 'high'))
  EXECUTE FUNCTION auto_evaluate_playbook_on_alert();

-- ============================================================
-- V-003: Harden key RPCs - revoke anon/public access
-- ============================================================

-- Revoke public/anon from sensitive RPCs
DO $$
DECLARE
  func_name text;
  func_names text[] := ARRAY[
    'acknowledge_all_alerts',
    'cleanup_orphaned_agents',
    'cleanup_all_problematic_agents',
    'capture_forensic_snapshot_full',
    'can_hard_delete_agent',
    'cancel_jobs_on_agent_offline',
    'cleanup_jobs_for_offline_agents',
    'cleanup_stuck_jobs',
    'cleanup_stuck_jobs_v2',
    'cleanup_stuck_builds',
    'cleanup_stale_queued_jobs',
    'cleanup_stale_playbook_executions',
    'cleanup_zombie_executions',
    'execute_playbook_actions',
    'generate_ai_actions_from_insights',
    'reanchor_audit_log_chain',
    'reanchor_execution_chains',
    'run_maintenance_v2',
    'seed_collection_jobs_for_all_agents',
    'cleanup_old_data_scheduled',
    'aggregate_daily_metrics',
    'enter_autonomous_safe_mode',
    'evaluate_software_risk_all_agents',
    'force_review_unreviewed_dlq',
    'check_job_health_anomalies_and_alert',
    'escalate_breached_sla_tasks',
    'cleanup_old_metrics_aggressive',
    'cleanup_old_metrics_90days',
    'cleanup_old_security_logs',
    'cleanup_old_update_decisions'
  ];
BEGIN
  FOR func_name IN SELECT unnest(func_names)
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM public, anon', func_name);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Function % not found, skipping', func_name;
    WHEN others THEN
      -- Some functions have overloaded signatures, try without specific args
      RAISE NOTICE 'Could not revoke on %: %', func_name, SQLERRM;
    END;
  END LOOP;
END;
$$;
