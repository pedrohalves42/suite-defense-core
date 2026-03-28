
-- =====================================================
-- AI Performance Dashboard - Schema Enhancement
-- Adiciona provider column e views para dashboard
-- =====================================================

-- 1. Adicionar coluna provider se nao existir
ALTER TABLE ai_inference_metrics 
ADD COLUMN IF NOT EXISTS provider text;

-- 2. Adicionar coluna cost_usd para tracking de custos
ALTER TABLE ai_inference_metrics 
ADD COLUMN IF NOT EXISTS cost_usd numeric(10,8) DEFAULT 0;

-- 3. Indices para performance do dashboard
CREATE INDEX IF NOT EXISTS idx_ai_metrics_provider 
ON ai_inference_metrics(provider);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_created_provider 
ON ai_inference_metrics(created_at DESC, provider);

-- 4. View de performance por provider (ultimas 24h)
CREATE OR REPLACE VIEW v_ai_provider_performance WITH (security_invoker = on) AS
SELECT 
  COALESCE(provider, 'unknown') as provider,
  COUNT(*) as requests_24h,
  ROUND(AVG(latency_ms)) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)) as p95_latency_ms,
  ROUND(AVG(CASE WHEN success THEN 1 ELSE 0 END) * 100, 1) as success_rate_pct,
  ROUND(AVG(CASE WHEN used_fallback THEN 1 ELSE 0 END) * 100, 1) as fallback_rate_pct,
  SUM(tokens_total) as total_tokens,
  ROUND(SUM(COALESCE(cost_usd, 0)) * 100, 4) as cost_cents_24h
FROM ai_inference_metrics 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY COALESCE(provider, 'unknown')
ORDER BY requests_24h DESC;

-- 5. View de tendencias horarias
CREATE OR REPLACE VIEW v_ai_hourly_trends WITH (security_invoker = on) AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as requests,
  ROUND(AVG(latency_ms)) as avg_latency_ms,
  ROUND(AVG(CASE WHEN success THEN 1 ELSE 0 END) * 100, 1) as success_rate_pct,
  ROUND(SUM(COALESCE(cost_usd, 0)) * 100, 4) as cost_cents,
  SUM(tokens_total) as total_tokens
FROM ai_inference_metrics 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- 6. View de performance por funcao
CREATE OR REPLACE VIEW v_ai_function_performance WITH (security_invoker = on) AS
SELECT 
  function_name,
  COUNT(*) as requests_24h,
  ROUND(AVG(latency_ms)) as avg_latency_ms,
  ROUND(AVG(CASE WHEN success THEN 1 ELSE 0 END) * 100, 1) as success_rate_pct,
  ROUND(SUM(COALESCE(cost_usd, 0)) * 100, 4) as cost_cents_24h,
  ROUND(AVG(tokens_total)) as avg_tokens,
  MAX(created_at) as last_request
FROM ai_inference_metrics 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name
ORDER BY requests_24h DESC;

-- 7. Funcao RPC para obter score de providers (para selecao inteligente)
CREATE OR REPLACE FUNCTION get_ai_provider_scores()
RETURNS TABLE(
  provider text,
  avg_latency_ms numeric,
  success_rate numeric,
  requests_count bigint,
  score numeric
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent_stats AS (
    SELECT 
      COALESCE(provider, 'unknown') as provider,
      AVG(latency_ms) as avg_latency,
      AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
      COUNT(*) as requests
    FROM ai_inference_metrics
    WHERE created_at > NOW() - INTERVAL '1 hour'
    GROUP BY COALESCE(provider, 'unknown')
  )
  SELECT 
    provider,
    ROUND(avg_latency) as avg_latency_ms,
    ROUND(success_rate * 100, 1) as success_rate,
    requests as requests_count,
    -- Score: lower is better (latency * 0.5 + error_penalty * 0.5)
    ROUND(
      avg_latency * 0.5 + 
      (1 - success_rate) * 10000 * 0.5
    , 2) as score
  FROM recent_stats
  ORDER BY score ASC;
$$;

-- 8. Comentarios para documentacao
COMMENT ON VIEW v_ai_provider_performance IS 
'Dashboard view: AI provider performance metrics (last 24h)';

COMMENT ON VIEW v_ai_hourly_trends IS 
'Dashboard view: Hourly AI usage trends (last 7 days)';

COMMENT ON VIEW v_ai_function_performance IS 
'Dashboard view: AI performance by edge function (last 24h)';

COMMENT ON FUNCTION get_ai_provider_scores IS 
'Returns AI provider scores for intelligent routing (lower score = better)';
