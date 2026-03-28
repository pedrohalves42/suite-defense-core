-- ============================================
-- P2: Edge Function Latency Metrics + System Operations
-- ============================================

-- 1. Tabela para metricas de latencia de Edge Functions
CREATE TABLE IF NOT EXISTS public.edge_function_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  status_code INTEGER,
  error_message TEXT,
  tenant_id UUID REFERENCES public.tenants(id),
  request_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para queries de performance
CREATE INDEX IF NOT EXISTS idx_efm_function_created 
  ON public.edge_function_metrics(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efm_tenant_created 
  ON public.edge_function_metrics(tenant_id, created_at DESC) 
  WHERE tenant_id IS NOT NULL;

-- RLS
ALTER TABLE public.edge_function_metrics ENABLE ROW LEVEL SECURITY;

-- Super admins podem ver todas as metricas
CREATE POLICY "super_admins_view_all_efm" ON public.edge_function_metrics
  FOR SELECT USING (is_super_admin(auth.uid()));

-- Service role pode inserir
CREATE POLICY "service_role_insert_efm" ON public.edge_function_metrics
  FOR INSERT WITH CHECK (true);

-- 2. View para estatisticas agregadas de Edge Functions
CREATE OR REPLACE VIEW public.v_edge_function_stats WITH (security_invoker=on) AS
SELECT 
  function_name,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE success = true) as successful_calls,
  COUNT(*) FILTER (WHERE success = false) as failed_calls,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency_ms,
  MIN(latency_ms) as min_latency_ms,
  MAX(latency_ms) as max_latency_ms,
  MIN(created_at) as first_call,
  MAX(created_at) as last_call
FROM public.edge_function_metrics
WHERE created_at > now() - interval '24 hours'
GROUP BY function_name
ORDER BY total_calls DESC;

-- 3. View para jobs orfaos/travados
CREATE OR REPLACE VIEW public.v_stuck_jobs_report WITH (security_invoker=on) AS
SELECT 
  j.id,
  j.agent_name,
  j.type,
  j.status,
  j.tenant_id,
  j.created_at,
  j.delivered_at,
  EXTRACT(EPOCH FROM (now() - COALESCE(j.delivered_at, j.created_at))) / 60 as minutes_stuck,
  CASE 
    WHEN j.status = 'delivered' AND j.delivered_at < now() - interval '30 minutes' THEN 'stuck_delivered'
    WHEN j.status = 'queued' AND j.created_at < now() - interval '2 hours' THEN 'stuck_queued'
    WHEN j.status = 'pending' AND j.created_at < now() - interval '1 hour' THEN 'stuck_pending'
    ELSE 'normal'
  END as problem_type
FROM public.jobs j
WHERE 
  j.tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid())
  AND (
    (j.status = 'delivered' AND j.delivered_at < now() - interval '30 minutes')
    OR (j.status = 'queued' AND j.created_at < now() - interval '2 hours')
    OR (j.status = 'pending' AND j.created_at < now() - interval '1 hour')
  );

-- 4. View para resumo operacional do sistema
CREATE OR REPLACE VIEW public.v_system_operations_summary WITH (security_invoker=on) AS
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  -- Agents
  (SELECT COUNT(*) FROM agents WHERE tenant_id = t.id) as total_agents,
  (SELECT COUNT(*) FROM agents WHERE tenant_id = t.id AND last_heartbeat > now() - interval '5 minutes') as online_agents,
  (SELECT COUNT(*) FROM agents WHERE tenant_id = t.id AND (last_heartbeat IS NULL OR last_heartbeat < now() - interval '30 minutes')) as offline_agents,
  -- Jobs ultimas 24h
  (SELECT COUNT(*) FROM jobs WHERE tenant_id = t.id AND created_at > now() - interval '24 hours') as jobs_24h,
  (SELECT COUNT(*) FROM jobs WHERE tenant_id = t.id AND status = 'completed' AND created_at > now() - interval '24 hours') as jobs_completed_24h,
  (SELECT COUNT(*) FROM jobs WHERE tenant_id = t.id AND status = 'failed' AND created_at > now() - interval '24 hours') as jobs_failed_24h,
  -- Jobs problematicos
  (SELECT COUNT(*) FROM jobs WHERE tenant_id = t.id AND status = 'delivered' AND delivered_at < now() - interval '30 minutes') as stuck_jobs,
  -- Alertas ativos
  (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = t.id AND resolved = false) as active_alerts,
  -- Quotas
  (SELECT COUNT(*) FROM tenant_features WHERE tenant_id = t.id AND quota_limit IS NOT NULL AND quota_used >= quota_limit * 0.8) as quota_warnings
FROM tenants t
WHERE t.id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid());

-- 5. Funcao para limpar dados antigos (chamada pelo pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_old_data_scheduled()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
BEGIN
  -- Limpar HMAC signatures antigas (>6 horas)
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  -- Limpar rate limits antigos (>30 minutos)
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  -- Limpar failed login attempts antigos (>24 horas)
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  -- Limpar edge function metrics antigas (>7 dias)
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- Limpar jobs completed/failed antigos (>30 dias)
  DELETE FROM public.jobs 
  WHERE status IN ('completed', 'failed') 
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'hmac_deleted', v_hmac_deleted,
    'rate_limits_deleted', v_rate_limits_deleted,
    'failed_logins_deleted', v_failed_logins_deleted,
    'edge_function_metrics_deleted', v_efm_deleted,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
END;
$function$;