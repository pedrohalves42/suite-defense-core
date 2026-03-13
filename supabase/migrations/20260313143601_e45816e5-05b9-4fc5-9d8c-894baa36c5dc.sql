
-- Sprint 22: Agents index (archived_at based)
CREATE INDEX IF NOT EXISTS idx_agents_tenant_not_archived 
  ON public.agents (tenant_id) 
  WHERE archived_at IS NULL;
