-- =============================================
-- SISTEMA DE PLAYBOOKS - CyberShield
-- =============================================

-- Tabela principal de Playbooks
CREATE TABLE public.playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- 'agent_offline', 'dns_blocked', 'job_failed', 'integrity_low', 'manual'
  trigger_conditions JSONB NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_system BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  require_approval BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Acoes do Playbook (ordenadas)
CREATE TABLE public.playbook_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES public.playbooks(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  action_type TEXT NOT NULL, -- 'notify', 'isolate', 'generate_report', 'create_job', 'revoke_token', 'escalate'
  label TEXT NOT NULL,
  description TEXT,
  action_payload JSONB NOT NULL DEFAULT '{}',
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playbook_id, order_index)
);

-- Registro de execucoes de Playbooks
CREATE TABLE public.playbook_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES public.playbooks(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  trigger_event_id UUID,
  trigger_source TEXT, -- 'system_alerts', 'security_events', 'manual', 'ai_insights'
  trigger_context JSONB DEFAULT '{}',
  triggered_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'ignored')),
  executed_by UUID,
  actions_taken JSONB DEFAULT '[]',
  evidence_ids UUID[] DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  notes TEXT,
  ignore_reason TEXT
);

-- Indices para performance
CREATE INDEX idx_playbooks_tenant ON public.playbooks(tenant_id);
CREATE INDEX idx_playbooks_trigger_type ON public.playbooks(trigger_type);
CREATE INDEX idx_playbooks_enabled ON public.playbooks(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_playbook_actions_playbook ON public.playbook_actions(playbook_id);
CREATE INDEX idx_playbook_executions_tenant ON public.playbook_executions(tenant_id);
CREATE INDEX idx_playbook_executions_status ON public.playbook_executions(status);
CREATE INDEX idx_playbook_executions_pending ON public.playbook_executions(tenant_id, status) WHERE status = 'pending';
CREATE INDEX idx_playbook_executions_agent ON public.playbook_executions(agent_id);

-- RLS para playbooks
ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view playbooks in their tenant"
ON public.playbooks FOR SELECT
USING (
  is_system = true OR
  tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage playbooks in their tenant"
ON public.playbooks FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

-- RLS para playbook_actions
ALTER TABLE public.playbook_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view playbook actions"
ON public.playbook_actions FOR SELECT
USING (
  playbook_id IN (
    SELECT id FROM public.playbooks 
    WHERE is_system = true OR tenant_id IN (
      SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins can manage playbook actions"
ON public.playbook_actions FOR ALL
USING (
  playbook_id IN (
    SELECT id FROM public.playbooks 
    WHERE tenant_id IN (
      SELECT tenant_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  )
);

-- RLS para playbook_executions
ALTER TABLE public.playbook_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view executions in their tenant"
ON public.playbook_executions FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage executions in their tenant"
ON public.playbook_executions FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'operator')
  )
);

CREATE POLICY "Service role can insert executions"
ON public.playbook_executions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update executions"
ON public.playbook_executions FOR UPDATE
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_playbooks_updated_at
BEFORE UPDATE ON public.playbooks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- INSERIR 5 PLAYBOOKS PADRAO DO MVP (SYSTEM)
-- =============================================

-- PLAYBOOK 1: Computador Offline ha 24h
INSERT INTO public.playbooks (id, tenant_id, name, description, trigger_type, trigger_conditions, severity, is_system, require_approval)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  NULL,
  'Computador Offline ha 24h',
  'Resposta automatica quando um computador nao se comunica ha mais de 24 horas. Pode indicar desligamento, falha de rede ou tentativa de evasao.',
  'agent_offline',
  '{"hours_threshold": 24}',
  'high',
  true,
  true
);

INSERT INTO public.playbook_actions (playbook_id, order_index, action_type, label, description, action_payload, risk_level) VALUES
('a1000000-0000-0000-0000-000000000001', 1, 'notify', 'Notificar responsavel', 'Envia alerta por email/Telegram ao responsavel', '{"channels": ["email", "telegram"]}', 'low'),
('a1000000-0000-0000-0000-000000000001', 2, 'generate_report', 'Gerar relatorio de indisponibilidade', 'PDF com ultima comunicacao, historico e impacto estimado', '{"report_type": "availability", "include_history": true}', 'low'),
('a1000000-0000-0000-0000-000000000001', 3, 'create_job', 'Coletar diagnostico', 'Agenda job de diagnostico para quando o agente voltar', '{"job_type": "diagnostic_full", "priority": "high"}', 'low');

-- PLAYBOOK 2: DNS bloqueou multiplas tentativas
INSERT INTO public.playbooks (id, tenant_id, name, description, trigger_type, trigger_conditions, severity, is_system, require_approval)
VALUES (
  'a2000000-0000-0000-0000-000000000002',
  NULL,
  'DNS bloqueou multiplas tentativas',
  'Resposta quando um computador tenta acessar repetidamente dominios bloqueados. Pode indicar malware, phishing ou comportamento indevido.',
  'dns_blocked',
  '{"min_blocked_requests": 10, "time_window_hours": 1}',
  'critical',
  true,
  true
);

INSERT INTO public.playbook_actions (playbook_id, order_index, action_type, label, description, action_payload, risk_level) VALUES
('a2000000-0000-0000-0000-000000000002', 1, 'isolate', 'Isolar maquina', 'Bloqueia comunicacao externa exceto CyberShield', '{"isolation_level": "network", "allow_cybershield": true}', 'high'),
('a2000000-0000-0000-0000-000000000002', 2, 'generate_report', 'Gerar evidencia de seguranca', 'Lista de dominios, horarios, politica aplicada com hash e assinatura', '{"report_type": "security_evidence", "include_domains": true, "sign_evidence": true}', 'low'),
('a2000000-0000-0000-0000-000000000002', 3, 'escalate', 'Avisar auditor/gestor', 'Envia relatorio resumido e marca incidente como em analise', '{"notify_roles": ["admin", "auditor"], "create_incident": true}', 'low');

-- PLAYBOOK 3: Job critico falhou repetidamente
INSERT INTO public.playbooks (id, tenant_id, name, description, trigger_type, trigger_conditions, severity, is_system, require_approval)
VALUES (
  'a3000000-0000-0000-0000-000000000003',
  NULL,
  'Job critico falhou repetidamente',
  'Resposta quando uma tarefa critica falha repetidamente. O sistema nao conseguiu concluir a acao automaticamente.',
  'job_failed',
  '{"min_failures": 3, "critical_job_types": ["software_inventory_collect", "light_vuln_scan", "collect_antivirus_status"]}',
  'high',
  true,
  true
);

INSERT INTO public.playbook_actions (playbook_id, order_index, action_type, label, description, action_payload, risk_level) VALUES
('a3000000-0000-0000-0000-000000000003', 1, 'create_job', 'Reexecutar em modo seguro', 'Execucao isolada com verbose logging', '{"job_type": "retry_safe_mode", "verbose": true}', 'medium'),
('a3000000-0000-0000-0000-000000000003', 2, 'create_job', 'Coletar diagnostico do agente', 'CPU, disco, permissoes, estado do servico', '{"job_type": "diagnostic_full"}', 'low'),
('a3000000-0000-0000-0000-000000000003', 3, 'escalate', 'Escalar para administrador', 'Cria ticket interno com linha do tempo automatica', '{"create_ticket": true, "include_timeline": true}', 'low');

-- PLAYBOOK 4: Integridade do agente comprometida
INSERT INTO public.playbooks (id, tenant_id, name, description, trigger_type, trigger_conditions, severity, is_system, require_approval)
VALUES (
  'a4000000-0000-0000-0000-000000000004',
  NULL,
  'Integridade do agente comprometida',
  'Resposta quando o agente apresenta alteracao inesperada. Pode indicar corrupcao, interferencia ou ataque.',
  'integrity_low',
  '{"integrity_threshold": 80}',
  'critical',
  true,
  true
);

INSERT INTO public.playbook_actions (playbook_id, order_index, action_type, label, description, action_payload, risk_level) VALUES
('a4000000-0000-0000-0000-000000000004', 1, 'revoke_token', 'Revogar credenciais do agente', 'Invalida todos os tokens ativos do agente', '{"revoke_all": true}', 'high'),
('a4000000-0000-0000-0000-000000000004', 2, 'create_job', 'Forcar reinstalacao assinada', 'Agenda reinstalacao com versao assinada', '{"job_type": "force_reinstall", "use_signed": true}', 'high'),
('a4000000-0000-0000-0000-000000000004', 3, 'generate_report', 'Gerar relatorio de integridade', 'Relatorio completo de integridade com evidencias', '{"report_type": "integrity", "include_hashes": true}', 'low');

-- PLAYBOOK 5: Preparacao para auditoria (Manual)
INSERT INTO public.playbooks (id, tenant_id, name, description, trigger_type, trigger_conditions, severity, is_system, require_approval)
VALUES (
  'a5000000-0000-0000-0000-000000000005',
  NULL,
  'Preparacao para Auditoria',
  'Conjunto de acoes para preparar ambiente para auditoria de compliance. Executado manualmente.',
  'manual',
  '{}',
  'medium',
  true,
  false
);

INSERT INTO public.playbook_actions (playbook_id, order_index, action_type, label, description, action_payload, risk_level) VALUES
('a5000000-0000-0000-0000-000000000005', 1, 'generate_report', 'Gerar relatorio completo de compliance', 'Relatorio consolidado de conformidade', '{"report_type": "compliance_full", "include_all_agents": true}', 'low'),
('a5000000-0000-0000-0000-000000000005', 2, 'generate_report', 'Exportar evidencias dos ultimos 90 dias', 'Pacote de evidencias assinadas', '{"report_type": "evidence_export", "days_back": 90, "sign_package": true}', 'low'),
('a5000000-0000-0000-0000-000000000005', 3, 'create_job', 'Verificar integridade global', 'Job de verificacao em todos os agentes', '{"job_type": "integrity_check", "target": "all_agents"}', 'low');

-- Funcao para avaliar playbooks automaticamente
CREATE OR REPLACE FUNCTION public.evaluate_playbook_trigger(
  p_tenant_id UUID,
  p_trigger_type TEXT,
  p_agent_id UUID DEFAULT NULL,
  p_trigger_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_playbook RECORD;
  v_execution_id UUID;
  v_last_execution TIMESTAMPTZ;
BEGIN
  -- Buscar playbook ativo que match o trigger
  SELECT * INTO v_playbook
  FROM public.playbooks
  WHERE trigger_type = p_trigger_type
    AND is_enabled = true
    AND (tenant_id = p_tenant_id OR is_system = true)
  ORDER BY is_system ASC, created_at DESC
  LIMIT 1;
  
  IF v_playbook.id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Verificar cooldown
  SELECT MAX(triggered_at) INTO v_last_execution
  FROM public.playbook_executions
  WHERE playbook_id = v_playbook.id
    AND tenant_id = p_tenant_id
    AND agent_id IS NOT DISTINCT FROM p_agent_id
    AND status NOT IN ('cancelled', 'ignored');
  
  IF v_last_execution IS NOT NULL AND 
     v_last_execution > NOW() - (v_playbook.cooldown_minutes || ' minutes')::INTERVAL THEN
    RETURN NULL; -- Dentro do cooldown
  END IF;
  
  -- Criar execucao pendente
  INSERT INTO public.playbook_executions (
    playbook_id,
    tenant_id,
    agent_id,
    trigger_source,
    trigger_context,
    status
  ) VALUES (
    v_playbook.id,
    p_tenant_id,
    p_agent_id,
    p_trigger_type,
    p_trigger_context,
    CASE WHEN v_playbook.require_approval THEN 'pending' ELSE 'in_progress' END
  )
  RETURNING id INTO v_execution_id;
  
  RETURN v_execution_id;
END;
$$;

-- Grant execute para authenticated users
GRANT EXECUTE ON FUNCTION public.evaluate_playbook_trigger TO authenticated;

-- Enable realtime for playbook_executions (for live notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.playbook_executions;