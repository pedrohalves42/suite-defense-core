-- ============================================
-- ADR-028: Full Remediation P0-P3
-- Dr. Vellum Audit Fixes
-- ============================================

-- ============================================
-- P0-01: CRIT-01 - Drop Vulnerable RPC
-- ============================================
-- Drop the version with app_role parameter that uses LIMIT 1 without tenant filter
DROP FUNCTION IF EXISTS public.update_user_role_rpc(uuid, app_role);

-- ============================================
-- P0-03: CRIT-03 - Auto-set tenant_id Trigger
-- ============================================
-- Create trigger function to auto-populate tenant_id from JWT claim
CREATE OR REPLACE FUNCTION public.auto_set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_active_tenant_id();
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_id cannot be NULL and no active tenant found in JWT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

COMMENT ON FUNCTION public.auto_set_tenant_id() IS 
  'ADR-028 P0-03: Auto-populates tenant_id from JWT claim if not provided';

-- Apply trigger to critical tables that allow NULL tenant_id
DO $$
DECLARE
  tables_to_fix TEXT[] := ARRAY[
    'failed_login_attempts',
    'security_logs'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_fix LOOP
    -- Check if trigger already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'trg_auto_set_tenant_id_' || t
    ) THEN
      EXECUTE format('
        CREATE TRIGGER trg_auto_set_tenant_id_%I
        BEFORE INSERT ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id()
      ', t, t);
      RAISE NOTICE 'Created auto_set_tenant_id trigger for %', t;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- P1-01: HIGH-02 - Add RLS to 7 Tables
-- ============================================
-- Enable RLS and create tenant isolation policies for tables missing them

-- blocked_access_attempts
ALTER TABLE IF EXISTS public.blocked_access_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_blocked_access_attempts" ON public.blocked_access_attempts;
CREATE POLICY "tenant_isolation_blocked_access_attempts" ON public.blocked_access_attempts
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- ai_rejected_decisions
ALTER TABLE IF EXISTS public.ai_rejected_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_ai_rejected_decisions" ON public.ai_rejected_decisions;
CREATE POLICY "tenant_isolation_ai_rejected_decisions" ON public.ai_rejected_decisions
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- audit_integrity_checks
ALTER TABLE IF EXISTS public.audit_integrity_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_audit_integrity_checks" ON public.audit_integrity_checks;
CREATE POLICY "tenant_isolation_audit_integrity_checks" ON public.audit_integrity_checks
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- decision_events
ALTER TABLE IF EXISTS public.decision_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_decision_events" ON public.decision_events;
CREATE POLICY "tenant_isolation_decision_events" ON public.decision_events
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- edge_function_metrics
ALTER TABLE IF EXISTS public.edge_function_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_edge_function_metrics" ON public.edge_function_metrics;
CREATE POLICY "tenant_isolation_edge_function_metrics" ON public.edge_function_metrics
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- onboarding_progress
ALTER TABLE IF EXISTS public.onboarding_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_onboarding_progress" ON public.onboarding_progress;
CREATE POLICY "tenant_isolation_onboarding_progress" ON public.onboarding_progress
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- sales_pipeline
ALTER TABLE IF EXISTS public.sales_pipeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_sales_pipeline" ON public.sales_pipeline;
CREATE POLICY "tenant_isolation_sales_pipeline" ON public.sales_pipeline
FOR ALL TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- ============================================
-- P3-01: LOW-01 - Rate-limit Logs in get_active_tenant_id
-- ============================================
-- Recreate function with sampling for NULL claim logs (1% sample)
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_claim text;
BEGIN
  -- Get claim from JWT
  v_claim := current_setting('request.jwt.claims', true)::json->>'active_tenant_id';
  
  IF v_claim IS NOT NULL AND v_claim != '' THEN
    v_tenant_id := v_claim::uuid;
  ELSE
    -- P3-01: Sample 1% of NULL claim logs to avoid log saturation
    IF random() < 0.01 THEN
      RAISE LOG '[get_active_tenant_id] No active_tenant_id claim in JWT (sampled 1%%)';
    END IF;
    v_tenant_id := NULL;
  END IF;
  
  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.get_active_tenant_id() IS 
  'ADR-028 P3-01: Returns active tenant from JWT with sampled logging for NULL claims';

-- ============================================
-- P3-03: LOW-03 - Performance Indexes
-- ============================================
-- Add composite indexes for common tenant + time queries
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_tenant_created 
ON public.failed_login_attempts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_logs_tenant_created 
ON public.security_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocked_access_attempts_tenant_attempted 
ON public.blocked_access_attempts (tenant_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created 
ON public.audit_logs (tenant_id, created_at DESC);

-- ============================================
-- Migration Complete
-- ============================================
COMMENT ON SCHEMA public IS 'ADR-028: Full P0-P3 remediation applied';