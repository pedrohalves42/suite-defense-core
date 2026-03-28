-- Corrigir funcao de balanceamento - adicionar created_at ao CTE
CREATE OR REPLACE FUNCTION get_balanced_pending_actions(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  action_type TEXT,
  action_payload JSONB,
  insight_id UUID,
  ai_insights JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked_actions AS (
    SELECT 
      a.id,
      a.tenant_id,
      a.action_type,
      a.action_payload,
      a.insight_id,
      a.created_at,
      ROW_NUMBER() OVER (PARTITION BY a.tenant_id ORDER BY a.created_at ASC) as tenant_rank
    FROM ai_actions a
    WHERE a.status = 'pending'
  ),
  balanced_actions AS (
    SELECT ra.id, ra.tenant_id, ra.action_type, ra.action_payload, ra.insight_id, ra.created_at
    FROM ranked_actions ra
    ORDER BY ra.tenant_rank ASC, ra.created_at ASC
    LIMIT p_limit
  )
  SELECT 
    ba.id,
    ba.tenant_id,
    ba.action_type,
    ba.action_payload,
    ba.insight_id,
    (
      SELECT jsonb_build_object(
        'id', i.id,
        'confidence_score', i.confidence_score,
        'insight_type', i.insight_type,
        'status', i.status
      )
      FROM ai_insights i 
      WHERE i.id = ba.insight_id
    ) as ai_insights
  FROM balanced_actions ba;
END;
$$;