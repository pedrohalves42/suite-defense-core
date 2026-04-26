-- Phase 2-4: Task Evidence + Escalation + Owner validation

-- ============================================
-- Phase 2: Task Evidence Table
-- ============================================

CREATE TABLE public.task_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  evidence_type text NOT NULL CHECK (evidence_type IN ('log', 'snapshot', 'diff', 'report', 'decision', 'timeline')),
  title text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  storage_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_task_evidence_task_id ON public.task_evidence(task_id);
CREATE INDEX idx_task_evidence_tenant_id ON public.task_evidence(tenant_id);

ALTER TABLE public.task_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read task evidence from their tenant"
ON public.task_evidence
FOR SELECT
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- ============================================
-- Function to collect evidence on task closure
-- ============================================

CREATE OR REPLACE FUNCTION public.collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_events jsonb;
  v_source_data jsonb;
BEGIN
  IF NEW.status IN ('resolved', 'ignored') AND OLD.status NOT IN ('resolved', 'ignored') THEN
    
    -- Collect timeline of events
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'action', e.action,
        'actor_type', e.actor_type,
        'actor_id', e.actor_id,
        'metadata', e.metadata,
        'created_at', e.created_at
      ) ORDER BY e.created_at
    ) INTO v_events
    FROM task_events e WHERE e.task_id = NEW.id;
    
    IF v_events IS NOT NULL THEN
      INSERT INTO task_evidence (task_id, tenant_id, evidence_type, title, content, content_hash)
      VALUES (
        NEW.id, 
        NEW.tenant_id, 
        'timeline', 
        'Timeline de Eventos',
        v_events,
        encode(sha256(v_events::text::bytea), 'hex')
      );
    END IF;
    
    -- Collect source data based on source_type
    IF NEW.source_type = 'ai_insight' AND NEW.source_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', i.id,
        'type', i.type,
        'title', i.title,
        'summary', i.summary,
        'severity', i.severity,
        'confidence', i.confidence,
        'status', i.status,
        'created_at', i.created_at
      ) INTO v_source_data
      FROM ai_insights i WHERE i.id = NEW.source_id;
      
      IF v_source_data IS NOT NULL THEN
        INSERT INTO task_evidence (task_id, tenant_id, evidence_type, title, content, content_hash)
        VALUES (
          NEW.id, 
          NEW.tenant_id, 
          'snapshot', 
          'AI Insight Original',
          v_source_data,
          encode(sha256(v_source_data::text::bytea), 'hex')
        );
      END IF;
      
    ELSIF NEW.source_type = 'system_alert' AND NEW.source_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', a.id,
        'alert_type', a.alert_type,
        'severity', a.severity,
        'message', a.message,
        'status', a.status,
        'created_at', a.created_at
      ) INTO v_source_data
      FROM system_alerts a WHERE a.id = NEW.source_id;
      
      IF v_source_data IS NOT NULL THEN
        INSERT INTO task_evidence (task_id, tenant_id, evidence_type, title, content, content_hash)
        VALUES (
          NEW.id, 
          NEW.tenant_id, 
          'snapshot', 
          'Alerta do Sistema Original',
          v_source_data,
          encode(sha256(v_source_data::text::bytea), 'hex')
        );
      END IF;
    END IF;
    
    -- Record final decision
    INSERT INTO task_evidence (task_id, tenant_id, evidence_type, title, content, content_hash, created_by)
    VALUES (
      NEW.id, 
      NEW.tenant_id, 
      'decision', 
      'Decisao de Fechamento',
      jsonb_build_object(
        'final_status', NEW.status,
        'closure_reason', NEW.closure_reason,
        'closed_at', NEW.closed_at,
        'closed_by', NEW.closed_by,
        'sla_breached', NEW.sla_breached_at IS NOT NULL,
        'time_to_resolution_hours', EXTRACT(EPOCH FROM (NEW.closed_at - NEW.created_at)) / 3600
      ),
      encode(sha256(COALESCE(NEW.closure_reason, 'no-reason')::bytea), 'hex'),
      NEW.closed_by
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_collect_task_evidence
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.collect_task_evidence();

-- ============================================
-- Phase 3: SLA Escalation Function
-- ============================================

CREATE OR REPLACE FUNCTION public.escalate_breached_sla_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Mark tasks with breached SLA
  UPDATE tasks
  SET 
    sla_breached_at = now(),
    updated_at = now()
  WHERE due_at < now()
    AND sla_breached_at IS NULL
    AND status IN ('open', 'in_progress');
END;
$$;

-- ============================================
-- View for tasks requiring urgent attention
-- ============================================

CREATE OR REPLACE VIEW public.v_tasks_requiring_closure AS
SELECT 
  t.*,
  EXTRACT(EPOCH FROM (now() - t.created_at))/3600 as hours_open,
  CASE 
    WHEN t.sla_breached_at IS NOT NULL THEN 'sla_breached'
    WHEN t.due_at IS NOT NULL AND t.due_at < now() + interval '1 hour' THEN 'sla_warning'
    ELSE 'normal'
  END as urgency_level,
  CASE 
    WHEN t.severity = 'critical' AND t.assigned_to IS NULL THEN true
    WHEN t.severity = 'high' AND t.assigned_to IS NULL AND t.created_at < now() - interval '2 hours' THEN true
    ELSE false
  END as needs_owner
FROM tasks t
WHERE t.status IN ('open', 'in_progress', 'blocked')
ORDER BY 
  CASE t.severity 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END,
  t.due_at NULLS LAST;

-- ============================================
-- Governance Stats View
-- ============================================

CREATE OR REPLACE VIEW public.v_governance_stats AS
SELECT 
  t.tenant_id,
  COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) as active_tasks,
  COUNT(*) FILTER (WHERE status = 'open' AND assigned_to IS NULL) as unassigned_tasks,
  COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL AND status IN ('open', 'in_progress')) as sla_breached_active,
  COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open', 'in_progress')) as critical_open,
  COUNT(*) FILTER (WHERE severity = 'high' AND status IN ('open', 'in_progress')) as high_open,
  AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/3600) FILTER (WHERE closed_at IS NOT NULL) as avg_resolution_hours,
  COUNT(*) FILTER (WHERE status = 'resolved' AND closed_at > now() - interval '24 hours') as resolved_24h,
  COUNT(*) FILTER (WHERE status = 'ignored' AND closed_at > now() - interval '24 hours') as ignored_24h
FROM tasks t
GROUP BY t.tenant_id;

COMMENT ON TABLE public.task_evidence IS 'Immutable evidence records for task audit trail';
COMMENT ON VIEW public.v_tasks_requiring_closure IS 'Tasks that need urgent attention based on SLA and ownership';
COMMENT ON VIEW public.v_governance_stats IS 'Aggregated governance metrics per tenant';