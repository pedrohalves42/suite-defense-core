-- 1. Hardened Audit Log RLS
-- Ensure selection is strictly tied to tenant memberships
DROP POLICY IF EXISTS audit_logs_select_authenticated ON public.audit_logs;
CREATE POLICY audit_logs_select_authenticated ON public.audit_logs
FOR SELECT TO authenticated
USING (
  (tenant_id = public.get_active_tenant_id())
  OR 
  (public.is_current_super_admin())
);

-- 2. Performance: Automated Telemetry Pruning
CREATE OR REPLACE FUNCTION public.prune_old_telemetry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retain 30 days of metrics
  DELETE FROM public.agent_system_metrics_partitioned
  WHERE collected_at < now() - interval '30 days';

  -- Retain 14 days of process snapshots (heavier data)
  DELETE FROM public.agent_processes
  WHERE collected_at < now() - interval '14 days';

  -- Retain 90 days of audit logs
  DELETE FROM public.audit_logs
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- 3. Integrity: Automated Agent State Trigger
CREATE OR REPLACE FUNCTION public.sync_agent_health_state()
RETURNS TRIGGER AS $$
BEGIN
  -- If heartbeat is older than 5 minutes, state should be offline
  IF NEW.last_heartbeat < now() - interval '5 minutes' THEN
    NEW.agent_state := 'offline';
  ELSE
    NEW.agent_state := 'healthy';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_agent_health ON public.agents;
CREATE TRIGGER trg_sync_agent_health
BEFORE UPDATE OF last_heartbeat ON public.agents
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_health_state();
