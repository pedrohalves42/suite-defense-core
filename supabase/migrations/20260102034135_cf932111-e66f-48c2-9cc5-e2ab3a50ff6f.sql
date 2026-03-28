-- Corrigir funcao get_governance_snapshot (is_enabled -> enabled)
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
        'enabled', COUNT(*) FILTER (WHERE enabled = true),
        'with_assignments', (SELECT COUNT(DISTINCT policy_id) FROM policy_assignments)
      ) FROM security_policies
    ),
    'snapshot_at', now()
  );
END;
$$;