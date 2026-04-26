-- Fase 1: Adicionar decision_event_id a tabela ai_actions para rastreabilidade completa
ALTER TABLE public.ai_actions 
ADD COLUMN IF NOT EXISTS decision_event_id UUID REFERENCES public.decision_events(id);

-- Criar indice para consultas de audit trail
CREATE INDEX IF NOT EXISTS idx_ai_actions_decision_event ON public.ai_actions(decision_event_id);

-- Fase 2: Criar view que corrige a classificacao de status dos jobs
-- Reclassifica timeouts de computador desligado como 'cancelled_timeout' ao inves de 'failed'
CREATE OR REPLACE VIEW public.v_jobs_status_corrected AS
SELECT 
  j.*,
  CASE 
    -- Jobs que falharam por timeout de computador desligado/offline
    WHEN j.status = 'failed' AND (
      j.error_message ILIKE '%Auto-cleanup%' OR
      j.error_message ILIKE '%Zombie TTL%' OR
      j.error_message ILIKE '%exceeded max delivery attempts%' OR
      j.error_message ILIKE '%expired before%' OR
      j.error_message ILIKE '%Stuck job%'
    ) THEN 'cancelled_timeout'
    -- Jobs que foram entregues mas nunca responderam (agente offline apos entrega)
    WHEN j.status = 'failed' AND j.error_message ILIKE '%delivered but%' THEN 'cancelled_no_response'
    -- Manter o status original para outros casos
    ELSE j.status
  END AS corrected_status,
  CASE 
    WHEN j.status = 'failed' AND (
      j.error_message ILIKE '%Auto-cleanup%' OR
      j.error_message ILIKE '%Zombie TTL%' OR
      j.error_message ILIKE '%exceeded max delivery attempts%' OR
      j.error_message ILIKE '%expired before%' OR
      j.error_message ILIKE '%Stuck job%' OR
      j.error_message ILIKE '%delivered but%'
    ) THEN false
    ELSE j.status = 'failed'
  END AS is_real_failure
FROM public.jobs j;

-- Conceder permissoes na view
GRANT SELECT ON public.v_jobs_status_corrected TO authenticated;

-- Fase 3: Criar RPC para metricas de autonomia
CREATE OR REPLACE FUNCTION public.get_autonomy_metrics(
  p_tenant_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_start_date TIMESTAMPTZ;
BEGIN
  v_start_date := NOW() - (p_days || ' days')::INTERVAL;
  
  SELECT json_build_object(
    'total_decisions', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
    ),
    'total_actions_created', (
      SELECT COUNT(*) FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
    ),
    'actions_auto_executed', (
      SELECT COUNT(*) FROM ai_action_executions 
      WHERE tenant_id = p_tenant_id AND executed_at >= v_start_date
    ),
    'actions_pending', (
      SELECT COUNT(*) FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND status = 'pending' AND created_at >= v_start_date
    ),
    'actions_approved', (
      SELECT COUNT(*) FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND status = 'approved' AND created_at >= v_start_date
    ),
    'actions_rejected', (
      SELECT COUNT(*) FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND status = 'rejected' AND created_at >= v_start_date
    ),
    'alerts_generated', (
      SELECT COUNT(*) FROM system_alerts 
      WHERE tenant_id = p_tenant_id AND created_at >= v_start_date 
      AND alert_type = 'ai_insight_alert'
    ),
    'decisions_by_rule', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT rule_code, COUNT(*) as count
        FROM decision_events 
        WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
        GROUP BY rule_code
        ORDER BY count DESC
      ) t
    ),
    'actions_by_type', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT action_type, COUNT(*) as count
        FROM ai_actions 
        WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
        GROUP BY action_type
        ORDER BY count DESC
      ) t
    ),
    'execution_success_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 100
        ELSE ROUND((COUNT(*) FILTER (WHERE success = true)::NUMERIC / COUNT(*) * 100), 2)
      END
      FROM ai_action_executions 
      WHERE tenant_id = p_tenant_id AND executed_at >= v_start_date
    ),
    'job_success_rate_corrected', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 100
        ELSE ROUND((COUNT(*) FILTER (WHERE corrected_status = 'completed')::NUMERIC / COUNT(*) * 100), 2)
      END
      FROM v_jobs_status_corrected 
      WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Fase 4: Criar RPC para validar integridade do audit trail
CREATE OR REPLACE FUNCTION public.validate_audit_trail_integrity(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'orphan_actions', (
      SELECT COALESCE(json_agg(json_build_object('id', id, 'action_type', action_type, 'created_at', created_at)), '[]'::json)
      FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND insight_id IS NULL
      LIMIT 10
    ),
    'orphan_actions_count', (
      SELECT COUNT(*) FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND insight_id IS NULL
    ),
    'executions_without_audit', (
      SELECT COUNT(*) FROM ai_action_executions e
      WHERE e.tenant_id = p_tenant_id 
      AND NOT EXISTS (
        SELECT 1 FROM audit_logs a 
        WHERE a.resource_id = e.id::text 
        AND a.resource_type = 'ai_action_execution'
      )
    ),
    'decisions_without_insight', (
      SELECT COUNT(*) FROM decision_events d
      WHERE d.tenant_id = p_tenant_id 
      AND d.insight_id IS NULL
    ),
    'integrity_score', (
      SELECT CASE 
        WHEN (
          SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id
        ) = 0 THEN 100
        ELSE ROUND(
          (1 - (
            SELECT COUNT(*)::NUMERIC FROM ai_actions 
            WHERE tenant_id = p_tenant_id AND insight_id IS NULL
          ) / NULLIF((
            SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id
          ), 1)) * 100, 2
        )
      END
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Fase 5: Criar RPC para timeline de decisoes
CREATE OR REPLACE FUNCTION public.get_decision_timeline(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_rule_code TEXT DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT 
      de.id,
      de.rule_code,
      de.action,
      de.evidence,
      de.executed_actions,
      de.created_at,
      de.agent_id,
      de.agent_name,
      dr.name as rule_name,
      dr.severity as rule_severity,
      dr.risk_level,
      (
        SELECT json_agg(json_build_object(
          'id', aa.id,
          'action_type', aa.action_type,
          'status', aa.status,
          'executed_at', (SELECT MAX(executed_at) FROM ai_action_executions WHERE action_id = aa.id)
        ))
        FROM ai_actions aa
        WHERE aa.insight_id = de.insight_id
      ) as related_actions
    FROM decision_events de
    LEFT JOIN decision_rules dr ON dr.code = de.rule_code
    WHERE de.tenant_id = p_tenant_id
    AND (p_rule_code IS NULL OR de.rule_code = p_rule_code)
    AND (p_agent_id IS NULL OR de.agent_id = p_agent_id)
    ORDER BY de.created_at DESC
    LIMIT p_limit
  ) t INTO v_result;
  
  RETURN v_result;
END;
$$;