-- Migration 4: Create detection and action functions for Rules Engine

-- Function 1: Detect agents with high request rate (throttle candidates)
CREATE OR REPLACE FUNCTION public.detect_throttle_candidates(
  p_requests_per_minute INTEGER DEFAULT 60,
  p_time_window_minutes INTEGER DEFAULT 5
)
RETURNS TABLE(
  agent_id UUID,
  agent_name TEXT,
  tenant_id UUID,
  request_count BIGINT,
  error_count BIGINT,
  error_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.agent_id,
    j.agent_name,
    j.tenant_id,
    COUNT(*) AS request_count,
    COUNT(*) FILTER (WHERE j.status = 'failed') AS error_count,
    ROUND(
      (COUNT(*) FILTER (WHERE j.status = 'failed')::NUMERIC / 
       NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 2
    ) AS error_rate
  FROM jobs j
  JOIN agents a ON j.agent_id = a.id
  WHERE j.created_at > NOW() - (p_time_window_minutes || ' minutes')::INTERVAL
    AND a.is_throttled = false
  GROUP BY j.agent_id, j.agent_name, j.tenant_id
  HAVING COUNT(*) > (p_requests_per_minute * p_time_window_minutes)
     OR (COUNT(*) FILTER (WHERE j.status = 'failed')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0)) > 0.5
  ORDER BY request_count DESC;
END;
$$;

-- Function 2: Apply throttle to agent
CREATE OR REPLACE FUNCTION public.apply_agent_throttle(
  p_agent_id UUID,
  p_poll_interval_seconds INTEGER DEFAULT 300,
  p_reason TEXT DEFAULT 'Automated throttle due to high request rate'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.agents
  SET 
    is_throttled = true,
    throttled_at = NOW(),
    throttle_reason = p_reason,
    poll_interval_seconds = p_poll_interval_seconds
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$;

-- Function 3: Detect agents with security threats (isolate candidates)
CREATE OR REPLACE FUNCTION public.detect_isolation_candidates(
  p_suspicious_events_count INTEGER DEFAULT 5,
  p_time_window_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(
  agent_id UUID,
  agent_name TEXT,
  tenant_id UUID,
  event_count BIGINT,
  event_types TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    se.agent_id,
    COALESCE(se.agent_name, a.agent_name) AS agent_name,
    se.tenant_id,
    COUNT(*) AS event_count,
    ARRAY_AGG(DISTINCT se.event_type) AS event_types
  FROM security_events se
  JOIN agents a ON se.agent_id = a.id
  WHERE se.created_at > NOW() - (p_time_window_minutes || ' minutes')::INTERVAL
    AND a.is_isolated = false
    AND se.severity IN ('high', 'critical')
  GROUP BY se.agent_id, COALESCE(se.agent_name, a.agent_name), se.tenant_id
  HAVING COUNT(*) >= p_suspicious_events_count
  ORDER BY event_count DESC;
END;
$$;

-- Function 4: Apply isolation to agent
CREATE OR REPLACE FUNCTION public.apply_agent_isolation(
  p_agent_id UUID,
  p_reason TEXT DEFAULT 'Automated isolation due to security threats'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Isolate the agent
  UPDATE public.agents
  SET 
    is_isolated = true,
    isolated_at = NOW(),
    isolation_reason = p_reason
  WHERE id = p_agent_id;
  
  -- Cancel all pending jobs for this agent
  UPDATE public.jobs
  SET 
    status = 'cancelled',
    error_message = 'Cancelled: Agent isolated - ' || p_reason,
    completed_at = NOW()
  WHERE agent_id = p_agent_id
    AND status IN ('queued', 'delivered');
  
  RETURN FOUND;
END;
$$;

-- Function 5: Detect problematic versions (block candidates)
CREATE OR REPLACE FUNCTION public.detect_version_block_candidates(
  p_failure_rate_percent NUMERIC DEFAULT 30,
  p_affected_agents_count INTEGER DEFAULT 3,
  p_time_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  version TEXT,
  platform TEXT,
  version_id UUID,
  total_agents BIGINT,
  failed_agents BIGINT,
  failure_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.agent_version AS version,
    COALESCE(a.os_type, 'unknown') AS platform,
    av.id AS version_id,
    COUNT(DISTINCT a.id) AS total_agents,
    COUNT(DISTINCT a.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM jobs j 
        WHERE j.agent_id = a.id 
          AND j.status = 'failed'
          AND j.created_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
      )
    ) AS failed_agents,
    ROUND(
      COUNT(DISTINCT a.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM jobs j 
          WHERE j.agent_id = a.id 
            AND j.status = 'failed'
            AND j.created_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
        )
      )::NUMERIC / NULLIF(COUNT(DISTINCT a.id)::NUMERIC, 0) * 100, 2
    ) AS failure_rate
  FROM agents a
  LEFT JOIN agent_versions av ON a.agent_version = av.version AND a.os_type = av.platform
  WHERE a.agent_version IS NOT NULL
    AND a.enrolled_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
    AND (av.is_blocked IS NULL OR av.is_blocked = false)
  GROUP BY a.agent_version, a.os_type, av.id
  HAVING 
    COUNT(DISTINCT a.id) >= p_affected_agents_count
    AND (
      COUNT(DISTINCT a.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM jobs j 
          WHERE j.agent_id = a.id 
            AND j.status = 'failed'
            AND j.created_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
        )
      )::NUMERIC / NULLIF(COUNT(DISTINCT a.id)::NUMERIC, 0) * 100
    ) >= p_failure_rate_percent
  ORDER BY failure_rate DESC;
END;
$$;

-- Function 6: Block a version
CREATE OR REPLACE FUNCTION public.apply_version_block(
  p_version TEXT,
  p_platform TEXT,
  p_reason TEXT DEFAULT 'Automated block due to high failure rate',
  p_blocked_by TEXT DEFAULT 'rules_engine'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.agent_versions
  SET 
    is_blocked = true,
    blocked_at = NOW(),
    blocked_reason = p_reason,
    blocked_by = p_blocked_by
  WHERE version = p_version 
    AND platform = p_platform;
  
  RETURN FOUND;
END;
$$;

-- Function 7: Remove throttle from agent
CREATE OR REPLACE FUNCTION public.remove_agent_throttle(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.agents
  SET 
    is_throttled = false,
    throttled_at = NULL,
    throttle_reason = NULL,
    poll_interval_seconds = 60
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$;

-- Function 8: Remove isolation from agent
CREATE OR REPLACE FUNCTION public.remove_agent_isolation(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.agents
  SET 
    is_isolated = false,
    isolated_at = NULL,
    isolation_reason = NULL
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$;