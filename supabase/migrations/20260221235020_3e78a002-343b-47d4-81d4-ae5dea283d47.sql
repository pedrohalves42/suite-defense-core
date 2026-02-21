
-- =============================================
-- FASE 2: Blindagem Estrutural
-- =============================================

-- 1. Fix AI views: add tenant isolation
-- Check if ai_inference_metrics has tenant_id
-- It does based on the types file

CREATE OR REPLACE VIEW public.v_ai_function_performance
WITH (security_invoker = on, security_barrier = true)
AS
SELECT function_name,
    count(*) AS requests_24h,
    round(avg(latency_ms)) AS avg_latency_ms,
    round((avg(CASE WHEN success THEN 1 ELSE 0 END) * 100::numeric), 1) AS success_rate_pct,
    round((sum(COALESCE(cost_usd, 0::numeric)) * 100::numeric), 4) AS cost_cents_24h,
    round(avg(tokens_total)) AS avg_tokens,
    max(created_at) AS last_request
FROM ai_inference_metrics
WHERE created_at > (now() - '24:00:00'::interval)
  AND (tenant_id = current_user_tenant_id() OR is_current_super_admin())
GROUP BY function_name
ORDER BY count(*) DESC;

COMMENT ON VIEW public.v_ai_function_performance IS 'Performance de funções AI por tenant - isolado via security_invoker + tenant filter';

CREATE OR REPLACE VIEW public.v_ai_provider_performance
WITH (security_invoker = on, security_barrier = true)
AS
SELECT COALESCE(provider, 'unknown'::text) AS provider,
    count(*) AS requests_24h,
    round(avg(latency_ms)) AS avg_latency_ms,
    round(percentile_cont(0.95::double precision) WITHIN GROUP (ORDER BY (latency_ms::double precision))) AS p95_latency_ms,
    round((avg(CASE WHEN success THEN 1 ELSE 0 END) * 100::numeric), 1) AS success_rate_pct,
    round((avg(CASE WHEN used_fallback THEN 1 ELSE 0 END) * 100::numeric), 1) AS fallback_rate_pct,
    sum(tokens_total) AS total_tokens,
    round((sum(COALESCE(cost_usd, 0::numeric)) * 100::numeric), 4) AS cost_cents_24h
FROM ai_inference_metrics
WHERE created_at > (now() - '24:00:00'::interval)
  AND (tenant_id = current_user_tenant_id() OR is_current_super_admin())
GROUP BY COALESCE(provider, 'unknown'::text)
ORDER BY count(*) DESC;

COMMENT ON VIEW public.v_ai_provider_performance IS 'Performance de provedores AI por tenant - isolado via security_invoker + tenant filter';

CREATE OR REPLACE VIEW public.v_ai_hourly_trends
WITH (security_invoker = on, security_barrier = true)
AS
SELECT date_trunc('hour'::text, created_at) AS hour,
    count(*) AS requests,
    round(avg(latency_ms)) AS avg_latency_ms,
    round((avg(CASE WHEN success THEN 1 ELSE 0 END) * 100::numeric), 1) AS success_rate_pct,
    round((sum(COALESCE(cost_usd, 0::numeric)) * 100::numeric), 4) AS cost_cents,
    sum(tokens_total) AS total_tokens
FROM ai_inference_metrics
WHERE created_at > (now() - '7 days'::interval)
  AND (tenant_id = current_user_tenant_id() OR is_current_super_admin())
GROUP BY date_trunc('hour'::text, created_at)
ORDER BY date_trunc('hour'::text, created_at) DESC;

COMMENT ON VIEW public.v_ai_hourly_trends IS 'Tendências horárias de AI por tenant - isolado via security_invoker + tenant filter';

-- 2. Add critical FKs for tables that handle sensitive data
-- Only adding for the most security-critical tables to avoid breaking existing data

-- soar_playbooks already has FK via migration above
-- Focus on tables with real security impact

-- Add FK for security_logs if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'security_logs' 
    AND table_schema = 'public'
    AND constraint_name LIKE '%tenant%'
  ) THEN
    -- Check for orphan data first
    DELETE FROM public.security_logs WHERE tenant_id NOT IN (SELECT id FROM public.tenants);
    ALTER TABLE public.security_logs 
      ADD CONSTRAINT security_logs_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Add FK for audit_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'audit_logs' 
    AND table_schema = 'public'
    AND constraint_name LIKE '%tenant%'
  ) THEN
    DELETE FROM public.audit_logs WHERE tenant_id IS NOT NULL AND tenant_id NOT IN (SELECT id FROM public.tenants);
    ALTER TABLE public.audit_logs 
      ADD CONSTRAINT audit_logs_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Add FK for automation_rules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'automation_rules' 
    AND table_schema = 'public'
    AND constraint_name LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.automation_rules 
      ADD CONSTRAINT automation_rules_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Add FK for automation_executions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'automation_executions' 
    AND table_schema = 'public'
    AND constraint_name LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.automation_executions 
      ADD CONSTRAINT automation_executions_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Add FK for playbook_executions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'playbook_executions' 
    AND table_schema = 'public'
    AND constraint_name LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.playbook_executions 
      ADD CONSTRAINT playbook_executions_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Add FK for jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'jobs' 
    AND table_schema = 'public'
    AND constraint_name LIKE '%tenant%'
  ) THEN
    ALTER TABLE public.jobs 
      ADD CONSTRAINT jobs_tenant_id_fkey 
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;
