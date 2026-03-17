
-- Clean up false positives: remove blocked_access_attempts that came from dns_cache
-- These were not real user visits
DELETE FROM blocked_access_attempts
WHERE source = 'collect_web_activity'
  AND domain IN (
    SELECT DISTINCT awa.domain
    FROM agent_web_activity awa
    WHERE awa.source = 'dns_cache'
      AND awa.is_blocked = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM agent_web_activity awa2
    WHERE awa2.agent_id = blocked_access_attempts.agent_id
      AND awa2.domain = blocked_access_attempts.domain
      AND awa2.source = 'browser_history'
      AND awa2.is_blocked = true
  );
