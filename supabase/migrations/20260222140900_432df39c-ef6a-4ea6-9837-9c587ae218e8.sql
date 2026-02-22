
-- C3 FIX: Fix ai_response_cache.tenant_id type and add FK constraints

-- 1. Drop policies referencing tenant_id
DROP POLICY IF EXISTS "Authenticated users can read ai_response_cache" ON public.ai_response_cache;

-- 2. Drop indexes that use COALESCE with tenant_id
DROP INDEX IF EXISTS public.idx_ai_cache_lookup;
DROP INDEX IF EXISTS public.idx_ai_cache_prompt_category_tenant;

-- 3. Convert text -> uuid
ALTER TABLE public.ai_response_cache
ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;

-- 4. Recreate indexes with uuid-compatible COALESCE
CREATE UNIQUE INDEX idx_ai_cache_prompt_category_tenant
ON public.ai_response_cache (prompt_hash, task_category, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 5. Recreate policy
CREATE POLICY "Authenticated users can read ai_response_cache"
ON public.ai_response_cache
FOR SELECT
TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- 6. Add FK constraints
ALTER TABLE public.ai_response_cache
ADD CONSTRAINT ai_response_cache_tenant_id_fkey
FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE public.policy_assignments
ADD CONSTRAINT policy_assignments_tenant_id_fkey
FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE public.quarantined_files
ADD CONSTRAINT quarantined_files_tenant_id_fkey
FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
