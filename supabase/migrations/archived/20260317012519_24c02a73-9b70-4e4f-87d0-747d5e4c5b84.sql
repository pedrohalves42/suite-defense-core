
-- Remove all blocked_access_attempts that originated from dns_cache agent_web_activity
-- (the source column in blocked_access_attempts says 'collect_web_activity' but the 
-- underlying agent_web_activity records have source='dns_cache')
DELETE FROM blocked_access_attempts baa
WHERE NOT EXISTS (
  SELECT 1 FROM agent_web_activity awa
  WHERE awa.agent_id = baa.agent_id
    AND awa.domain = baa.domain
    AND awa.source = 'browser_history'
    AND awa.is_blocked = true
    AND awa.visited_at >= now() - interval '30 days'
);
