-- =====================================================
-- FASE 1: TWO-MAN-RULE & POLICY ENGINE HIERARQUICO
-- =====================================================

-- Tabela de cadeias de aprovacao
CREATE TABLE public.approval_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  min_approvers INTEGER NOT NULL DEFAULT 2 CHECK (min_approvers >= 1 AND min_approvers <= 5),
  timeout_hours INTEGER NOT NULL DEFAULT 24 CHECK (timeout_hours >= 1 AND timeout_hours <= 168),
  applies_to_actions TEXT[] NOT NULL DEFAULT ARRAY['isolate', 'kill_process', 'stop_service', 'disable_service', 'revoke_token', 'quarantine', 'network_isolate'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de requisicoes de aprovacao
CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chain_id UUID REFERENCES public.approval_chains(id) ON DELETE SET NULL,
  playbook_execution_id UUID REFERENCES public.playbook_executions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}',
  target_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed')),
  required_approvers INTEGER NOT NULL DEFAULT 2,
  current_approvers INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de aprovacoes individuais
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL REFERENCES auth.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, approved_by) -- Um usuario so pode aprovar/rejeitar uma vez
);

-- =====================================================
-- FASE 2: NARRATIVA EXECUTIVA CONTINUA
-- =====================================================

-- Tabela de snapshots de delta de risco
CREATE TABLE public.risk_delta_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  risk_score_start NUMERIC(5,2),
  risk_score_end NUMERIC(5,2),
  delta NUMERIC(5,2) GENERATED ALWAYS AS (risk_score_end - risk_score_start) STORED,
  threats_blocked INTEGER NOT NULL DEFAULT 0,
  incidents_prevented INTEGER NOT NULL DEFAULT 0,
  actions_executed INTEGER NOT NULL DEFAULT 0,
  actions_pending_approval INTEGER NOT NULL DEFAULT 0,
  estimated_cost_avoided NUMERIC(12,2), -- Em reais
  executive_summary TEXT, -- Gerado por AI
  key_events JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, snapshot_date)
);

-- =====================================================
-- FASE 3: EXPORTACAO AUDIT-READY
-- =====================================================

-- Tabela de bundles de evidencia exportados
CREATE TABLE public.evidence_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  audit_id TEXT NOT NULL UNIQUE, -- ID publico para verificacao
  bundle_type TEXT NOT NULL DEFAULT 'incident' CHECK (bundle_type IN ('incident', 'compliance', 'audit', 'custom')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  manifest_hash TEXT NOT NULL, -- SHA256 do manifesto completo
  included_evidence JSONB NOT NULL DEFAULT '{}', -- { logs: true, signatures: true, chain: true }
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  download_url TEXT,
  download_expires_at TIMESTAMPTZ,
  verification_url TEXT, -- URL publica para verificar
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- FASE 4: INCIDENT TIMELINE NARRATIVA
-- =====================================================

-- Tabela de incidentes reconstruidos
CREATE TABLE public.incident_timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  narrative_summary TEXT, -- Resumo narrativo gerado
  timeline_events JSONB NOT NULL DEFAULT '[]', -- Array de eventos ordenados
  causal_chain JSONB NOT NULL DEFAULT '[]', -- Cadeia causal
  root_cause TEXT,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'contained', 'resolved', 'closed')),
  started_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Approval Chains
ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approval chains in their tenant"
ON public.approval_chains FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage approval chains"
ON public.approval_chains FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Approval Requests
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approval requests in their tenant"
ON public.approval_requests FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can create approval requests"
ON public.approval_requests FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'operator')));

CREATE POLICY "System can update approval requests"
ON public.approval_requests FOR UPDATE
USING (true);

-- Approvals
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approvals in their tenant"
ON public.approvals FOR SELECT
USING (request_id IN (SELECT id FROM approval_requests WHERE tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())));

CREATE POLICY "Admins can create approvals"
ON public.approvals FOR INSERT
WITH CHECK (request_id IN (SELECT id FROM approval_requests WHERE tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))));

-- Risk Delta Snapshots
ALTER TABLE public.risk_delta_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view risk snapshots in their tenant"
ON public.risk_delta_snapshots FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Service role can insert risk snapshots"
ON public.risk_delta_snapshots FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update risk snapshots"
ON public.risk_delta_snapshots FOR UPDATE
USING (true);

-- Evidence Bundles
ALTER TABLE public.evidence_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence bundles in their tenant"
ON public.evidence_bundles FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can create evidence bundles"
ON public.evidence_bundles FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Incident Timelines
ALTER TABLE public.incident_timelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view incident timelines in their tenant"
ON public.incident_timelines FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage incident timelines"
ON public.incident_timelines FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Funcao para submeter aprovacao (Two-Man-Rule)
CREATE OR REPLACE FUNCTION public.submit_approval(
  p_request_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_approval_count INTEGER;
  v_user_id UUID;
  v_tenant_id UUID;
  v_already_voted BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  -- Verificar se usuario esta autenticado
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Buscar request
  SELECT * INTO v_request FROM approval_requests WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  -- Verificar se usuario tem permissao no tenant
  SELECT tenant_id INTO v_tenant_id FROM user_roles 
  WHERE user_id = v_user_id AND tenant_id = v_request.tenant_id AND role IN ('admin', 'super_admin')
  LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: insufficient permissions');
  END IF;
  
  -- Verificar se request ainda esta pendente
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is no longer pending', 'status', v_request.status);
  END IF;
  
  -- Verificar se nao expirou
  IF v_request.expires_at < NOW() THEN
    UPDATE approval_requests SET status = 'expired' WHERE id = p_request_id;
    RETURN jsonb_build_object('success', false, 'error', 'Request has expired');
  END IF;
  
  -- Verificar se e o mesmo usuario que criou (nao pode aprovar propria request)
  IF v_request.requested_by = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot approve your own request');
  END IF;
  
  -- Verificar se ja votou
  SELECT EXISTS(SELECT 1 FROM approvals WHERE request_id = p_request_id AND approved_by = v_user_id) INTO v_already_voted;
  
  IF v_already_voted THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already voted on this request');
  END IF;
  
  -- Registrar aprovacao
  INSERT INTO approvals (request_id, approved_by, decision, reason)
  VALUES (p_request_id, v_user_id, p_decision, p_reason);
  
  -- Se rejeitado, marcar request como rejeitada
  IF p_decision = 'rejected' THEN
    UPDATE approval_requests 
    SET status = 'rejected', rejection_reason = p_reason
    WHERE id = p_request_id;
    
    -- Log no risk_decision_log
    INSERT INTO risk_decision_log (tenant_id, decision_type, trigger_source, trigger_id, decision, reasoning, metadata)
    VALUES (v_request.tenant_id, 'approval_rejected', 'two_man_rule', p_request_id::text, 'rejected', 
            COALESCE(p_reason, 'Rejected by admin'), 
            jsonb_build_object('rejected_by', v_user_id, 'action_type', v_request.action_type));
    
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'message', 'Request rejected');
  END IF;
  
  -- Contar aprovacoes
  SELECT COUNT(*) INTO v_approval_count FROM approvals WHERE request_id = p_request_id AND decision = 'approved';
  
  -- Atualizar contador
  UPDATE approval_requests SET current_approvers = v_approval_count WHERE id = p_request_id;
  
  -- Verificar se atingiu quorum
  IF v_approval_count >= v_request.required_approvers THEN
    UPDATE approval_requests 
    SET status = 'approved', approved_at = NOW()
    WHERE id = p_request_id;
    
    -- Log no risk_decision_log
    INSERT INTO risk_decision_log (tenant_id, decision_type, trigger_source, trigger_id, decision, reasoning, metadata)
    VALUES (v_request.tenant_id, 'approval_granted', 'two_man_rule', p_request_id::text, 'approved', 
            'Quorum reached: ' || v_approval_count || '/' || v_request.required_approvers || ' approvers',
            jsonb_build_object('approvers_count', v_approval_count, 'action_type', v_request.action_type));
    
    RETURN jsonb_build_object('success', true, 'status', 'approved', 'message', 'Quorum reached - action approved', 'approvers', v_approval_count);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'status', 'pending', 'message', 'Vote recorded', 'current_approvers', v_approval_count, 'required', v_request.required_approvers);
END;
$$;

-- Funcao para reconstruir timeline de incidente
CREATE OR REPLACE FUNCTION public.reconstruct_incident_timeline(
  p_agent_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_events JSONB := '[]';
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Verificar permissao
  SELECT a.tenant_id INTO v_tenant_id 
  FROM agents a
  JOIN user_roles ur ON ur.tenant_id = a.tenant_id
  WHERE a.id = p_agent_id AND ur.user_id = v_user_id
  LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized or agent not found');
  END IF;
  
  -- Coletar todos os eventos relevantes
  WITH all_events AS (
    -- Security events
    SELECT 
      'security_event' as event_type,
      id as source_id,
      created_at as event_time,
      severity,
      title as event_title,
      description as event_description,
      jsonb_build_object('status', status, 'data', data) as event_data
    FROM security_events
    WHERE agent_id = p_agent_id 
      AND created_at BETWEEN p_start_time AND p_end_time
    
    UNION ALL
    
    -- Jobs
    SELECT 
      'job' as event_type,
      id as source_id,
      created_at as event_time,
      CASE status WHEN 'failed' THEN 'high' ELSE 'low' END as severity,
      type as event_title,
      COALESCE(error_message, 'Job ' || status) as event_description,
      jsonb_build_object('status', status, 'result', result) as event_data
    FROM jobs
    WHERE agent_id = p_agent_id 
      AND created_at BETWEEN p_start_time AND p_end_time
    
    UNION ALL
    
    -- Risk decisions
    SELECT 
      'risk_decision' as event_type,
      id as source_id,
      created_at as event_time,
      CASE decision WHEN 'blocked' THEN 'critical' WHEN 'approved' THEN 'low' ELSE 'medium' END as severity,
      decision_type as event_title,
      reasoning as event_description,
      metadata as event_data
    FROM risk_decision_log
    WHERE tenant_id = v_tenant_id 
      AND created_at BETWEEN p_start_time AND p_end_time
      AND (metadata->>'agent_id' = p_agent_id::text OR trigger_id IN (
        SELECT id::text FROM playbook_executions WHERE agent_id = p_agent_id
      ))
    
    UNION ALL
    
    -- Playbook executions
    SELECT 
      'playbook_execution' as event_type,
      pe.id as source_id,
      pe.triggered_at as event_time,
      CASE pe.status WHEN 'failed' THEN 'high' ELSE 'medium' END as severity,
      p.name as event_title,
      'Playbook ' || pe.status as event_description,
      jsonb_build_object('status', pe.status, 'actions', pe.snapshot_data->'actions') as event_data
    FROM playbook_executions pe
    JOIN playbooks p ON p.id = pe.playbook_id
    WHERE pe.agent_id = p_agent_id 
      AND pe.triggered_at BETWEEN p_start_time AND p_end_time
    
    UNION ALL
    
    -- System alerts
    SELECT 
      'system_alert' as event_type,
      id as source_id,
      created_at as event_time,
      severity,
      alert_type as event_title,
      message as event_description,
      jsonb_build_object('resolved', resolved, 'resolved_at', resolved_at) as event_data
    FROM system_alerts
    WHERE agent_id = p_agent_id 
      AND created_at BETWEEN p_start_time AND p_end_time
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'event_type', event_type,
      'source_id', source_id,
      'event_time', event_time,
      'severity', severity,
      'title', event_title,
      'description', event_description,
      'data', event_data
    ) ORDER BY event_time ASC
  ) INTO v_events
  FROM all_events;
  
  RETURN jsonb_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'tenant_id', v_tenant_id,
    'period', jsonb_build_object('start', p_start_time, 'end', p_end_time),
    'events_count', jsonb_array_length(COALESCE(v_events, '[]'::jsonb)),
    'timeline', COALESCE(v_events, '[]'::jsonb)
  );
END;
$$;

-- Funcao para criar request de aprovacao (two-man-rule)
CREATE OR REPLACE FUNCTION public.create_approval_request(
  p_action_type TEXT,
  p_action_payload JSONB,
  p_target_agent_id UUID DEFAULT NULL,
  p_playbook_execution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_chain RECORD;
  v_request_id UUID;
  v_timeout_hours INTEGER := 24;
  v_min_approvers INTEGER := 2;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Buscar tenant do usuario
  SELECT tenant_id INTO v_tenant_id FROM user_roles 
  WHERE user_id = v_user_id AND role IN ('admin', 'super_admin', 'operator')
  LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;
  
  -- Buscar chain aplicavel
  SELECT * INTO v_chain FROM approval_chains 
  WHERE tenant_id = v_tenant_id 
    AND is_active = true 
    AND p_action_type = ANY(applies_to_actions)
  ORDER BY min_approvers DESC
  LIMIT 1;
  
  IF v_chain IS NOT NULL THEN
    v_timeout_hours := v_chain.timeout_hours;
    v_min_approvers := v_chain.min_approvers;
  END IF;
  
  -- Criar request
  INSERT INTO approval_requests (
    tenant_id, chain_id, playbook_execution_id, action_type, action_payload,
    target_agent_id, requested_by, required_approvers, expires_at
  ) VALUES (
    v_tenant_id, v_chain.id, p_playbook_execution_id, p_action_type, p_action_payload,
    p_target_agent_id, v_user_id, v_min_approvers, NOW() + (v_timeout_hours || ' hours')::interval
  )
  RETURNING id INTO v_request_id;
  
  -- Log
  INSERT INTO risk_decision_log (tenant_id, decision_type, trigger_source, trigger_id, decision, reasoning, metadata)
  VALUES (v_tenant_id, 'approval_requested', 'two_man_rule', v_request_id::text, 'pending',
          'Approval request created for ' || p_action_type,
          jsonb_build_object('requested_by', v_user_id, 'action_type', p_action_type, 'required_approvers', v_min_approvers));
  
  RETURN jsonb_build_object(
    'success', true, 
    'request_id', v_request_id,
    'required_approvers', v_min_approvers,
    'expires_at', NOW() + (v_timeout_hours || ' hours')::interval
  );
END;
$$;

-- Indexes para performance
CREATE INDEX idx_approval_requests_tenant_status ON approval_requests(tenant_id, status);
CREATE INDEX idx_approval_requests_expires ON approval_requests(expires_at) WHERE status = 'pending';
CREATE INDEX idx_approvals_request ON approvals(request_id);
CREATE INDEX idx_risk_delta_tenant_date ON risk_delta_snapshots(tenant_id, snapshot_date DESC);
CREATE INDEX idx_evidence_bundles_audit_id ON evidence_bundles(audit_id);
CREATE INDEX idx_incident_timelines_tenant_status ON incident_timelines(tenant_id, status);
CREATE INDEX idx_incident_timelines_agent ON incident_timelines(agent_id) WHERE agent_id IS NOT NULL;