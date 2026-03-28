-- ============================================================
-- ANA AUDIT GAPS FIX - 6 PHASES
-- ============================================================

-- ============================================================
-- PHASE 1: Create Missing Tables
-- ============================================================

-- 1.1 Table: ai_rejected_decisions
CREATE TABLE IF NOT EXISTS public.ai_rejected_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES public.ai_insights(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  rejection_reason text NOT NULL,
  input_parameters jsonb,
  confidence_score numeric(5,4),
  rejected_at timestamptz DEFAULT now(),
  rejected_by text DEFAULT 'ai_engine'
);

CREATE INDEX IF NOT EXISTS idx_ai_rejected_tenant ON public.ai_rejected_decisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_rejected_at ON public.ai_rejected_decisions(rejected_at DESC);

ALTER TABLE public.ai_rejected_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their rejected decisions"
  ON public.ai_rejected_decisions FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert rejected decisions"
  ON public.ai_rejected_decisions FOR INSERT
  WITH CHECK (true);

-- 1.2 Table: rls_test_results
CREATE TABLE IF NOT EXISTS public.rls_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id uuid NOT NULL,
  test_name text NOT NULL,
  table_name text,
  passed boolean NOT NULL,
  failure_reason text,
  tested_at timestamptz DEFAULT now(),
  details jsonb
);

CREATE INDEX IF NOT EXISTS idx_rls_test_run ON public.rls_test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_rls_test_passed ON public.rls_test_results(passed);
CREATE INDEX IF NOT EXISTS idx_rls_tested_at ON public.rls_test_results(tested_at DESC);

-- 1.3 Table: audit_integrity_checks
CREATE TABLE IF NOT EXISTS public.audit_integrity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  checked_at timestamptz DEFAULT now(),
  logs_checked int NOT NULL DEFAULT 0,
  chain_valid boolean NOT NULL DEFAULT true,
  breaks_detected int DEFAULT 0,
  first_break_at timestamptz,
  broken_log_id uuid,
  alert_sent boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_integrity_tenant ON public.audit_integrity_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrity_checked_at ON public.audit_integrity_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_integrity_valid ON public.audit_integrity_checks(chain_valid);

ALTER TABLE public.audit_integrity_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their integrity checks"
  ON public.audit_integrity_checks FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert integrity checks"
  ON public.audit_integrity_checks FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- PHASE 2: Correct ai_action_validations
-- ============================================================

ALTER TABLE public.ai_action_validations 
  ADD COLUMN IF NOT EXISTS validated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS validation_passed boolean;

-- Migrate existing data
UPDATE public.ai_action_validations 
SET validated_at = COALESCE(validated_at, created_at),
    validation_passed = COALESCE(validation_passed, validation_result IN ('approved', 'passed', 'valid'))
WHERE validated_at IS NULL OR validation_passed IS NULL;

-- ============================================================
-- PHASE 3: Create Essential Triggers
-- ============================================================

-- 3.1 Audit trigger for ai_actions
CREATE OR REPLACE FUNCTION public.audit_ai_action_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, resource_type, resource_id,
    details, success, state_before, state_after
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    auth.uid(),
    TG_OP || '_ai_action',
    'ai_action',
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object(
      'action_type', COALESCE(NEW.action_type, OLD.action_type),
      'insight_id', COALESCE(NEW.insight_id, OLD.insight_id),
      'status', COALESCE(NEW.status, OLD.status),
      'risk_level', COALESCE(NEW.risk_level, OLD.risk_level)
    ),
    true,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_ai_actions ON public.ai_actions;
CREATE TRIGGER trg_audit_ai_actions
  AFTER INSERT OR UPDATE ON public.ai_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_ai_action_changes();

-- 3.2 Alert trigger for integrity breach
CREATE OR REPLACE FUNCTION public.alert_on_integrity_breach()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT NEW.chain_valid AND NOT COALESCE(NEW.alert_sent, false) THEN
    INSERT INTO public.system_alerts (tenant_id, alert_type, severity, title, message)
    VALUES (
      NEW.tenant_id,
      'audit_integrity_breach',
      'critical',
      'Violacao de Integridade Detectada',
      format('Cadeia de auditoria quebrada. %s logs afetados.', COALESCE(NEW.breaks_detected, 0))
    );
    NEW.alert_sent := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_alert_integrity_breach ON public.audit_integrity_checks;
CREATE TRIGGER trg_alert_integrity_breach
  BEFORE INSERT ON public.audit_integrity_checks
  FOR EACH ROW EXECUTE FUNCTION public.alert_on_integrity_breach();

-- 3.3 Mandatory DLQ review trigger (if failed_jobs_dlq exists)
CREATE OR REPLACE FUNCTION public.enforce_dlq_review_on_age()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent resolution of DLQ items older than 24h without review
  IF NEW.reviewed = true AND OLD.reviewed = false THEN
    IF OLD.created_at < now() - interval '24 hours' THEN
      IF NEW.review_notes IS NULL OR length(trim(NEW.review_notes)) < 10 THEN
        RAISE EXCEPTION 'DLQ_REVIEW_REQUIRED: Items older than 24h require review notes (min 10 chars)'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  
  -- Auto-flag suspicious items
  IF NEW.failure_class IN ('security', 'critical', 'auth_failure') 
     OR COALESCE(NEW.retry_count, 0) > 5 THEN
    NEW.flagged_suspicious := true;
    NEW.auto_flagged_reason := CASE 
      WHEN NEW.failure_class IN ('security', 'critical', 'auth_failure') 
        THEN 'High-risk failure class: ' || NEW.failure_class
      ELSE 'Excessive retries: ' || COALESCE(NEW.retry_count, 0)
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only create trigger if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'failed_jobs_dlq') THEN
    -- Add missing columns if needed
    ALTER TABLE public.failed_jobs_dlq ADD COLUMN IF NOT EXISTS review_required boolean DEFAULT false;
    ALTER TABLE public.failed_jobs_dlq ADD COLUMN IF NOT EXISTS flagged_suspicious boolean DEFAULT false;
    ALTER TABLE public.failed_jobs_dlq ADD COLUMN IF NOT EXISTS auto_flagged_reason text;
    
    DROP TRIGGER IF EXISTS trg_enforce_dlq_review ON public.failed_jobs_dlq;
    CREATE TRIGGER trg_enforce_dlq_review
      BEFORE UPDATE ON public.failed_jobs_dlq
      FOR EACH ROW EXECUTE FUNCTION public.enforce_dlq_review_on_age();
  END IF;
END $$;

-- ============================================================
-- PHASE 4: Create Status Views
-- ============================================================

-- 4.1 View: v_rls_security_status
CREATE OR REPLACE VIEW public.v_rls_security_status 
WITH (security_invoker = true) AS
SELECT 
  test_run_id,
  COUNT(*) as total_tests,
  COUNT(*) FILTER (WHERE passed) as passed,
  COUNT(*) FILTER (WHERE NOT passed) as failed,
  ROUND((COUNT(*) FILTER (WHERE passed)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as pass_rate_pct,
  MAX(tested_at) as run_at
FROM public.rls_test_results
GROUP BY test_run_id
ORDER BY MAX(tested_at) DESC;

-- 4.2 View: v_audit_integrity_status
CREATE OR REPLACE VIEW public.v_audit_integrity_status 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  MAX(checked_at) as last_check,
  bool_and(chain_valid) as all_checks_valid,
  SUM(breaks_detected) as total_breaks,
  COUNT(*) as total_checks,
  CASE 
    WHEN bool_and(chain_valid) THEN 'healthy'
    WHEN SUM(breaks_detected) > 10 THEN 'critical'
    ELSE 'warning'
  END as status
FROM public.audit_integrity_checks
WHERE checked_at > now() - interval '7 days'
GROUP BY tenant_id;

-- ============================================================
-- PHASE 5: Multi-Tenant Isolation Test Function
-- ============================================================

CREATE OR REPLACE FUNCTION public.test_tenant_isolation()
RETURNS TABLE(
  table_name text,
  has_tenant_id boolean,
  has_rls_enabled boolean,
  isolation_valid boolean,
  details text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tablename::text as table_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns c 
      WHERE c.table_schema = 'public' 
        AND c.table_name = t.tablename 
        AND c.column_name = 'tenant_id'
    ) as has_tenant_id,
    t.rowsecurity as has_rls_enabled,
    (
      EXISTS (
        SELECT 1 FROM information_schema.columns c 
        WHERE c.table_schema = 'public' 
          AND c.table_name = t.tablename 
          AND c.column_name = 'tenant_id'
      ) 
      AND t.rowsecurity = true
    ) as isolation_valid,
    CASE 
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns c 
        WHERE c.table_schema = 'public' 
          AND c.table_name = t.tablename 
          AND c.column_name = 'tenant_id'
      ) THEN 'Table lacks tenant_id column'
      WHEN NOT t.rowsecurity THEN 'RLS not enabled'
      ELSE 'Isolation configured correctly'
    END as details
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%'
    AND t.tablename NOT LIKE '_prisma%'
  ORDER BY isolation_valid, t.tablename;
END;
$$;

-- ============================================================
-- PHASE 6: AI Explainability Columns
-- ============================================================

ALTER TABLE public.ai_actions 
  ADD COLUMN IF NOT EXISTS reasoning_summary text,
  ADD COLUMN IF NOT EXISTS evidence_pack jsonb;

ALTER TABLE public.ai_insights 
  ADD COLUMN IF NOT EXISTS reasoning_summary text,
  ADD COLUMN IF NOT EXISTS evidence_pack jsonb;

-- Create index for evidence search
CREATE INDEX IF NOT EXISTS idx_ai_actions_evidence ON public.ai_actions USING gin(evidence_pack);
CREATE INDEX IF NOT EXISTS idx_ai_insights_evidence ON public.ai_insights USING gin(evidence_pack);