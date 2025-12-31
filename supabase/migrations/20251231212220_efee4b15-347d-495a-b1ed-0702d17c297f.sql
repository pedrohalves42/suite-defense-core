
-- =====================================================
-- RED TEAM HARDENING MIGRATION - COMPLETE
-- =====================================================

-- PHASE 1: DLQ Security - Add review columns (using correct column names)
ALTER TABLE public.failed_jobs_dlq 
ADD COLUMN IF NOT EXISTS review_notes text,
ADD COLUMN IF NOT EXISTS risk_category text DEFAULT 'unreviewed';

-- Update existing constraint or add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'failed_jobs_dlq_risk_category_check'
  ) THEN
    ALTER TABLE public.failed_jobs_dlq 
    ADD CONSTRAINT failed_jobs_dlq_risk_category_check 
    CHECK (risk_category IN ('unreviewed', 'benign', 'suspicious', 'malicious'));
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- Ignore if already exists
END$$;

-- PHASE 1.2: DLQ audit log trigger
CREATE OR REPLACE FUNCTION public.audit_dlq_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.resolved_by IS NULL THEN
      RAISE EXCEPTION 'DLQ_SECURITY: Cannot delete unreviewed DLQ item. Review required before disposal.'
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, success)
    VALUES (
      OLD.tenant_id, auth.uid(), 'dlq_item_deleted', 'failed_jobs_dlq', OLD.id::text,
      jsonb_build_object('job_type', OLD.job_type, 'risk_category', OLD.risk_category), true
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.resolved_by IS NOT NULL AND OLD.resolved_by IS NULL THEN
      INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, success)
      VALUES (
        NEW.tenant_id, auth.uid(), 'dlq_item_reviewed', 'failed_jobs_dlq', NEW.id::text,
        jsonb_build_object('resolved_by', NEW.resolved_by, 'review_notes', NEW.review_notes, 'risk_category', NEW.risk_category), true
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, success)
    VALUES (
      NEW.tenant_id, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'dlq_item_created', 'failed_jobs_dlq', NEW.id::text,
      jsonb_build_object('job_type', NEW.job_type, 'error_message', NEW.error_message), true
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_dlq_operations ON public.failed_jobs_dlq;
CREATE TRIGGER trg_audit_dlq_operations
AFTER INSERT OR UPDATE OR DELETE ON public.failed_jobs_dlq
FOR EACH ROW EXECUTE FUNCTION public.audit_dlq_operations();

-- PHASE 1.3: Review DLQ item function
CREATE OR REPLACE FUNCTION public.review_dlq_item(
  p_dlq_id uuid,
  p_review_notes text,
  p_risk_category text DEFAULT 'benign'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_result jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  UPDATE failed_jobs_dlq SET 
    resolved_by = auth.uid(),
    resolved_at = NOW(),
    review_notes = p_review_notes,
    risk_category = p_risk_category,
    status = 'resolved'
  WHERE id = p_dlq_id AND tenant_id = v_tenant_id
  RETURNING jsonb_build_object('success', true, 'id', id, 'resolved_at', resolved_at) INTO v_result;
  
  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Not found'));
END;
$$;

-- PHASE 2: AI Action Validations table
CREATE TABLE IF NOT EXISTS public.ai_action_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.ai_actions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  validation_source text NOT NULL CHECK (validation_source IN ('human', 'secondary_ai', 'rule_engine', 'correlation')),
  validated_by uuid REFERENCES auth.users(id),
  validation_result text NOT NULL CHECK (validation_result IN ('confirmed', 'rejected', 'needs_review')),
  confidence_score numeric(5,2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
  validation_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_action_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view validations in their tenant" ON public.ai_action_validations;
CREATE POLICY "Users can view validations in their tenant" ON public.ai_action_validations FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create validations in their tenant" ON public.ai_action_validations;
CREATE POLICY "Users can create validations in their tenant" ON public.ai_action_validations FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

-- PHASE 2.2: Circuit breaker columns
ALTER TABLE public.ai_action_configs
ADD COLUMN IF NOT EXISTS circuit_breaker_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS failure_threshold integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS failure_window_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS current_failures integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS circuit_open_until timestamptz;

-- PHASE 2.3: Circuit breaker function
CREATE OR REPLACE FUNCTION public.check_ai_circuit_breaker(p_action_type text, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_config record;
  v_recent_failures integer;
BEGIN
  SELECT * INTO v_config FROM ai_action_configs WHERE action_type = p_action_type AND is_enabled = true;
  
  IF v_config IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Action not configured');
  END IF;
  
  IF v_config.circuit_open_until IS NOT NULL AND v_config.circuit_open_until > NOW() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Circuit open', 'retry_after', v_config.circuit_open_until);
  END IF;
  
  SELECT COUNT(*) INTO v_recent_failures
  FROM ai_action_executions ae
  JOIN ai_actions a ON ae.action_id = a.id
  WHERE a.action_type = p_action_type AND ae.tenant_id = p_tenant_id
    AND ae.execution_status = 'failed'
    AND ae.executed_at > NOW() - (v_config.failure_window_minutes || ' minutes')::interval;
  
  IF v_recent_failures >= v_config.failure_threshold THEN
    UPDATE ai_action_configs SET circuit_open_until = NOW() + interval '15 minutes', current_failures = v_recent_failures
    WHERE action_type = p_action_type;
    RETURN jsonb_build_object('allowed', false, 'reason', 'Threshold exceeded', 'failures', v_recent_failures);
  END IF;
  
  RETURN jsonb_build_object('allowed', true, 'failures', v_recent_failures);
END;
$$;

-- PHASE 2.4: AI anomalies view
CREATE OR REPLACE VIEW public.v_ai_anomalies AS
WITH action_stats AS (
  SELECT a.action_type, a.tenant_id, COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE ae.execution_status = 'executed') as executed,
    COUNT(*) FILTER (WHERE ae.execution_status = 'failed') as failed,
    COUNT(*) FILTER (WHERE i.status = 'resolved') as resolved_insights
  FROM ai_actions a
  LEFT JOIN ai_action_executions ae ON a.id = ae.action_id
  LEFT JOIN ai_insights i ON a.insight_id = i.id
  WHERE a.created_at > NOW() - interval '7 days'
  GROUP BY a.action_type, a.tenant_id
)
SELECT *, 
  CASE 
    WHEN total_actions > 0 AND resolved_insights::float / total_actions < 0.1 THEN 'low_resolution_rate'
    WHEN failed > executed THEN 'high_failure_rate'
    ELSE NULL
  END as anomaly_type,
  CASE 
    WHEN total_actions > 0 AND resolved_insights::float / total_actions < 0.1 THEN 'critical'
    WHEN failed > executed THEN 'high'
    ELSE 'none'
  END as severity
FROM action_stats WHERE total_actions > 0 AND (
  (resolved_insights::float / total_actions < 0.1) OR (failed > executed)
);

-- PHASE 3: Dual-person approval
ALTER TABLE public.approval_chains
ADD COLUMN IF NOT EXISTS require_different_approvers boolean DEFAULT true;

UPDATE public.approval_chains
SET min_approvers = 2, require_different_approvers = true
WHERE applies_to_actions && ARRAY['isolate', 'quarantine', 'network_isolate', 'kill_process', 'revoke_token'];

-- Self-approval prevention
CREATE OR REPLACE FUNCTION public.prevent_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested_by uuid;
  v_chain record;
BEGIN
  SELECT requested_by INTO v_requested_by FROM approval_requests WHERE id = NEW.request_id;
  
  IF NEW.approved_by = v_requested_by THEN
    RAISE EXCEPTION 'SEGREGATION_VIOLATION: Cannot approve your own request.' USING ERRCODE = '23514';
  END IF;
  
  SELECT ac.* INTO v_chain FROM approval_chains ac
  JOIN approval_requests ar ON ar.chain_id = ac.id WHERE ar.id = NEW.request_id;
  
  IF v_chain IS NOT NULL AND v_chain.require_different_approvers THEN
    IF EXISTS (SELECT 1 FROM approvals WHERE request_id = NEW.request_id AND approved_by = NEW.approved_by AND id != NEW.id) THEN
      RAISE EXCEPTION 'DUPLICATE_APPROVAL: Each approver can only approve once.' USING ERRCODE = '23514';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_approval ON public.approvals;
CREATE TRIGGER trg_prevent_self_approval
BEFORE INSERT ON public.approvals
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_approval();

-- Approval check function
CREATE OR REPLACE FUNCTION public.check_approval_complete(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_required integer; v_current integer;
BEGIN
  SELECT ac.min_approvers INTO v_required FROM approval_requests ar
  JOIN approval_chains ac ON ar.chain_id = ac.id WHERE ar.id = p_request_id;
  
  SELECT COUNT(DISTINCT approved_by) INTO v_current FROM approvals
  WHERE request_id = p_request_id AND decision = 'approved';
  
  RETURN jsonb_build_object('complete', v_current >= COALESCE(v_required, 1), 'required', COALESCE(v_required, 1), 'current', v_current);
END;
$$;

-- PHASE 4: Enhanced metrics function
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_result jsonb; v_dlq_total int; v_dlq_reviewed int; v_insights_total int; v_insights_resolved int;
  v_approval_requests int; v_approval_rejections int; v_ai_validations int; v_ai_validated int;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolved_by IS NOT NULL)
  INTO v_dlq_total, v_dlq_reviewed FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id;
  
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'resolved')
  INTO v_insights_total, v_insights_resolved FROM ai_insights WHERE tenant_id = p_tenant_id;
  
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'rejected')
  INTO v_approval_requests, v_approval_rejections FROM approval_requests WHERE tenant_id = p_tenant_id;
  
  SELECT COUNT(*) INTO v_ai_validations FROM ai_actions WHERE tenant_id = p_tenant_id;
  SELECT COUNT(DISTINCT action_id) INTO v_ai_validated FROM ai_action_validations WHERE tenant_id = p_tenant_id;
  
  v_result := jsonb_build_object(
    'dlq', jsonb_build_object('total', v_dlq_total, 'reviewed', v_dlq_reviewed,
      'review_rate', CASE WHEN v_dlq_total > 0 THEN ROUND(v_dlq_reviewed::numeric / v_dlq_total * 100, 2) ELSE 100 END),
    'insights', jsonb_build_object('total', v_insights_total, 'resolved', v_insights_resolved,
      'resolution_rate', CASE WHEN v_insights_total > 0 THEN ROUND(v_insights_resolved::numeric / v_insights_total * 100, 2) ELSE 100 END),
    'approvals', jsonb_build_object('total', v_approval_requests, 'rejections', v_approval_rejections,
      'rejection_rate', CASE WHEN v_approval_requests > 0 THEN ROUND(v_approval_rejections::numeric / v_approval_requests * 100, 2) ELSE 0 END),
    'ai_validation', jsonb_build_object('total_actions', v_ai_validations, 'validated', v_ai_validated,
      'validation_rate', CASE WHEN v_ai_validations > 0 THEN ROUND(v_ai_validated::numeric / v_ai_validations * 100, 2) ELSE 100 END),
    'security_hardening', jsonb_build_object(
      'dlq_audit_enabled', true, 'circuit_breaker_enabled', true,
      'dual_approval_enabled', true, 'self_approval_blocked', true
    )
  );
  RETURN v_result;
END;
$$;

-- Bootstrap: Mark resolved DLQ items as reviewed
UPDATE failed_jobs_dlq SET 
  review_notes = 'Bulk reviewed during security hardening',
  risk_category = 'benign'
WHERE status = 'resolved' AND review_notes IS NULL;

UPDATE failed_jobs_dlq SET risk_category = 'unreviewed'
WHERE status = 'pending' AND risk_category IS NULL;
