-- Phase 1: Task Events - Immutable Timeline
-- Creates complete audit trail for all task actions

-- Create task_events table
CREATE TABLE public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'ai', 'human')),
  actor_id uuid,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_task_events_task_id ON public.task_events(task_id);
CREATE INDEX idx_task_events_tenant_id ON public.task_events(tenant_id);
CREATE INDEX idx_task_events_created_at ON public.task_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read events from their tenant
CREATE POLICY "Users can read task events from their tenant"
ON public.task_events
FOR SELECT
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- RLS: Only service_role can insert (via triggers)
CREATE POLICY "Service role can insert task events"
ON public.task_events
FOR INSERT
WITH CHECK (true);

-- Function to log task events automatically
CREATE OR REPLACE FUNCTION public.log_task_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_events (task_id, tenant_id, actor_type, action, metadata)
    VALUES (
      NEW.id, 
      NEW.tenant_id, 
      'system', 
      'created', 
      jsonb_build_object(
        'severity', NEW.severity,
        'source_type', NEW.source_type,
        'source_id', NEW.source_id,
        'auto_generated', NEW.auto_generated,
        'title', NEW.title
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO task_events (task_id, tenant_id, actor_type, actor_id, action, metadata)
      VALUES (
        NEW.id, 
        NEW.tenant_id, 
        CASE WHEN NEW.closed_by IS NOT NULL THEN 'human' ELSE 'system' END,
        COALESCE(NEW.closed_by, NEW.assigned_to),
        'status_changed', 
        jsonb_build_object(
          'from', OLD.status, 
          'to', NEW.status, 
          'reason', NEW.closure_reason
        )
      );
    END IF;
    
    -- Log assignment changes
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      INSERT INTO task_events (task_id, tenant_id, actor_type, action, metadata)
      VALUES (
        NEW.id, 
        NEW.tenant_id, 
        'human', 
        'assigned', 
        jsonb_build_object(
          'previous_owner', OLD.assigned_to,
          'new_owner', NEW.assigned_to
        )
      );
    END IF;
    
    -- Log SLA breach
    IF OLD.sla_breached_at IS NULL AND NEW.sla_breached_at IS NOT NULL THEN
      INSERT INTO task_events (task_id, tenant_id, actor_type, action, metadata)
      VALUES (
        NEW.id, 
        NEW.tenant_id, 
        'system', 
        'sla_breached', 
        jsonb_build_object(
          'due_at', NEW.due_at,
          'breached_at', NEW.sla_breached_at
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for task events logging
CREATE TRIGGER tr_log_task_events
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_event();

-- Enable realtime for task_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_events;

-- Add comment for documentation
COMMENT ON TABLE public.task_events IS 'Immutable audit trail for all task lifecycle events';