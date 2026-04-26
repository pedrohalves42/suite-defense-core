-- ============================================
-- TASK ENGINE: Closed-Loop Governance System
-- ============================================

-- 1. Create tasks table (core of the system)
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Source linkage (what generated this task)
  source_type text NOT NULL CHECK (source_type IN ('ai_insight', 'system_alert', 'playbook_execution', 'red_team', 'manual')),
  source_id uuid,
  
  -- Task core information
  title text NOT NULL,
  description text,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  
  -- Workflow state
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'ignored')),
  
  -- Assignment and SLA
  assigned_to uuid,
  due_at timestamptz,
  sla_breached_at timestamptz,
  
  -- Resolution tracking
  closed_at timestamptz,
  closed_by uuid,
  closure_reason text,
  closure_evidence jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  requires_human_review boolean NOT NULL DEFAULT false,
  auto_generated boolean NOT NULL DEFAULT true,
  playbook_id uuid,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate tasks for same source
  UNIQUE(source_type, source_id)
);

-- 2. Create essential indexes for performance
CREATE INDEX idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX idx_tasks_severity_open ON tasks(severity, status) WHERE status = 'open';
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE status IN ('open', 'in_progress');
CREATE INDEX idx_tasks_due_at ON tasks(due_at) WHERE status = 'open';
CREATE INDEX idx_tasks_sla_breach ON tasks(sla_breached_at) WHERE sla_breached_at IS NOT NULL;
CREATE INDEX idx_tasks_source ON tasks(source_type, source_id);

-- 3. Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Users can read tasks from their tenant
CREATE POLICY "Users can read tenant tasks" ON tasks
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  ));

-- Users can update tasks in their tenant
CREATE POLICY "Users can update tenant tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  ));

-- Only service role can insert tasks (automated creation)
CREATE POLICY "Service role inserts tasks" ON tasks
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Service role can update tasks (for triggers)
CREATE POLICY "Service role updates tasks" ON tasks
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Updated_at trigger
CREATE TRIGGER tr_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Function: Create task from critical AI insight
CREATE OR REPLACE FUNCTION create_task_from_critical_insight()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  sla_hours int;
BEGIN
  -- Only create task for critical/high severity unacknowledged insights
  IF NEW.severity IN ('critical', 'high') AND NEW.acknowledged = false THEN
    -- Set SLA based on severity
    sla_hours := CASE NEW.severity WHEN 'critical' THEN 4 ELSE 24 END;
    
    INSERT INTO tasks (
      tenant_id, 
      source_type, 
      source_id, 
      title, 
      description, 
      severity, 
      requires_human_review,
      due_at
    )
    VALUES (
      NEW.tenant_id,
      'ai_insight',
      NEW.id,
      COALESCE(NEW.title, 'AI Insight: ' || NEW.insight_type),
      NEW.description,
      NEW.severity,
      NEW.severity = 'critical',
      now() + (sla_hours || ' hours')::interval
    )
    ON CONFLICT (source_type, source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Trigger: Auto-create task from AI insights
CREATE TRIGGER tr_create_task_from_insight
  AFTER INSERT ON ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION create_task_from_critical_insight();

-- 8. Function: Create task from system alert
CREATE OR REPLACE FUNCTION create_task_from_system_alert()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  sla_hours int;
BEGIN
  IF NEW.severity IN ('critical', 'high') AND NEW.resolved = false THEN
    sla_hours := CASE NEW.severity WHEN 'critical' THEN 4 ELSE 24 END;
    
    INSERT INTO tasks (
      tenant_id, 
      source_type, 
      source_id, 
      title, 
      description, 
      severity, 
      requires_human_review,
      due_at
    )
    VALUES (
      NEW.tenant_id,
      'system_alert',
      NEW.id,
      NEW.title,
      NEW.message,
      NEW.severity,
      COALESCE(NEW.requires_human_decision, false),
      now() + (sla_hours || ' hours')::interval
    )
    ON CONFLICT (source_type, source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 9. Trigger: Auto-create task from system alerts
CREATE TRIGGER tr_create_task_from_alert
  AFTER INSERT ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION create_task_from_system_alert();

-- 10. Function: Sync task when source is resolved
CREATE OR REPLACE FUNCTION sync_task_on_source_resolution()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- When ai_insight is resolved
  IF TG_TABLE_NAME = 'ai_insights' AND NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
    UPDATE tasks SET 
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = COALESCE(NEW.final_outcome, 'Resolved via AI Insight'),
      updated_at = now()
    WHERE source_type = 'ai_insight' AND source_id = NEW.id;
  END IF;
  
  -- When ai_insight is acknowledged (mark in progress)
  IF TG_TABLE_NAME = 'ai_insights' AND NEW.acknowledged = true AND OLD.acknowledged = false THEN
    UPDATE tasks SET 
      status = 'in_progress',
      updated_at = now()
    WHERE source_type = 'ai_insight' AND source_id = NEW.id AND status = 'open';
  END IF;
  
  -- When system_alert is resolved
  IF TG_TABLE_NAME = 'system_alerts' AND NEW.resolved = true AND OLD.resolved = false THEN
    UPDATE tasks SET 
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = NEW.resolution_notes,
      updated_at = now()
    WHERE source_type = 'system_alert' AND source_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 11. Triggers for sync
CREATE TRIGGER tr_sync_task_insight
  AFTER UPDATE ON ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_on_source_resolution();

CREATE TRIGGER tr_sync_task_alert
  AFTER UPDATE ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_on_source_resolution();

-- 12. Function: Check and mark SLA breaches
CREATE OR REPLACE FUNCTION check_task_sla_breach()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  breach_count int;
BEGIN
  UPDATE tasks
  SET sla_breached_at = now(), updated_at = now()
  WHERE status IN ('open', 'in_progress')
    AND due_at < now()
    AND sla_breached_at IS NULL;
  
  GET DIAGNOSTICS breach_count = ROW_COUNT;
  RETURN breach_count;
END;
$$;

-- 13. View: Task statistics per tenant
CREATE OR REPLACE VIEW v_task_stats AS
SELECT 
  tenant_id,
  COUNT(*) FILTER (WHERE status = 'open') as open_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status = 'blocked') as blocked_count,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
  COUNT(*) FILTER (WHERE status = 'ignored') as ignored_count,
  COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as critical_open,
  COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high') as high_open,
  COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL AND status IN ('open', 'in_progress')) as sla_breached,
  AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/3600) FILTER (WHERE closed_at IS NOT NULL) as avg_resolution_hours
FROM tasks
GROUP BY tenant_id;

-- 14. Enable realtime for tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;