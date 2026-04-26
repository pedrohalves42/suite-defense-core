-- =============================================
-- FASE 2.2: Tabela agent_evidence_logs
-- Armazena evidencias estruturadas dos agentes
-- =============================================

CREATE TABLE public.agent_evidence_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    agent_version TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'state_change',      -- Mudanca de estado
        'job_execution',     -- Execucao de job
        'dns_block',         -- Bloqueio DNS
        'policy_sync',       -- Sincronizacao de politica
        'auto_recovery',     -- Tentativa de auto-recovery
        'heartbeat',         -- Heartbeat enviado
        'update_applied',    -- Update aplicado
        'error',             -- Erro ocorrido
        'policy_drift',      -- Drift de politica detectado
        'security_event'     -- Evento de seguranca
    )),
    event_data JSONB NOT NULL DEFAULT '{}',
    evidence_hash TEXT NOT NULL, -- SHA256 do event_data para integridade
    state_before TEXT,           -- Estado antes do evento
    state_after TEXT,            -- Estado depois do evento
    severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para queries de compliance e auditoria
CREATE INDEX idx_evidence_tenant_date ON public.agent_evidence_logs(tenant_id, created_at DESC);
CREATE INDEX idx_evidence_agent_date ON public.agent_evidence_logs(agent_id, created_at DESC);
CREATE INDEX idx_evidence_type ON public.agent_evidence_logs(event_type);
CREATE INDEX idx_evidence_severity ON public.agent_evidence_logs(severity) WHERE severity IN ('warning', 'error', 'critical');
CREATE INDEX idx_evidence_hash ON public.agent_evidence_logs(evidence_hash);

-- Enable RLS
ALTER TABLE public.agent_evidence_logs ENABLE ROW LEVEL SECURITY;

-- Policies: users can view their tenant's evidence
CREATE POLICY "Users can view tenant evidence"
ON public.agent_evidence_logs
FOR SELECT
USING (
    tenant_id IN (
        SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
    )
);

-- Agents/Edge Functions can insert evidence (via service role)
CREATE POLICY "Service role can insert evidence"
ON public.agent_evidence_logs
FOR INSERT
WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.agent_evidence_logs IS 'Audit trail de eventos dos agentes v4.0+ para compliance e analise forense';

-- =============================================
-- Funcao para submeter evidencia de agente
-- =============================================
CREATE OR REPLACE FUNCTION public.submit_agent_evidence(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_agent_name TEXT,
    p_agent_version TEXT,
    p_event_type TEXT,
    p_event_data JSONB,
    p_evidence_hash TEXT,
    p_state_before TEXT DEFAULT NULL,
    p_state_after TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT 'info'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO agent_evidence_logs (
        tenant_id, agent_id, agent_name, agent_version,
        event_type, event_data, evidence_hash,
        state_before, state_after, severity
    ) VALUES (
        p_tenant_id, p_agent_id, p_agent_name, p_agent_version,
        p_event_type, p_event_data, p_evidence_hash,
        p_state_before, p_state_after, p_severity
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;