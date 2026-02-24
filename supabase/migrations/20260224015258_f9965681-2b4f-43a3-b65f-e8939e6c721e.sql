
-- V-203: Add tenant_id to agent_update_decisions and create tenant-scoped policy

-- 1. Add tenant_id column (nullable first for backfill)
ALTER TABLE public.agent_update_decisions 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 2. Backfill tenant_id from agents table
UPDATE public.agent_update_decisions d
SET tenant_id = a.tenant_id
FROM public.agents a
WHERE a.id = d.agent_id
  AND d.tenant_id IS NULL;

-- 3. Add tenant-scoped SELECT policy for admins
CREATE POLICY "admins_view_tenant_decisions"
ON public.agent_update_decisions
FOR SELECT
TO authenticated
USING (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
);

-- 4. Drop the super_admin-only policy (now redundant, covered by new policy's OR clause)
DROP POLICY IF EXISTS "super_admin_view_decisions" ON public.agent_update_decisions;

-- 5. Add index for performance
CREATE INDEX IF NOT EXISTS idx_agent_update_decisions_tenant_id 
ON public.agent_update_decisions(tenant_id);
