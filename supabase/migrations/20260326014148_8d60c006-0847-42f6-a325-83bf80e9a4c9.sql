
-- SCIM Groups table
CREATE TABLE IF NOT EXISTS public.scim_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scim_groups_tenant ON public.scim_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scim_groups_external ON public.scim_groups(external_id);

-- Group Members join table
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.scim_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members(user_id);

-- Add SCIM columns to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS scim_api_key VARCHAR(255);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS scim_config JSONB;

-- Backup Verifications table
CREATE TABLE IF NOT EXISTS public.backup_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    test_id VARCHAR(100) NOT NULL UNIQUE,
    backup_hash VARCHAR(64) NOT NULL,
    backup_size_bytes BIGINT,
    restore_duration_seconds INTEGER,
    restored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    restored_by VARCHAR(100),
    verification_status VARCHAR(20) DEFAULT 'success',
    verification_details JSONB,
    evidence_path TEXT,
    report_generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_verifications_restored_at ON public.backup_verifications(restored_at);

-- RLS for scim_groups
ALTER TABLE public.scim_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scim_groups_tenant_select" ON public.scim_groups
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "scim_groups_admin_insert" ON public.scim_groups
    FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "scim_groups_admin_update" ON public.scim_groups
    FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "scim_groups_admin_delete" ON public.scim_groups
    FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS for group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_tenant_select" ON public.group_members
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "group_members_admin_insert" ON public.group_members
    FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "group_members_admin_delete" ON public.group_members
    FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS for backup_verifications
ALTER TABLE public.backup_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_verifications_tenant_select" ON public.backup_verifications
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Generate SCIM API key function
CREATE OR REPLACE FUNCTION public.generate_scim_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 'cybershield_scim_' || encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Auto-generate SCIM API key on tenant insert
CREATE OR REPLACE FUNCTION public.ensure_scim_api_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.scim_api_key IS NULL THEN
        NEW.scim_api_key := public.generate_scim_api_key();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_scim_api_key_trigger ON public.tenants;
CREATE TRIGGER tenants_scim_api_key_trigger
    BEFORE INSERT ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_scim_api_key();
