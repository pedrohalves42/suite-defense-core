-- RPC para buscar acoes pendentes com balanceamento entre tenants (round-robin)
-- Isso resolve o problema de "tenant starvation" onde um tenant bloqueado impede outros de processar
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
  -- Usa window function para distribuir acoes entre tenants
  -- ROW_NUMBER() OVER (PARTITION BY tenant_id) garante que pegamos de cada tenant alternadamente
  RETURN QUERY
  WITH ranked_actions AS (
    SELECT 
      a.id,
      a.tenant_id,
      a.action_type,
      a.action_payload,
      a.insight_id,
      ROW_NUMBER() OVER (PARTITION BY a.tenant_id ORDER BY a.created_at ASC) as tenant_rank
    FROM ai_actions a
    WHERE a.status = 'pending'
  ),
  balanced_actions AS (
    SELECT * FROM ranked_actions
    ORDER BY tenant_rank ASC, created_at ASC
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

COMMENT ON FUNCTION get_balanced_pending_actions IS 
'Anti-starvation RPC: distribui acoes pendentes de forma justa entre todos os tenants, 
evitando que um tenant com rate limit excedido bloqueie outros. 
Implementa round-robin por tenant_rank para garantir que todos processem igualmente.';