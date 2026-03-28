
-- Asset Tagging System for agents
-- Tabela de tags por tenant
CREATE TABLE public.agent_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Tabela de relacao agente-tag (many-to-many)
CREATE TABLE public.agent_tag_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.agent_tags(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_id, tag_id)
);

-- Indices para performance
CREATE INDEX idx_agent_tags_tenant ON public.agent_tags(tenant_id);
CREATE INDEX idx_agent_tag_assignments_agent ON public.agent_tag_assignments(agent_id);
CREATE INDEX idx_agent_tag_assignments_tag ON public.agent_tag_assignments(tag_id);

-- RLS
ALTER TABLE public.agent_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tag_assignments ENABLE ROW LEVEL SECURITY;

-- Policies para agent_tags (isolamento por tenant via user_roles)
CREATE POLICY "agent_tags_select" ON public.agent_tags
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "agent_tags_insert" ON public.agent_tags
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "agent_tags_update" ON public.agent_tags
    FOR UPDATE TO authenticated
    USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "agent_tags_delete" ON public.agent_tags
    FOR DELETE TO authenticated
    USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Policies para agent_tag_assignments (isolamento via agent -> tenant)
CREATE POLICY "agent_tag_assignments_select" ON public.agent_tag_assignments
    FOR SELECT TO authenticated
    USING (
        agent_id IN (
            SELECT a.id FROM public.agents a 
            WHERE a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
        )
    );

CREATE POLICY "agent_tag_assignments_insert" ON public.agent_tag_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        agent_id IN (
            SELECT a.id FROM public.agents a 
            WHERE a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
        )
    );

CREATE POLICY "agent_tag_assignments_delete" ON public.agent_tag_assignments
    FOR DELETE TO authenticated
    USING (
        agent_id IN (
            SELECT a.id FROM public.agents a 
            WHERE a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
        )
    );
