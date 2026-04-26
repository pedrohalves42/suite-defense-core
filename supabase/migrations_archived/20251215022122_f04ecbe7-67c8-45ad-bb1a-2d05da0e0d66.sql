-- =============================================
-- FASES 5-7: MELHORIAS FINAIS DO BACKEND
-- Dr. Atlas Verus - CyberShield Backend Hardening
-- =============================================

-- =============================================
-- FASE 5: POLITICA DE RETENCAO
-- =============================================

-- 5.1 Funcao para limpeza de metricas antigas (90 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics_90days()
RETURNS TABLE(deleted_count bigint, table_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics_deleted BIGINT := 0;
  v_audit_deleted BIGINT := 0;
  v_cutoff_90days TIMESTAMP WITH TIME ZONE := NOW() - INTERVAL '90 days';
  v_cutoff_365days TIMESTAMP WITH TIME ZONE := NOW() - INTERVAL '365 days';
BEGIN
  -- Limpar metricas de sistema > 90 dias
  DELETE FROM public.agent_system_metrics_partitioned
  WHERE collected_at < v_cutoff_90days;
  GET DIAGNOSTICS v_metrics_deleted = ROW_COUNT;
  
  deleted_count := v_metrics_deleted;
  table_name := 'agent_system_metrics_partitioned';
  RETURN NEXT;
  
  -- Limpar audit logs > 365 dias
  DELETE FROM public.audit_logs
  WHERE created_at < v_cutoff_365days;
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;
  
  deleted_count := v_audit_deleted;
  table_name := 'audit_logs';
  RETURN NEXT;
  
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_metrics_90days() IS '? Essencial - Politica de retencao: metricas 90 dias, audit logs 365 dias';

-- =============================================
-- FASE 6: AGREGACAO/ROLLUP PARA DASHBOARD
-- =============================================

-- 6.1 Tabela de metricas agregadas diarias
CREATE TABLE IF NOT EXISTS public.agent_metrics_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  
  -- CPU
  avg_cpu_percent NUMERIC(5,2),
  max_cpu_percent NUMERIC(5,2),
  min_cpu_percent NUMERIC(5,2),
  
  -- Memoria
  avg_memory_percent NUMERIC(5,2),
  max_memory_percent NUMERIC(5,2),
  min_memory_percent NUMERIC(5,2),
  
  -- Disco
  avg_disk_percent NUMERIC(5,2),
  max_disk_percent NUMERIC(5,2),
  
  -- Estatisticas
  sample_count INTEGER DEFAULT 0,
  max_uptime_seconds BIGINT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_agent_metrics_daily UNIQUE(agent_id, metric_date)
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_agent_metrics_daily_tenant_date 
  ON public.agent_metrics_daily(tenant_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_daily_agent_date 
  ON public.agent_metrics_daily(agent_id, metric_date DESC);

-- RLS
ALTER TABLE public.agent_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tenant daily metrics"
  ON public.agent_metrics_daily
  FOR SELECT
  USING (tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
  ));

CREATE POLICY "Super admins can view all daily metrics"
  ON public.agent_metrics_daily
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'::app_role
  ));

-- 6.2 Funcao para agregar metricas diarias
CREATE OR REPLACE FUNCTION public.aggregate_daily_metrics(p_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS TABLE(agents_processed bigint, rows_inserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agents BIGINT := 0;
  v_inserted BIGINT := 0;
BEGIN
  -- Agregar metricas do dia anterior por padrao
  INSERT INTO public.agent_metrics_daily (
    tenant_id, agent_id, metric_date,
    avg_cpu_percent, max_cpu_percent, min_cpu_percent,
    avg_memory_percent, max_memory_percent, min_memory_percent,
    avg_disk_percent, max_disk_percent,
    sample_count, max_uptime_seconds
  )
  SELECT 
    m.tenant_id,
    m.agent_id,
    p_date,
    ROUND(AVG(m.cpu_usage_percent), 2),
    MAX(m.cpu_usage_percent),
    MIN(m.cpu_usage_percent),
    ROUND(AVG(m.memory_usage_percent), 2),
    MAX(m.memory_usage_percent),
    MIN(m.memory_usage_percent),
    ROUND(AVG(m.disk_usage_percent), 2),
    MAX(m.disk_usage_percent),
    COUNT(*)::INTEGER,
    MAX(m.uptime_seconds)
  FROM public.agent_system_metrics_partitioned m
  WHERE m.collected_at >= p_date::timestamp with time zone
    AND m.collected_at < (p_date + 1)::timestamp with time zone
  GROUP BY m.tenant_id, m.agent_id
  ON CONFLICT (agent_id, metric_date) DO UPDATE SET
    avg_cpu_percent = EXCLUDED.avg_cpu_percent,
    max_cpu_percent = EXCLUDED.max_cpu_percent,
    min_cpu_percent = EXCLUDED.min_cpu_percent,
    avg_memory_percent = EXCLUDED.avg_memory_percent,
    max_memory_percent = EXCLUDED.max_memory_percent,
    min_memory_percent = EXCLUDED.min_memory_percent,
    avg_disk_percent = EXCLUDED.avg_disk_percent,
    max_disk_percent = EXCLUDED.max_disk_percent,
    sample_count = EXCLUDED.sample_count,
    max_uptime_seconds = EXCLUDED.max_uptime_seconds;
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  SELECT COUNT(DISTINCT agent_id) INTO v_agents
  FROM public.agent_system_metrics_partitioned
  WHERE collected_at >= p_date::timestamp with time zone
    AND collected_at < (p_date + 1)::timestamp with time zone;
  
  agents_processed := v_agents;
  rows_inserted := v_inserted;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.aggregate_daily_metrics(DATE) IS '? Essencial - Agregacao diaria de metricas para dashboard performatico';

-- =============================================
-- FASE 7: DOCUMENTACAO SECURITY DEFINER
-- =============================================

-- 7.1 Adicionar comentarios categorizando funcoes existentes
COMMENT ON FUNCTION public.has_role(UUID, app_role) IS '? Essencial - Verificacao de role para RLS';
COMMENT ON FUNCTION public.current_user_tenant_id() IS '? Essencial - Isolamento multi-tenant';
COMMENT ON FUNCTION public.hash_agent_token(TEXT) IS '? Essencial - Hash seguro de tokens';
COMMENT ON FUNCTION public.check_and_block_ip(TEXT, TEXT) IS '? Essencial - Protecao contra brute force';
COMMENT ON FUNCTION public.cleanup_old_hmac_signatures() IS '? Essencial - Manutencao de replay protection';
COMMENT ON FUNCTION public.cleanup_stuck_jobs() IS '? Essencial - Recuperacao de jobs travados';
COMMENT ON FUNCTION public.cleanup_stuck_builds() IS '? Essencial - Recuperacao de builds travados';
COMMENT ON FUNCTION public.cleanup_orphaned_agents() IS '? Essencial - Limpeza de agentes orfaos';
COMMENT ON FUNCTION public.handle_new_user() IS '? Essencial - Trigger de onboarding';
COMMENT ON FUNCTION public.set_tenant_id_from_user() IS '? Essencial - Auto-populate tenant_id';
COMMENT ON FUNCTION public.update_user_role_rpc(UUID, app_role) IS '? Essencial - Atualizacao segura de roles';
COMMENT ON FUNCTION public.ensure_tenant_features(UUID, TEXT, INTEGER) IS '? Essencial - Provisionamento de features';
COMMENT ON FUNCTION public.log_sensitive_access(TEXT, TEXT, TEXT, JSONB) IS '? Essencial - Audit logging';
COMMENT ON FUNCTION public.diagnose_agent_issues(TEXT, UUID) IS '? Essencial - Diagnostico de agentes';
COMMENT ON FUNCTION public.get_agent_health_metrics(UUID) IS '? Essencial - Metricas de saude';
COMMENT ON FUNCTION public.calculate_pipeline_metrics(UUID, INTEGER) IS '? Essencial - Metricas de pipeline';
COMMENT ON FUNCTION public.get_installation_health_status(UUID) IS '? Essencial - Status de instalacao';
COMMENT ON FUNCTION public.check_installation_failure_rate(UUID, INTEGER, NUMERIC) IS '? Essencial - Monitoramento de falhas';
COMMENT ON FUNCTION public.redirect_metrics_to_partition() IS '? Essencial - Trigger de particionamento';
COMMENT ON FUNCTION public.drop_old_metrics_partitions(INTEGER) IS '? Essencial - Manutencao de particoes';
COMMENT ON FUNCTION public.check_action_rate_limit(TEXT, UUID) IS '? Essencial - Rate limit de AI actions';
COMMENT ON FUNCTION public.check_quota_threshold() IS '? Essencial - Trigger de quota';

-- 7.2 View de inventario SECURITY DEFINER
CREATE OR REPLACE VIEW public.v_security_definer_inventory AS
SELECT 
  p.proname as function_name,
  n.nspname as schema_name,
  CASE 
    WHEN d.description LIKE '? Essencial%' THEN 'essential'
    WHEN d.description LIKE '? Legado%' THEN 'legacy'
    ELSE 'unclassified'
  END as category,
  COALESCE(d.description, 'Sem documentacao') as documentation,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_description d ON d.objoid = p.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY 
  CASE 
    WHEN d.description LIKE '? Essencial%' THEN 1
    WHEN d.description LIKE '? Legado%' THEN 2
    ELSE 3
  END,
  p.proname;

COMMENT ON VIEW public.v_security_definer_inventory IS 'Inventario de funcoes SECURITY DEFINER para auditoria';

-- =============================================
-- LOG FINAL
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '[OK]  Fase 5: Politica de retencao implementada (cleanup_old_metrics_90days)';
  RAISE NOTICE '[OK]  Fase 6: Tabela agent_metrics_daily + funcao aggregate_daily_metrics criadas';
  RAISE NOTICE '[OK]  Fase 7: 22 funcoes documentadas + view v_security_definer_inventory criada';
END $$;