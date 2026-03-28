-- ============================================
-- GOVERNANCE FINAL GAPS - Part 1 (Gap 1 & 2)
-- ============================================

-- ============================================
-- GAP 1: Kill Switch Global Multi-Nivel
-- ============================================

-- 1.1 Expand system_kill_switch with explicit modes
ALTER TABLE public.system_kill_switch 
ADD COLUMN IF NOT EXISTS mode text DEFAULT 'normal' CHECK (mode IN ('normal', 'restricted', 'emergency_stop'));

-- 1.2 Create global state table (cross-tenant emergency control)
CREATE TABLE IF NOT EXISTS public.system_global_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('normal', 'restricted', 'emergency_stop')),
  reason text NOT NULL,
  triggered_by uuid NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  acknowledged_by uuid[] DEFAULT '{}'
);

ALTER TABLE public.system_global_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read global state" ON public.system_global_state
FOR SELECT TO authenticated USING (true);

-- 1.3 Global assertion function
CREATE OR REPLACE FUNCTION public.assert_system_not_stopped()
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.system_global_state
    WHERE mode = 'emergency_stop'
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY triggered_at DESC
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'SYSTEM HALTED BY GLOBAL KILL SWITCH';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.4 Function to get current system mode
CREATE OR REPLACE FUNCTION public.get_system_mode()
RETURNS jsonb AS $$
DECLARE
  global_state RECORD;
  result jsonb;
BEGIN
  SELECT * INTO global_state
  FROM public.system_global_state
  WHERE (expires_at IS NULL OR expires_at > now())
  ORDER BY triggered_at DESC
  LIMIT 1;
  
  IF global_state IS NULL THEN
    result := jsonb_build_object(
      'mode', 'normal',
      'triggered_at', null,
      'reason', null,
      'triggered_by', null
    );
  ELSE
    result := jsonb_build_object(
      'mode', global_state.mode,
      'triggered_at', global_state.triggered_at,
      'reason', global_state.reason,
      'triggered_by', global_state.triggered_by,
      'expires_at', global_state.expires_at
    );
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- GAP 2: Task Debt Explicito (accepted_risk)
-- ============================================

-- 2.1 Add accepted_risk status
ALTER TABLE public.tasks 
DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks 
ADD CONSTRAINT tasks_status_check 
CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'ignored', 'accepted_risk'));

-- 2.2 Add risk tracking columns
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS risk_accepted_by uuid,
ADD COLUMN IF NOT EXISTS risk_accepted_at timestamptz,
ADD COLUMN IF NOT EXISTS risk_expiry_at timestamptz,
ADD COLUMN IF NOT EXISTS risk_justification text;

-- 2.3 Trigger to create re-evaluation tasks when risk expires
CREATE OR REPLACE FUNCTION public.check_expired_risks()
RETURNS void AS $$
DECLARE
  expired_task RECORD;
BEGIN
  FOR expired_task IN
    SELECT * FROM public.tasks
    WHERE status = 'accepted_risk'
      AND risk_expiry_at IS NOT NULL
      AND risk_expiry_at <= now()
  LOOP
    INSERT INTO public.tasks (
      tenant_id, source_type, source_id, title, description, severity, 
      status, requires_human_review, auto_generated
    ) VALUES (
      expired_task.tenant_id,
      'manual',
      expired_task.id::text,
      'Reavaliacao de Risco: ' || expired_task.title,
      'O risco aceito para "' || expired_task.title || '" expirou e precisa ser reavaliado.',
      expired_task.severity,
      'open',
      true,
      true
    );
    
    INSERT INTO public.task_events (task_id, tenant_id, actor_type, action, metadata)
    VALUES (
      expired_task.id, 
      expired_task.tenant_id, 
      'system', 
      'risk_expired', 
      jsonb_build_object('expiry_at', expired_task.risk_expiry_at)
    );
    
    UPDATE public.tasks 
    SET status = 'open', updated_at = now()
    WHERE id = expired_task.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2.4 View for active risk debt
CREATE OR REPLACE VIEW public.v_active_risk_debt
WITH (security_invoker = on) AS
SELECT 
  t.id,
  t.tenant_id,
  t.title,
  t.description,
  t.severity,
  t.risk_accepted_by,
  t.risk_accepted_at,
  t.risk_expiry_at,
  t.risk_justification,
  EXTRACT(EPOCH FROM (t.risk_expiry_at - now()))/86400 as days_until_expiry,
  CASE 
    WHEN t.risk_expiry_at <= now() + interval '7 days' THEN 'expiring_soon'
    ELSE 'active'
  END as risk_status
FROM public.tasks t
WHERE t.status = 'accepted_risk'
  AND (t.risk_expiry_at IS NULL OR t.risk_expiry_at > now());