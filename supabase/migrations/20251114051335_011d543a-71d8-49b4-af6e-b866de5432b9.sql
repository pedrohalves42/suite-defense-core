-- FASE 3: Schema de Telemetria com Idempotência e Views Consolidadas (FINAL)

-- ============================================================================
-- 1. ADICIONAR COLUNA telemetry_hash PARA IDEMPOTÊNCIA
-- ============================================================================

ALTER TABLE public.installation_analytics
ADD COLUMN IF NOT EXISTS telemetry_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_installation_analytics_telemetry_hash 
ON public.installation_analytics(telemetry_hash);

CREATE INDEX IF NOT EXISTS idx_installation_analytics_metrics 
ON public.installation_analytics(tenant_id, event_type, created_at DESC);

-- ============================================================================
-- 2. FUNÇÃO E TRIGGER PARA GERAR HASH AUTOMÁTICO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_telemetry_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.telemetry_hash := encode(
    digest(
      COALESCE(NEW.agent_id::text, '') || 
      COALESCE(NEW.agent_name, 'unknown') || 
      NEW.event_type || 
      date_trunc('minute', NEW.created_at)::text ||
      COALESCE(NEW.platform, 'unknown'),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS set_telemetry_hash ON public.installation_analytics;
CREATE TRIGGER set_telemetry_hash
BEFORE INSERT ON public.installation_analytics
FOR EACH ROW
EXECUTE FUNCTION public.generate_telemetry_hash();

-- ============================================================================
-- 3. VIEW: MÉTRICAS DE INSTALAÇÃO POR DIA
-- ============================================================================

CREATE OR REPLACE VIEW public.agent_installation_metrics AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  tenant_id,
  platform,
  
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE success = true) as successful_installs,
  COUNT(*) FILTER (WHERE success = false) as failed_installs,
  COUNT(*) FILTER (WHERE success IS NULL) as unknown_status,
  
  CASE 
    WHEN COUNT(*) > 0 THEN 
      ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / COUNT(*)::numeric) * 100, 1)
    ELSE 0
  END as success_rate_pct,
  
  ROUND(AVG(installation_time_seconds) FILTER (WHERE installation_time_seconds > 0 AND installation_time_seconds < 3600), 1) as avg_install_time_sec,
  ROUND(MIN(installation_time_seconds) FILTER (WHERE installation_time_seconds > 0), 1) as min_install_time_sec,
  ROUND(MAX(installation_time_seconds) FILTER (WHERE installation_time_seconds > 0 AND installation_time_seconds < 3600), 1) as max_install_time_sec,
  
  COUNT(*) FILTER (WHERE platform = 'windows') as windows_count,
  COUNT(*) FILTER (WHERE platform = 'linux') as linux_count,
  
  COUNT(*) FILTER (WHERE network_connectivity = true) as network_ok,
  COUNT(*) FILTER (WHERE network_connectivity = false) as network_failed,
  COUNT(*) FILTER (WHERE network_connectivity IS NULL) as network_unknown,
  
  COUNT(*) FILTER (WHERE metadata->>'verified' = 'true') as verified_count,
  COUNT(*) FILTER (WHERE metadata->>'verified' = 'false') as unverified_count,
  
  COUNT(*) FILTER (WHERE event_type = 'post_installation') as verified_events,
  COUNT(*) FILTER (WHERE event_type = 'post_installation_unverified') as unverified_events,
  
  COUNT(*) FILTER (WHERE installation_method = 'windows_ps1') as windows_ps1_installs,
  COUNT(*) FILTER (WHERE installation_method = 'linux_bash') as linux_bash_installs
  
FROM public.installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
GROUP BY DATE_TRUNC('day', created_at), tenant_id, platform
ORDER BY date DESC, tenant_id;

-- ============================================================================
-- 4. VIEW: RESUMO DE ERROS MAIS COMUNS (SIMPLIFICADO)
-- ============================================================================

CREATE OR REPLACE VIEW public.installation_error_summary AS
WITH error_stats AS (
  SELECT 
    tenant_id,
    platform,
    error_message,
    COUNT(*) as occurrence_count,
    MAX(created_at) as last_seen,
    MIN(created_at) as first_seen,
    COUNT(DISTINCT agent_name) as unique_agents_affected,
    ARRAY_AGG(DISTINCT agent_name) FILTER (WHERE agent_name IS NOT NULL) as all_affected_agents
  FROM public.installation_analytics
  WHERE success = false 
    AND error_message IS NOT NULL
    AND created_at > NOW() - INTERVAL '90 days'
  GROUP BY tenant_id, platform, error_message
)
SELECT 
  tenant_id,
  platform,
  error_message,
  occurrence_count,
  ROUND(
    (occurrence_count::numeric / 
     NULLIF((SELECT COUNT(*) FROM public.installation_analytics WHERE success = false AND created_at > NOW() - INTERVAL '90 days'), 0)::numeric
    ) * 100, 
    1
  ) as percentage_of_failures,
  last_seen,
  first_seen,
  all_affected_agents[1:10] as affected_agents_sample,
  unique_agents_affected
FROM error_stats
ORDER BY occurrence_count DESC
LIMIT 100;

-- ============================================================================
-- 5. VIEW: STATUS DE SAÚDE (ÚLTIMAS 24H)
-- ============================================================================

CREATE OR REPLACE VIEW public.installation_health_status AS
SELECT 
  tenant_id,
  
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as attempts_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND success = true) as success_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND success = false) as failed_24h,
  
  CASE 
    WHEN COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') > 0 THEN
      ROUND(
        (COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND success = false)::numeric / 
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::numeric
        ) * 100,
        1
      )
    ELSE 0
  END as failure_rate_24h_pct,
  
  CASE 
    WHEN COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') = 0 THEN 'no_data'
    WHEN (
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND success = false)::numeric / 
      NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::numeric
    ) > 0.30 THEN 'unhealthy'
    ELSE 'healthy'
  END as health_status,
  
  MAX(created_at) as last_installation_at
  
FROM public.installation_analytics
GROUP BY tenant_id;

-- ============================================================================
-- 6. FUNÇÃO RPC: STATUS DE SAÚDE GERAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_installation_health_status()
RETURNS TABLE(
  status text,
  failure_rate_pct numeric,
  total_attempts bigint,
  threshold numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 'no_data'
      WHEN (COUNT(*) FILTER (WHERE success = false)::numeric / COUNT(*)::numeric) > 0.30 THEN 'unhealthy'
      ELSE 'healthy'
    END as status,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE success = false)::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0
    END as failure_rate_pct,
    COUNT(*) as total_attempts,
    30.0 as threshold
  FROM public.installation_analytics
  WHERE created_at > NOW() - INTERVAL '24 hours'
    AND event_type IN ('post_installation', 'post_installation_unverified');
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- 7. DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON COLUMN public.installation_analytics.telemetry_hash IS 
  'SHA256 hash único para idempotência, gerado automaticamente baseado em agent_id, event_type, timestamp e platform';

COMMENT ON VIEW public.agent_installation_metrics IS 
  'Métricas consolidadas de instalação por dia, tenant e plataforma com taxas de sucesso e tempos médios';

COMMENT ON VIEW public.installation_error_summary IS 
  'Resumo dos erros mais comuns (top 100) com contadores e lista de agentes afetados';

COMMENT ON VIEW public.installation_health_status IS 
  'Status de saúde das instalações por tenant nas últimas 24h para monitoramento e alertas';
