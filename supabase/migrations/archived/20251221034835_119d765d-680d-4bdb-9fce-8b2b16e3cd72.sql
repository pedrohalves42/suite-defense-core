-- ============================================
-- FASE 3: Remover coluna redundante ignored_reason
-- ============================================

-- Drop redundant column (keep only ignore_reason)
ALTER TABLE public.playbook_executions DROP COLUMN IF EXISTS ignored_reason;

-- ============================================
-- FASE 4: Adicionar metricas de Playbooks
-- ============================================

-- Funcao para calcular metricas de playbooks
CREATE OR REPLACE FUNCTION public.get_playbook_metrics(
  p_tenant_id UUID,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  -- Metricas gerais
  total_executions BIGINT,
  total_completed BIGINT,
  total_ignored BIGINT,
  total_failed BIGINT,
  execution_rate_pct NUMERIC,
  ignore_rate_pct NUMERIC,
  
  -- Tempo de resposta
  avg_response_time_minutes NUMERIC,
  min_response_time_minutes NUMERIC,
  max_response_time_minutes NUMERIC,
  
  -- Playbook mais acionado
  most_triggered_playbook_id UUID,
  most_triggered_playbook_name TEXT,
  most_triggered_count BIGINT,
  
  -- Periodo
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  v_cutoff := NOW() - (p_days_back || ' days')::INTERVAL;
  
  RETURN QUERY
  WITH execution_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE pe.status = 'completed') as completed,
      COUNT(*) FILTER (WHERE pe.status = 'ignored') as ignored,
      COUNT(*) FILTER (WHERE pe.status = 'failed') as failed,
      AVG(
        EXTRACT(EPOCH FROM (pe.completed_at - pe.triggered_at)) / 60
      ) FILTER (WHERE pe.completed_at IS NOT NULL) as avg_response_min,
      MIN(
        EXTRACT(EPOCH FROM (pe.completed_at - pe.triggered_at)) / 60
      ) FILTER (WHERE pe.completed_at IS NOT NULL) as min_response_min,
      MAX(
        EXTRACT(EPOCH FROM (pe.completed_at - pe.triggered_at)) / 60
      ) FILTER (WHERE pe.completed_at IS NOT NULL) as max_response_min
    FROM playbook_executions pe
    WHERE pe.tenant_id = p_tenant_id
      AND pe.triggered_at >= v_cutoff
  ),
  top_playbook AS (
    SELECT 
      pe.playbook_id,
      p.name as playbook_name,
      COUNT(*) as trigger_count
    FROM playbook_executions pe
    LEFT JOIN playbooks p ON pe.playbook_id = p.id
    WHERE pe.tenant_id = p_tenant_id
      AND pe.triggered_at >= v_cutoff
      AND pe.playbook_id IS NOT NULL
    GROUP BY pe.playbook_id, p.name
    ORDER BY trigger_count DESC
    LIMIT 1
  )
  SELECT
    COALESCE(es.total, 0)::BIGINT,
    COALESCE(es.completed, 0)::BIGINT,
    COALESCE(es.ignored, 0)::BIGINT,
    COALESCE(es.failed, 0)::BIGINT,
    CASE WHEN es.total > 0 
      THEN ROUND((es.completed::NUMERIC / es.total::NUMERIC) * 100, 1)
      ELSE 0
    END,
    CASE WHEN es.total > 0 
      THEN ROUND((es.ignored::NUMERIC / es.total::NUMERIC) * 100, 1)
      ELSE 0
    END,
    ROUND(COALESCE(es.avg_response_min, 0)::NUMERIC, 2),
    ROUND(COALESCE(es.min_response_min, 0)::NUMERIC, 2),
    ROUND(COALESCE(es.max_response_min, 0)::NUMERIC, 2),
    tp.playbook_id,
    tp.playbook_name,
    COALESCE(tp.trigger_count, 0)::BIGINT,
    v_cutoff,
    NOW()
  FROM execution_stats es
  CROSS JOIN (SELECT * FROM top_playbook LIMIT 1) tp;
END;
$$;

-- Funcao para metricas por playbook individual
CREATE OR REPLACE FUNCTION public.get_playbook_execution_breakdown(
  p_tenant_id UUID,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  playbook_id UUID,
  playbook_name TEXT,
  severity TEXT,
  total_triggers BIGINT,
  completed_count BIGINT,
  ignored_count BIGINT,
  failed_count BIGINT,
  avg_response_minutes NUMERIC,
  last_triggered_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as playbook_id,
    p.name as playbook_name,
    p.severity,
    COUNT(pe.id)::BIGINT as total_triggers,
    COUNT(pe.id) FILTER (WHERE pe.status = 'completed')::BIGINT as completed_count,
    COUNT(pe.id) FILTER (WHERE pe.status = 'ignored')::BIGINT as ignored_count,
    COUNT(pe.id) FILTER (WHERE pe.status = 'failed')::BIGINT as failed_count,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (pe.completed_at - pe.triggered_at)) / 60) 
      FILTER (WHERE pe.completed_at IS NOT NULL)::NUMERIC, 
      2
    ) as avg_response_minutes,
    MAX(pe.triggered_at) as last_triggered_at
  FROM playbooks p
  LEFT JOIN playbook_executions pe ON p.id = pe.playbook_id 
    AND pe.tenant_id = p_tenant_id
    AND pe.triggered_at >= NOW() - (p_days_back || ' days')::INTERVAL
  WHERE p.tenant_id = p_tenant_id OR p.is_system = true
  GROUP BY p.id, p.name, p.severity
  ORDER BY total_triggers DESC NULLS LAST, p.name;
END;
$$;

-- Comentarios para documentacao
COMMENT ON FUNCTION public.get_playbook_metrics IS 
  'Retorna metricas agregadas de execucoes de playbooks: taxas, tempos de resposta, playbook mais acionado';

COMMENT ON FUNCTION public.get_playbook_execution_breakdown IS 
  'Retorna breakdown de execucoes por playbook individual com estatisticas detalhadas';