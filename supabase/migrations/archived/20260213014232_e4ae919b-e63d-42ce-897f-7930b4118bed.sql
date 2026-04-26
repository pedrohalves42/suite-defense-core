-- Add indexes to optimize detect_blocked_access_attempts RPC
-- which is timing out due to full table scans on large tables
CREATE INDEX IF NOT EXISTS idx_awa_domain_visited 
  ON agent_web_activity(domain, visited_at);

CREATE INDEX IF NOT EXISTS idx_awa_is_blocked 
  ON agent_web_activity(is_blocked) 
  WHERE is_blocked = true;

CREATE INDEX IF NOT EXISTS idx_baa_agent_domain_attempted 
  ON blocked_access_attempts(agent_id, domain, attempted_at);

CREATE INDEX IF NOT EXISTS idx_blocked_websites_tenant_active 
  ON blocked_websites(tenant_id) 
  WHERE is_active = true;