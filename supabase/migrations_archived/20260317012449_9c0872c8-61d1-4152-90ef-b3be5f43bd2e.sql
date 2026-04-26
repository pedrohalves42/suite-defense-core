
-- Fix: Exclude dns_cache from blocked access attempts correlation
-- DNS cache entries are background OS/app resolutions, NOT real user visits
-- Only browser_history represents actual user-initiated access attempts

CREATE OR REPLACE FUNCTION public.detect_blocked_access_attempts()
RETURNS TABLE(inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH inserted AS (
    INSERT INTO blocked_access_attempts (
      tenant_id,
      agent_id,
      agent_name,
      domain,
      policy_id,
      attempted_at,
      blocked_by,
      source,
      created_at
    )
    SELECT
      awa.tenant_id,
      awa.agent_id,
      a.agent_name,
      awa.domain,
      bw.id,
      awa.visited_at,
      'hosts_file',
      awa.source,
      now()
    FROM agent_web_activity awa
    JOIN agents a ON a.id = awa.agent_id
    JOIN blocked_websites bw
      ON bw.tenant_id = awa.tenant_id
     AND bw.is_active = true
     AND (
          awa.domain = bw.domain_pattern
       OR awa.domain = 'www.' || bw.domain_pattern
       OR (
            bw.domain_pattern LIKE '*.%'
        AND (
              awa.domain = SUBSTRING(bw.domain_pattern FROM 3)
           OR awa.domain LIKE '%.' || SUBSTRING(bw.domain_pattern FROM 3)
        )
       )
     )
    WHERE awa.is_blocked = true
      AND awa.source != 'dns_cache'  -- CRITICAL: exclude DNS cache noise
      AND awa.visited_at >= bw.created_at
      AND NOT EXISTS (
        SELECT 1
        FROM blocked_access_attempts baa
        WHERE baa.agent_id = awa.agent_id
          AND baa.domain = awa.domain
          AND baa.attempted_at = awa.visited_at
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  RETURN QUERY SELECT v_count;
END;
$$;
