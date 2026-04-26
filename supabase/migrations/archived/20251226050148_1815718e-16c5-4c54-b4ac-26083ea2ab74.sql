-- =====================================================
-- SAFE_MODE COMPLETO - FASE 1 + 2 COMBINADAS
-- =====================================================

-- 1.1 Extensao da tabela agents com campos SAFE_MODE
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS agent_mode TEXT DEFAULT 'NORMAL',
ADD COLUMN IF NOT EXISTS safe_mode_reason TEXT,
ADD COLUMN IF NOT EXISTS safe_mode_entered_at TIMESTAMPTZ;

-- 1.2 Criar tabela forensic_snapshots
CREATE TABLE IF NOT EXISTS public.forensic_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN (
    'safe_mode', 'security_event', 'job_critical_failure',
    'integrity_violation', 'manual', 'slo_violation'
  )),
  trigger_event_id UUID,
  config_snapshot JSONB DEFAULT '{}',
  process_snapshot JSONB DEFAULT '{}',
  network_snapshot JSONB DEFAULT '[]',
  system_liveness_snapshot JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
);

CREATE INDEX IF NOT EXISTS idx_forensic_snapshots_agent 
ON public.forensic_snapshots(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forensic_snapshots_tenant 
ON public.forensic_snapshots(tenant_id, created_at DESC);

ALTER TABLE public.forensic_snapshots
ADD CONSTRAINT uniq_snapshot_per_event
UNIQUE (trigger_event_id, trigger_reason);

ALTER TABLE public.forensic_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view forensic snapshots in their tenant"
ON public.forensic_snapshots FOR SELECT
USING (tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
));

CREATE POLICY "Service role can insert forensic snapshots"
ON public.forensic_snapshots FOR INSERT
WITH CHECK (true);

-- 1.3 Criar tabela agent_safe_mode_events
CREATE TABLE IF NOT EXISTS public.agent_safe_mode_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'update_rollback', 'crash_loop', 'job_failure_loop',
    'integrity_violation', 'watchdog_timeout', 'manual'
  )),
  failure_count INTEGER DEFAULT 0,
  agent_version TEXT,
  execution_hash TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safe_mode_events_agent 
ON public.agent_safe_mode_events(agent_id, created_at DESC);

ALTER TABLE public.agent_safe_mode_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view safe mode events"
ON public.agent_safe_mode_events FOR SELECT
USING (tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
));

CREATE POLICY "Service role can insert safe mode events"
ON public.agent_safe_mode_events FOR INSERT
WITH CHECK (true);

-- 1.4 Criar tabela agent_recovery_authorizations
CREATE TABLE IF NOT EXISTS public.agent_recovery_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  safe_mode_event_id UUID REFERENCES public.agent_safe_mode_events(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requested_by UUID NOT NULL,
  approved_by UUID,
  signed_payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'used')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_auth_agent 
ON public.agent_recovery_authorizations(agent_id, created_at DESC);

ALTER TABLE public.agent_recovery_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recovery authorizations"
ON public.agent_recovery_authorizations FOR ALL
USING (tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur 
  WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
));

-- 1.5 Criar tabela system_liveness
CREATE TABLE IF NOT EXISTS public.system_liveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name TEXT NOT NULL UNIQUE,
  expected_interval_seconds INTEGER NOT NULL DEFAULT 300,
  last_heartbeat TIMESTAMPTZ,
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.system_liveness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system liveness"
ON public.system_liveness FOR SELECT USING (true);

-- 1.6 Criar tabela blast_radius_policies (necessaria para validate_blast_radius)
CREATE TABLE IF NOT EXISTS public.blast_radius_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  max_affected_percent NUMERIC(5,2) DEFAULT 10.00,
  max_affected_count INTEGER DEFAULT 10,
  require_approval_above NUMERIC(5,2) DEFAULT 5.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, action_type)
);

ALTER TABLE public.blast_radius_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage blast radius policies"
ON public.blast_radius_policies FOR ALL
USING (tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur 
  WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
));

-- 2.1 Trigger anti-modificacao de forensic_snapshots
CREATE OR REPLACE FUNCTION public.enforce_forensic_snapshot_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: forensic snapshots cannot be modified or deleted'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_forensic_immutable ON public.forensic_snapshots;
CREATE TRIGGER trg_forensic_immutable
BEFORE UPDATE OR DELETE ON public.forensic_snapshots
FOR EACH ROW EXECUTE FUNCTION public.enforce_forensic_snapshot_immutability();

-- 2.2 Bloqueio de jobs em SAFE_MODE
CREATE OR REPLACE FUNCTION public.prevent_jobs_on_safe_mode()
RETURNS TRIGGER AS $$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT agent_mode INTO v_mode
  FROM public.agents WHERE id = NEW.agent_id;

  IF v_mode = 'SAFE_MODE' 
     AND NEW.type NOT IN ('recovery_check', 'health_report', 'heartbeat') THEN
    RAISE EXCEPTION 'SAFE_MODE_ACTIVE: job blocked for agent %', NEW.agent_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_safe_mode_jobs ON public.jobs;
CREATE TRIGGER trg_enforce_safe_mode_jobs
BEFORE INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.prevent_jobs_on_safe_mode();

-- 2.3 Funcao para capturar snapshot forense
CREATE OR REPLACE FUNCTION public.capture_forensic_snapshot_full(
  p_agent_id UUID,
  p_trigger_reason TEXT,
  p_trigger_event_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_snapshot_id UUID;
  v_config JSONB;
  v_process JSONB;
  v_network JSONB;
  v_liveness JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Agent not found'; END IF;
  
  SELECT jsonb_build_object('agent', to_jsonb(a.*)) INTO v_config
  FROM agents a WHERE a.id = p_agent_id;
  
  SELECT jsonb_build_object(
    'recent_jobs', (SELECT jsonb_agg(j.*) FROM (
      SELECT * FROM jobs WHERE agent_id = p_agent_id ORDER BY created_at DESC LIMIT 20
    ) j)
  ) INTO v_process;
  
  SELECT jsonb_agg(n.*) INTO v_network
  FROM agent_network_info n WHERE n.agent_id = p_agent_id LIMIT 5;
  
  SELECT jsonb_agg(l.*) INTO v_liveness FROM system_liveness l;
  
  INSERT INTO forensic_snapshots (
    agent_id, tenant_id, trigger_reason, trigger_event_id,
    config_snapshot, process_snapshot, network_snapshot,
    system_liveness_snapshot, metadata
  ) VALUES (
    p_agent_id, v_tenant_id, p_trigger_reason, 
    COALESCE(p_trigger_event_id, gen_random_uuid()),
    COALESCE(v_config, '{}'), COALESCE(v_process, '{}'),
    COALESCE(v_network, '[]'), COALESCE(v_liveness, '[]'), p_metadata
  )
  ON CONFLICT (trigger_event_id, trigger_reason) DO NOTHING
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$$;

-- 2.4 Funcao para processar SAFE_MODE
CREATE OR REPLACE FUNCTION public.process_safe_mode_entry(
  p_agent_id UUID,
  p_reason TEXT,
  p_entered_at TIMESTAMPTZ,
  p_failure_count INTEGER DEFAULT 0,
  p_agent_version TEXT DEFAULT NULL,
  p_execution_hash TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_event_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Agent not found'; END IF;
  
  UPDATE agents SET
    agent_mode = 'SAFE_MODE',
    safe_mode_reason = p_reason,
    safe_mode_entered_at = p_entered_at
  WHERE id = p_agent_id;
  
  INSERT INTO agent_safe_mode_events (
    agent_id, tenant_id, entered_at, reason,
    failure_count, agent_version, execution_hash
  ) VALUES (
    p_agent_id, v_tenant_id, p_entered_at, p_reason,
    p_failure_count, p_agent_version, p_execution_hash
  ) RETURNING id INTO v_event_id;
  
  PERFORM capture_forensic_snapshot_full(p_agent_id, 'safe_mode', v_event_id);
  
  INSERT INTO system_alerts (tenant_id, agent_id, alert_type, severity, message, data)
  VALUES (v_tenant_id, p_agent_id, 'safe_mode_activated', 'critical',
    format('Agent entered SAFE_MODE: %s', p_reason),
    jsonb_build_object('event_id', v_event_id, 'reason', p_reason));
  
  RETURN v_event_id;
END;
$$;

-- 2.5 Funcao para autorizar recovery
CREATE OR REPLACE FUNCTION public.authorize_agent_recovery(
  p_agent_id UUID,
  p_approved_by UUID,
  p_expires_in_minutes INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_mode TEXT;
  v_event_id UUID;
  v_auth_id UUID;
  v_payload JSONB;
BEGIN
  SELECT tenant_id, agent_mode INTO v_tenant_id, v_mode FROM agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agent not found'); END IF;
  IF v_mode != 'SAFE_MODE' THEN RETURN jsonb_build_object('success', false, 'error', 'Not in SAFE_MODE'); END IF;
  
  SELECT id INTO v_event_id FROM agent_safe_mode_events
  WHERE agent_id = p_agent_id AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1;
  
  v_payload := jsonb_build_object(
    'agent_id', p_agent_id,
    'transition', 'SAFE_MODE ? RECOVERY',
    'issued_at', NOW(),
    'expires_at', NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL,
    'approved_by', p_approved_by
  );
  
  INSERT INTO agent_recovery_authorizations (
    agent_id, tenant_id, safe_mode_event_id, requested_by, approved_by,
    signed_payload, status, expires_at
  ) VALUES (
    p_agent_id, v_tenant_id, v_event_id, p_approved_by, p_approved_by,
    v_payload, 'approved', NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL
  ) RETURNING id INTO v_auth_id;
  
  UPDATE agents SET agent_mode = 'RECOVERY' WHERE id = p_agent_id;
  
  RETURN jsonb_build_object('success', true, 'authorization_id', v_auth_id, 'signed_payload', v_payload);
END;
$$;

-- 2.6 Validar blast radius
CREATE OR REPLACE FUNCTION public.validate_blast_radius(
  p_tenant_id UUID,
  p_action_type TEXT,
  p_target_agent_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_total INTEGER;
  v_affected INTEGER;
  v_percent NUMERIC;
  v_decision TEXT;
  v_reason TEXT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM agents WHERE tenant_id = p_tenant_id AND status = 'active';
  v_affected := COALESCE(array_length(p_target_agent_ids, 1), 0);
  v_percent := CASE WHEN v_total > 0 THEN (v_affected::NUMERIC / v_total) * 100 ELSE 0 END;
  
  SELECT * INTO v_policy FROM blast_radius_policies
  WHERE tenant_id = p_tenant_id AND action_type = p_action_type AND is_active = true;
  
  IF NOT FOUND THEN
    v_policy.max_affected_percent := 10.00;
    v_policy.max_affected_count := 10;
    v_policy.require_approval_above := 5.00;
  END IF;
  
  IF v_percent > v_policy.max_affected_percent THEN
    v_decision := 'blocked'; v_reason := 'Exceeds max percent';
  ELSIF v_policy.max_affected_count IS NOT NULL AND v_affected > v_policy.max_affected_count THEN
    v_decision := 'blocked'; v_reason := 'Exceeds max count';
  ELSIF v_percent >= v_policy.require_approval_above THEN
    v_decision := 'requires_approval'; v_reason := 'Requires approval';
  ELSE
    v_decision := 'allowed'; v_reason := 'Within limits';
  END IF;
  
  INSERT INTO risk_decision_log (tenant_id, event_type, decision, decision_reason, context)
  VALUES (p_tenant_id, 'blast_radius', v_decision, v_reason, jsonb_build_object(
    'action', p_action_type, 'affected', v_affected, 'total', v_total, 'percent', v_percent
  ));
  
  RETURN jsonb_build_object(
    'decision', v_decision, 'allowed', v_decision != 'blocked',
    'requires_approval', v_decision = 'requires_approval',
    'affected_percent', ROUND(v_percent, 2), 'reason', v_reason
  );
END;
$$;