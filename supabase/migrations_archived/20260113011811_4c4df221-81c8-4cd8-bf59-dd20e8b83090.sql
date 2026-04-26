-- =============================================================================
-- Phase 5: Add security_invoker to v_agent_execution_health
-- =============================================================================
-- This ensures the view uses RLS policies of the querying user, not the view creator
-- =============================================================================

ALTER VIEW v_agent_execution_health SET (security_invoker = on);