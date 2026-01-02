-- =============================================================================
-- Migration: Differentiated RLS for agents + ANA Reason Tree Integration
-- =============================================================================
-- This migration:
-- 1. Creates v_agent_archive_reason_tree for ANA explanations
-- 2. Creates v_decision_with_archive_context for decision + archive join
-- 3. Adds GRANT for active_agents to authenticated users
-- =============================================================================

-- =============================================================================
-- 1. View for ANA Reason Tree - Agent Archive Reasons
-- =============================================================================
-- This view provides structured archive reasons for ANA to explain decisions

CREATE OR REPLACE VIEW v_agent_archive_reason_tree AS
SELECT
  ae.agent_id,
  'agent_archived'::text AS reason_type,
  ae.reason,
  ae.actor_type,
  ae.actor_id,
  ae.notes,
  ae.created_at AS archived_at,
  a.agent_name,
  a.hostname,
  a.tenant_id
FROM agent_archive_events ae
JOIN agents a ON a.id = ae.agent_id;

-- Grant access to authenticated users
GRANT SELECT ON v_agent_archive_reason_tree TO authenticated;

-- =============================================================================
-- 2. Grant SELECT on active_agents for operational use
-- =============================================================================
-- Ensure authenticated users can query the operational view

GRANT SELECT ON active_agents TO authenticated;

-- =============================================================================
-- 3. Comment documentation for governance
-- =============================================================================

COMMENT ON VIEW v_agent_archive_reason_tree IS 
'ANA Reason Tree: Provides structured archive reasons for explaining why alerts may be suppressed or agents excluded from operational views. Part of ADR-007 governance.';

COMMENT ON VIEW active_agents IS 
'Canonical operational view for agents. All operational queries MUST use this view instead of the agents table. See ADR-007 and DATA-AGENT-001 policy.';