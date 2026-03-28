-- ============================================
-- GOVERNANCE FINAL GAPS - Part 2 (Gap 3 & 4)
-- ============================================

-- ============================================
-- GAP 3: Proof of Coverage (Security Gates)
-- ============================================

-- 3.1 Coverage validation function
CREATE OR REPLACE FUNCTION public.validate_governance_coverage(tenant_uuid uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  alerts_uncovered integer := 0;
  insights_uncovered integer := 0;
  orphan_critical integer := 0;
  is_compliant boolean;
BEGIN
  SELECT count(*) INTO alerts_uncovered
  FROM public.system_alerts a
  WHERE a.severity IN ('critical', 'high')
    AND a.created_at > now() - interval '24 hours'
    AND (tenant_uuid IS NULL OR a.tenant_id = tenant_uuid)
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.source_type = 'system_alert'
        AND t.source_id = a.id::text
    );
  
  SELECT count(*) INTO insights_uncovered
  FROM public.ai_insights i
  WHERE i.severity IN ('critical', 'high')
    AND i.created_at > now() - interval '24 hours'
    AND (tenant_uuid IS NULL OR i.tenant_id = tenant_uuid)
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.source_type = 'ai_insight'
        AND t.source_id = i.id::text
    );
  
  SELECT count(*) INTO orphan_critical
  FROM public.tasks
  WHERE severity = 'critical'
    AND status IN ('open', 'in_progress')
    AND assigned_to IS NULL
    AND created_at < now() - interval '2 hours'
    AND (tenant_uuid IS NULL OR tenant_id = tenant_uuid);
  
  is_compliant := (alerts_uncovered = 0 AND insights_uncovered = 0 AND orphan_critical = 0);
  
  result := jsonb_build_object(
    'timestamp', now(),
    'is_compliant', is_compliant,
    'alerts_uncovered', alerts_uncovered,
    'insights_uncovered', insights_uncovered,
    'orphan_critical_tasks', orphan_critical,
    'gates', jsonb_build_array(
      jsonb_build_object('gate', 'all_critical_alerts_have_tasks', 'passed', alerts_uncovered = 0, 'count', alerts_uncovered),
      jsonb_build_object('gate', 'all_critical_insights_have_tasks', 'passed', insights_uncovered = 0, 'count', insights_uncovered),
      jsonb_build_object('gate', 'all_critical_tasks_have_owner', 'passed', orphan_critical = 0, 'count', orphan_critical)
    )
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3.2 Auto-create task for critical alerts trigger
CREATE OR REPLACE FUNCTION public.auto_create_task_for_critical_alert()
RETURNS trigger AS $$
BEGIN
  IF NEW.severity IN ('critical', 'high') THEN
    INSERT INTO public.tasks (
      tenant_id, source_type, source_id, title, description, 
      severity, status, requires_human_review, auto_generated
    )
    SELECT 
      NEW.tenant_id,
      'system_alert',
      NEW.id::text,
      'Alerta: ' || COALESCE(NEW.alert_type, 'Sistema'),
      COALESCE(NEW.message, 'Alerta de sistema requer atencao'),
      NEW.severity,
      'open',
      NEW.severity = 'critical',
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.source_type = 'system_alert' 
        AND t.source_id = NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_create_task_for_critical_alert ON public.system_alerts;
CREATE TRIGGER trg_auto_create_task_for_critical_alert
AFTER INSERT ON public.system_alerts
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_task_for_critical_alert();

-- ============================================
-- GAP 4: Governance Reports
-- ============================================

CREATE TABLE IF NOT EXISTS public.governance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'quarterly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  executive_summary text NOT NULL,
  key_metrics jsonb NOT NULL DEFAULT '{}',
  risk_debt_summary jsonb,
  sla_performance jsonb,
  human_decisions jsonb,
  generated_by text NOT NULL DEFAULT 'ai',
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  UNIQUE(tenant_id, report_type, period_start)
);

ALTER TABLE public.governance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant reports" ON public.governance_reports
FOR SELECT USING (tenant_id IN (
  SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()
));

CREATE POLICY "Users can insert tenant reports" ON public.governance_reports
FOR INSERT WITH CHECK (tenant_id IN (
  SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()
));

CREATE POLICY "Users can update tenant reports" ON public.governance_reports
FOR UPDATE USING (tenant_id IN (
  SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()
));

-- Collect weekly metrics function
CREATE OR REPLACE FUNCTION public.collect_weekly_governance_metrics(tenant_uuid uuid, week_start date DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  start_date date := COALESCE(week_start, date_trunc('week', now())::date);
  end_date date := start_date + interval '7 days';
  result jsonb;
  tasks_opened integer;
  tasks_resolved integer;
  tasks_ignored integer;
  tasks_risk_accepted integer;
  sla_breached integer;
  human_decisions integer;
  avg_resolution_hours numeric;
  critical_open integer;
BEGIN
  SELECT count(*) INTO tasks_opened
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND created_at >= start_date AND created_at < end_date;
  
  SELECT count(*) INTO tasks_resolved
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND status = 'resolved'
    AND closed_at >= start_date AND closed_at < end_date;
  
  SELECT count(*) INTO tasks_ignored
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND status = 'ignored'
    AND closed_at >= start_date AND closed_at < end_date;
  
  SELECT count(*) INTO tasks_risk_accepted
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND status = 'accepted_risk'
    AND risk_accepted_at >= start_date AND risk_accepted_at < end_date;
  
  SELECT count(*) INTO sla_breached
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND sla_breached_at >= start_date AND sla_breached_at < end_date;
  
  SELECT count(*) INTO human_decisions
  FROM public.task_events WHERE tenant_id = tenant_uuid
    AND actor_type = 'user'
    AND event_at >= start_date AND event_at < end_date;
  
  SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/3600)::numeric INTO avg_resolution_hours
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND status = 'resolved'
    AND closed_at >= start_date AND closed_at < end_date;
  
  SELECT count(*) INTO critical_open
  FROM public.tasks WHERE tenant_id = tenant_uuid
    AND severity = 'critical'
    AND status IN ('open', 'in_progress');
  
  result := jsonb_build_object(
    'period_start', start_date,
    'period_end', end_date,
    'tasks_opened', tasks_opened,
    'tasks_resolved', tasks_resolved,
    'tasks_ignored', tasks_ignored,
    'tasks_risk_accepted', tasks_risk_accepted,
    'sla_breached', sla_breached,
    'human_decisions', human_decisions,
    'avg_resolution_hours', ROUND(COALESCE(avg_resolution_hours, 0), 2),
    'critical_open', critical_open,
    'net_tasks', tasks_opened - tasks_resolved - tasks_ignored
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update v_governance_stats to include risk debt
CREATE OR REPLACE VIEW public.v_governance_stats
WITH (security_invoker = on) AS
SELECT 
  t.tenant_id,
  COUNT(*) FILTER (WHERE t.status IN ('open', 'in_progress')) as active_tasks,
  COUNT(*) FILTER (WHERE t.status IN ('open', 'in_progress') AND t.assigned_to IS NULL) as unassigned_tasks,
  COUNT(*) FILTER (WHERE t.sla_breached_at IS NOT NULL AND t.status IN ('open', 'in_progress')) as sla_breached_active,
  COUNT(*) FILTER (WHERE t.severity = 'critical' AND t.status IN ('open', 'in_progress')) as critical_open,
  COUNT(*) FILTER (WHERE t.severity = 'high' AND t.status IN ('open', 'in_progress')) as high_open,
  ROUND(AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at))/3600) FILTER (WHERE t.status = 'resolved'), 2) as avg_resolution_hours,
  COUNT(*) FILTER (WHERE t.status = 'resolved' AND t.closed_at > now() - interval '24 hours') as resolved_24h,
  COUNT(*) FILTER (WHERE t.status = 'ignored' AND t.closed_at > now() - interval '24 hours') as ignored_24h,
  COUNT(*) FILTER (WHERE t.status = 'accepted_risk') as active_risk_debt,
  COUNT(*) FILTER (WHERE t.status = 'accepted_risk' AND t.risk_expiry_at <= now() + interval '7 days') as risks_expiring_soon
FROM public.tasks t
GROUP BY t.tenant_id;