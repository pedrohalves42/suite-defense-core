-- ============================================
-- FASE 1-4: Seguranca Avancada - Tabelas e Funcoes
-- ============================================

-- 1. Tabela de regras de segregacao de funcoes (Two-Man-Rule expandido)
CREATE TABLE IF NOT EXISTS public.segregation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  min_approvers integer NOT NULL DEFAULT 2,
  required_roles text[] NOT NULL DEFAULT '{}',
  exclude_requester boolean NOT NULL DEFAULT true,
  require_different_departments boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, action_type)
);

-- RLS para segregation_rules
ALTER TABLE public.segregation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view segregation rules for their tenant" ON public.segregation_rules;
CREATE POLICY "Users can view segregation rules for their tenant"
ON public.segregation_rules FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage segregation rules" ON public.segregation_rules;
CREATE POLICY "Admins can manage segregation rules"
ON public.segregation_rules FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.tenant_id = segregation_rules.tenant_id
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- 2. Adicionar politica de MFA por tenant
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS mfa_policy jsonb DEFAULT '{
  "require_mfa_all_users": false,
  "require_mfa_roles": ["admin", "super_admin"],
  "mfa_grace_period_hours": 72
}'::jsonb;

-- 3. Adicionar colunas de rotacao de tokens em agent_tokens
ALTER TABLE public.agent_tokens 
ADD COLUMN IF NOT EXISTS rotation_required_at timestamptz,
ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz,
ADD COLUMN IF NOT EXISTS rotation_policy_days integer DEFAULT 90;

-- Indice para buscar tokens que precisam de rotacao
CREATE INDEX IF NOT EXISTS idx_agent_tokens_rotation 
ON public.agent_tokens(rotation_required_at) 
WHERE rotation_required_at IS NOT NULL;

-- 4. Tabela de anomalias de IA
CREATE TABLE IF NOT EXISTS public.ai_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  function_name text NOT NULL,
  anomaly_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  context jsonb NOT NULL DEFAULT '{}',
  detected_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  resolution text,
  created_at timestamptz DEFAULT now()
);

-- RLS para ai_anomalies
ALTER TABLE public.ai_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view anomalies for their tenant" ON public.ai_anomalies;
CREATE POLICY "Users can view anomalies for their tenant"
ON public.ai_anomalies FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage anomalies" ON public.ai_anomalies;
CREATE POLICY "Admins can manage anomalies"
ON public.ai_anomalies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.tenant_id = ai_anomalies.tenant_id
    AND ur.role IN ('admin', 'super_admin', 'analyst')
  )
);

-- Indices para ai_anomalies
CREATE INDEX IF NOT EXISTS idx_ai_anomalies_tenant ON public.ai_anomalies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_anomalies_severity ON public.ai_anomalies(severity) WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_anomalies_detected ON public.ai_anomalies(detected_at DESC);

-- 5. View de saude de agentes por no
CREATE OR REPLACE VIEW public.v_agent_health_by_node AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.status,
  a.tenant_id,
  a.last_heartbeat,
  CASE 
    WHEN a.status = 'offline' OR a.status = 'inactive' THEN 'critical'
    WHEN a.last_heartbeat IS NULL THEN 'warning'
    WHEN a.last_heartbeat < now() - interval '30 minutes' THEN 'critical'
    WHEN a.last_heartbeat < now() - interval '15 minutes' THEN 'warning'
    ELSE 'healthy'
  END as health_status,
  EXTRACT(EPOCH FROM (now() - a.last_heartbeat)) / 60 as minutes_since_heartbeat,
  (SELECT COUNT(*) FROM public.jobs j 
   WHERE j.agent_id = a.id 
   AND j.status = 'failed' 
   AND j.created_at > now() - interval '1 hour') as recent_failures,
  (SELECT COUNT(*) FROM public.failed_jobs_dlq d 
   WHERE d.agent_id = a.id 
   AND d.status = 'pending') as pending_dlq,
  (SELECT COUNT(*) FROM public.agent_safe_mode_events sm
   WHERE sm.agent_id = a.id
   AND sm.resolved_at IS NULL) as active_safe_mode_events
FROM public.agents a
WHERE a.status != 'archived';

-- 6. Tabela de alertas persistentes para falhas criticas
CREATE TABLE IF NOT EXISTS public.persistent_failure_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  failure_count integer NOT NULL DEFAULT 1,
  first_failure_at timestamptz NOT NULL DEFAULT now(),
  last_failure_at timestamptz NOT NULL DEFAULT now(),
  last_alert_sent_at timestamptz,
  is_acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  resolution_notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- RLS para persistent_failure_alerts
ALTER TABLE public.persistent_failure_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view persistent alerts for their tenant" ON public.persistent_failure_alerts;
CREATE POLICY "Users can view persistent alerts for their tenant"
ON public.persistent_failure_alerts FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Operators can acknowledge alerts" ON public.persistent_failure_alerts;
CREATE POLICY "Operators can acknowledge alerts"
ON public.persistent_failure_alerts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.tenant_id = persistent_failure_alerts.tenant_id
    AND ur.role IN ('admin', 'super_admin', 'operator')
  )
);

-- Indice para buscar alertas nao reconhecidos
CREATE INDEX IF NOT EXISTS idx_persistent_alerts_unack 
ON public.persistent_failure_alerts(tenant_id, is_acknowledged) 
WHERE is_acknowledged = false;

-- 7. Funcao RPC para verificar permissao de segregacao (com search_path)
CREATE OR REPLACE FUNCTION public.check_segregation_rule(
  _tenant_id uuid,
  _action_type text,
  _requester_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.segregation_rules%ROWTYPE;
  v_requester_role text;
BEGIN
  SELECT * INTO v_rule
  FROM public.segregation_rules
  WHERE tenant_id = _tenant_id
    AND action_type = _action_type
    AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'requires_approval', false,
      'min_approvers', 1
    );
  END IF;
  
  SELECT role::text INTO v_requester_role
  FROM public.user_roles
  WHERE user_id = _requester_id
    AND tenant_id = _tenant_id
  LIMIT 1;
  
  RETURN jsonb_build_object(
    'requires_approval', true,
    'min_approvers', v_rule.min_approvers,
    'required_roles', v_rule.required_roles,
    'exclude_requester', v_rule.exclude_requester,
    'requester_role', v_requester_role
  );
END;
$$;

-- 8. Funcao RPC para obter politica de MFA do tenant (com search_path)
CREATE OR REPLACE FUNCTION public.get_tenant_mfa_policy(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(mfa_policy, '{
    "require_mfa_all_users": false,
    "require_mfa_roles": ["admin", "super_admin"],
    "mfa_grace_period_hours": 72
  }'::jsonb)
  FROM public.tenants
  WHERE id = _tenant_id;
$$;

-- 9. Inserir regras de segregacao padrao
INSERT INTO public.segregation_rules (tenant_id, action_type, min_approvers, required_roles, exclude_requester)
SELECT 
  t.id,
  action_type,
  min_approvers,
  required_roles::text[],
  exclude_requester
FROM public.tenants t
CROSS JOIN (VALUES 
  ('role_change', 2, ARRAY['admin', 'super_admin'], true),
  ('agent_delete', 2, ARRAY['admin', 'super_admin'], true),
  ('policy_deploy', 2, ARRAY['admin', 'super_admin', 'analyst'], true),
  ('tenant_settings_change', 2, ARRAY['admin', 'super_admin'], true)
) AS defaults(action_type, min_approvers, required_roles, exclude_requester)
ON CONFLICT (tenant_id, action_type) DO NOTHING;