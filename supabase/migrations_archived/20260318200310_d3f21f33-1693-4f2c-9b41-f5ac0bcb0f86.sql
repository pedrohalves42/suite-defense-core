DROP FUNCTION IF EXISTS public.get_autonomy_metrics(uuid, integer);
DROP FUNCTION IF EXISTS public.validate_audit_trail_integrity(uuid);
DROP FUNCTION IF EXISTS public.get_decision_timeline(uuid, integer, text, uuid);

-- 1. get_autonomy_metrics
CREATE OR REPLACE FUNCTION public.get_autonomy_metrics(p_tenant_id uuid, p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  since timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  SELECT jsonb_build_object(
    'total_decisions', COALESCE((SELECT count(*) FROM decision_events WHERE tenant_id = p_tenant_id AND created_at >= since), 0),
    'total_actions_created', COALESCE((SELECT count(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since), 0),
    'actions_auto_executed', COALESCE((SELECT count(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since AND status = 'executed'), 0),
    'actions_pending', COALESCE((SELECT count(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since AND status = 'pending'), 0),
    'actions_approved', COALESCE((SELECT count(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since AND status = 'approved'), 0),
    'actions_rejected', COALESCE((SELECT count(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since AND status = 'rejected'), 0),
    'alerts_generated', COALESCE((SELECT count(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since AND action_type = 'alert'), 0),
    'execution_success_rate', COALESCE(
      (SELECT round(count(*) FILTER (WHERE status IN ('executed','completed','approved'))::numeric * 100.0 / NULLIF(count(*) FILTER (WHERE status NOT IN ('pending')), 0), 1)
       FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since), 0),
    'job_success_rate_corrected', COALESCE(
      (SELECT round(count(*) FILTER (WHERE status IN ('completed','executed'))::numeric * 100.0 / NULLIF(count(*), 0), 1)
       FROM jobs WHERE tenant_id = p_tenant_id AND created_at >= since AND status != 'cancelled_timeout'), 99),
    'decisions_by_rule', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('rule_code', rule_code, 'count', cnt))
       FROM (SELECT rule_code, count(*) as cnt FROM decision_events WHERE tenant_id = p_tenant_id AND created_at >= since GROUP BY rule_code ORDER BY cnt DESC LIMIT 20) sub), '[]'::jsonb),
    'actions_by_type', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('action_type', action_type, 'count', cnt))
       FROM (SELECT action_type, count(*) as cnt FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at >= since GROUP BY action_type ORDER BY cnt DESC LIMIT 20) sub), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- 2. validate_audit_trail_integrity
CREATE OR REPLACE FUNCTION public.validate_audit_trail_integrity(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  orphan_count integer;
  exec_no_audit integer;
  dec_no_insight integer;
  total_actions integer;
  score numeric;
BEGIN
  SELECT count(*) INTO orphan_count FROM ai_actions WHERE tenant_id = p_tenant_id AND decision_event_id IS NULL;
  SELECT count(*) INTO exec_no_audit FROM ai_action_executions e WHERE e.tenant_id = p_tenant_id
    AND NOT EXISTS (SELECT 1 FROM ai_action_logs l WHERE l.tenant_id = p_tenant_id AND l.created_at >= e.created_at - interval '1 minute' AND l.created_at <= e.created_at + interval '1 minute');
  SELECT count(*) INTO dec_no_insight FROM decision_events d WHERE d.tenant_id = p_tenant_id AND d.agent_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ai_insights i WHERE i.tenant_id = p_tenant_id AND i.agent_id = d.agent_id AND i.created_at >= d.created_at - interval '5 minutes' AND i.created_at <= d.created_at + interval '5 minutes');
  SELECT count(*) INTO total_actions FROM ai_actions WHERE tenant_id = p_tenant_id;
  IF total_actions = 0 THEN score := 100;
  ELSE score := greatest(0, round(100 - (orphan_count::numeric / greatest(total_actions, 1) * 50) - (exec_no_audit * 2) - (dec_no_insight * 1), 1));
  END IF;
  SELECT jsonb_build_object(
    'orphan_actions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'action_type', action_type, 'created_at', created_at))
       FROM (SELECT id, action_type, created_at FROM ai_actions WHERE tenant_id = p_tenant_id AND decision_event_id IS NULL ORDER BY created_at DESC LIMIT 10) sub), '[]'::jsonb),
    'orphan_actions_count', orphan_count,
    'executions_without_audit', exec_no_audit,
    'decisions_without_insight', dec_no_insight,
    'integrity_score', score
  ) INTO result;
  RETURN result;
END;
$$;

-- 3. get_decision_timeline
CREATE OR REPLACE FUNCTION public.get_decision_timeline(p_tenant_id uuid, p_limit integer DEFAULT 50, p_rule_code text DEFAULT NULL, p_agent_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'rule_code', d.rule_code, 'action', d.action,
      'evidence', COALESCE(d.evidence, '{}'::jsonb),
      'executed_actions', COALESCE(d.actions_executed, ARRAY[]::text[]),
      'created_at', d.created_at, 'agent_id', d.agent_id, 'agent_name', d.agent_name,
      'rule_name', COALESCE(r.description, d.rule_code),
      'rule_severity', (r.definition->>'severity'),
      'risk_level', (r.definition->>'risk_level'),
      'related_actions', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'action_type', a.action_type, 'status', a.status, 'executed_at', a.executed_at))
        FROM ai_actions a WHERE a.decision_event_id = d.id), '[]'::jsonb)
    ) as row_data
    FROM decision_events d
    LEFT JOIN decision_rules r ON r.code = d.rule_code
    WHERE d.tenant_id = p_tenant_id
      AND (p_rule_code IS NULL OR d.rule_code = p_rule_code)
      AND (p_agent_id IS NULL OR d.agent_id = p_agent_id)
    ORDER BY d.created_at DESC
    LIMIT p_limit
  ) sub;
  RETURN result;
END;
$$;