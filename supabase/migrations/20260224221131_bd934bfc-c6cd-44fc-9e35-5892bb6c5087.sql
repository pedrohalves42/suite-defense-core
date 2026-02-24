
-- Create agent_group_members join table
CREATE TABLE public.agent_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.agent_groups(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, agent_id)
);

-- Enable RLS
ALTER TABLE public.agent_group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant admins can view group members"
  ON public.agent_group_members FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Tenant admins can manage group members"
  ON public.agent_group_members FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Tenant admins can remove group members"
  ON public.agent_group_members FOR DELETE TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Index for fast lookups
CREATE INDEX idx_agent_group_members_agent ON public.agent_group_members(agent_id);
CREATE INDEX idx_agent_group_members_group ON public.agent_group_members(group_id);
CREATE INDEX idx_agent_group_members_tenant ON public.agent_group_members(tenant_id);
