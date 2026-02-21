
-- =============================================
-- FASE 1+2: Correções Críticas e Blindagem
-- =============================================

-- 1. Criar tabela soar_executions para rastrear execuções SOAR
CREATE TABLE IF NOT EXISTS public.soar_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  playbook_id UUID REFERENCES public.soar_playbooks(id),
  playbook_execution_id UUID REFERENCES public.playbook_executions(id),
  trigger_type TEXT NOT NULL,
  agent_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  actions_taken JSONB DEFAULT '[]'::jsonb,
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.soar_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "soar_executions_tenant_isolation" ON public.soar_executions
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "soar_executions_service_insert" ON public.soar_executions
  FOR INSERT WITH CHECK (true);

-- Restringir INSERT a service_role
REVOKE INSERT ON public.soar_executions FROM anon, authenticated;
GRANT INSERT ON public.soar_executions TO service_role;

-- Index
CREATE INDEX idx_soar_executions_tenant ON public.soar_executions(tenant_id);
CREATE INDEX idx_soar_executions_status ON public.soar_executions(status);
CREATE INDEX idx_soar_executions_created ON public.soar_executions(created_at DESC);

COMMENT ON TABLE public.soar_executions IS 'Registros de execuções do sistema SOAR para rastreabilidade e auditoria';

-- 2. Fix automation_executions: garantir error_message nunca NULL em falhas
-- Adicionar constraint via trigger
CREATE OR REPLACE FUNCTION public.trg_ensure_automation_error_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'failed' AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
    NEW.error_message := 'Error details not captured - check action_result for context';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_error_msg ON public.automation_executions;
CREATE TRIGGER trg_automation_error_msg
  BEFORE INSERT OR UPDATE ON public.automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_automation_error_message();

-- 3. Corrigir as 2 execuções existentes sem error_message
UPDATE public.automation_executions 
SET error_message = COALESCE(
  action_result->>'error',
  'Error details not captured - historical record'
)
WHERE status = 'failed' AND (error_message IS NULL OR error_message = '');

-- 4. Criar view v_soar_execution_summary para dashboard
CREATE OR REPLACE VIEW public.v_soar_execution_summary
WITH (security_invoker = on, security_barrier = true)
AS
SELECT
  se.tenant_id,
  se.status,
  se.trigger_type,
  sp.name as playbook_name,
  count(*) as execution_count,
  max(se.created_at) as last_execution,
  count(*) FILTER (WHERE se.status = 'completed') as completed_count,
  count(*) FILTER (WHERE se.status = 'failed') as failed_count
FROM public.soar_executions se
LEFT JOIN public.soar_playbooks sp ON sp.id = se.playbook_id
WHERE se.tenant_id = current_user_tenant_id() OR is_super_admin(auth.uid())
GROUP BY se.tenant_id, se.status, se.trigger_type, sp.name;

COMMENT ON VIEW public.v_soar_execution_summary IS 'Resumo de execuções SOAR por tenant - usa security_invoker para isolamento';
