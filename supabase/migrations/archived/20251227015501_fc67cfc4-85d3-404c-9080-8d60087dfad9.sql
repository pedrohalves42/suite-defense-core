-- ============================================================
-- P2.1: Auto-acknowledge old AI insights (info severity > 30 days)
-- ============================================================

-- Function to auto-acknowledge old insights
CREATE OR REPLACE FUNCTION public.auto_acknowledge_old_insights()
RETURNS TABLE(acknowledged_count INTEGER, insight_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_ids UUID[];
BEGIN
  -- Mark info-severity insights older than 30 days as acknowledged
  WITH updated AS (
    UPDATE public.ai_insights
    SET 
      acknowledged = true,
      acknowledged_at = NOW()
    WHERE 
      acknowledged = false
      AND severity = 'info'
      AND created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_count, v_ids
  FROM updated;
  
  -- Log the operation
  IF v_count > 0 THEN
    RAISE NOTICE 'Auto-acknowledged % old info insights', v_count;
  END IF;
  
  RETURN QUERY SELECT v_count, COALESCE(v_ids, ARRAY[]::UUID[]);
END;
$$;

-- Function to get critical unacknowledged insights count per tenant
CREATE OR REPLACE FUNCTION public.get_critical_insights_count(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.ai_insights
  WHERE tenant_id = p_tenant_id
    AND acknowledged = false
    AND severity IN ('critical', 'high');
$$;