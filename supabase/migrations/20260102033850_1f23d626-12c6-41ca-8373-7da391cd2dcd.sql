-- FASE 1.2: Guardrail - Nunca mais aceitar eventos incompletos
ALTER TABLE decision_events
ALTER COLUMN decision_source SET NOT NULL,
ALTER COLUMN decision_type SET NOT NULL;

-- FASE 3.1: Criar view de saude de governanca
CREATE OR REPLACE VIEW governance_health_metrics AS
SELECT
  COUNT(*) FILTER (WHERE decision_source IS NOT NULL) AS decision_events_total,
  COUNT(*) FILTER (WHERE decision_source = 'human') AS decision_events_human,
  COUNT(*) FILTER (WHERE decision_source = 'system') AS decision_events_system,
  COUNT(*) FILTER (WHERE decision_type = 'rollback') AS rollback_total,
  ROUND(
    COUNT(*) FILTER (WHERE decision_source = 'human')::numeric / 
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS human_decision_rate
FROM decision_events;

-- FASE 3.2: Criar funcao para metricas consolidadas de governanca
CREATE OR REPLACE FUNCTION get_governance_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'decision_events', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'by_human', COUNT(*) FILTER (WHERE decision_source = 'human'),
        'by_system', COUNT(*) FILTER (WHERE decision_source = 'system'),
        'rollbacks', COUNT(*) FILTER (WHERE decision_type = 'rollback'),
        'human_rate', ROUND(
          COUNT(*) FILTER (WHERE decision_source = 'human')::numeric / 
          NULLIF(COUNT(*), 0) * 100, 2
        )
      ) FROM decision_events
    ),
    'ai_actions', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'human_reviewed', COUNT(*) FILTER (WHERE human_reviewed = true),
        'review_rate', ROUND(
          COUNT(*) FILTER (WHERE human_reviewed = true)::numeric / 
          NULLIF(COUNT(*), 0) * 100, 2
        )
      ) FROM ai_actions
    ),
    'policies', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'enabled', COUNT(*) FILTER (WHERE is_enabled = true),
        'with_assignments', (SELECT COUNT(DISTINCT policy_id) FROM policy_assignments)
      ) FROM security_policies
    ),
    'snapshot_at', now()
  );
END;
$$;