-- Fix agents table unique constraint to be tenant-scoped
-- Current: UNIQUE(agent_name) - globally unique
-- Fixed: UNIQUE(tenant_id, agent_name) - unique per tenant

-- Drop the old global constraint
ALTER TABLE public.agents 
DROP CONSTRAINT IF EXISTS agents_agent_name_key;

-- Add new tenant-scoped constraint
ALTER TABLE public.agents 
ADD CONSTRAINT agents_tenant_agent_name_key 
UNIQUE (tenant_id, agent_name);

-- Verify the constraint
COMMENT ON CONSTRAINT agents_tenant_agent_name_key ON public.agents 
IS 'Ensures agent names are unique within each tenant, allowing same names across different tenants';