-- ============================================================
-- ADR-VELLUM Phase 2: V-104 (HIGH) + V-107 (MEDIUM)
-- Note: V-101 skipped - job_executions are immutable by design (GOOD!)
-- ============================================================

-- V-104 (HIGH): Harden can_hard_delete_agent with tenant validation
CREATE OR REPLACE FUNCTION public.can_hard_delete_agent(p_agent_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_exec_count INT;
  v_oldest_allowed TIMESTAMPTZ;
  v_blocked_until TIMESTAMPTZ;
  v_agent_tenant_id UUID;
  v_caller_tenant_id UUID;
BEGIN
  -- V-104: Buscar tenant do agente
  SELECT tenant_id INTO v_agent_tenant_id
  FROM agents WHERE id = p_agent_id;
  
  IF v_agent_tenant_id IS NULL THEN
    RETURN json_build_object(
      'can_delete', false,
      'reason', 'AGENT_NOT_FOUND',
      'message', 'Agente nao encontrado'
    );
  END IF;
  
  -- V-104: Validar que chamador pertence ao tenant do agente
  v_caller_tenant_id := get_active_tenant_id();
  IF v_caller_tenant_id IS NULL OR v_caller_tenant_id != v_agent_tenant_id THEN
    RETURN json_build_object(
      'can_delete', false,
      'reason', 'TENANT_MISMATCH',
      'message', 'Acesso negado: agente pertence a outro tenant'
    );
  END IF;
  
  -- Periodo de retencao: 30 dias
  v_oldest_allowed := NOW() - INTERVAL '30 days';
  
  -- Verificar job_executions (tabela imutavel principal)
  SELECT COUNT(*), MAX(created_at) + INTERVAL '30 days'
  INTO v_job_exec_count, v_blocked_until
  FROM job_executions
  WHERE agent_id = p_agent_id AND created_at > v_oldest_allowed;
  
  IF v_job_exec_count > 0 THEN
    RETURN json_build_object(
      'can_delete', false,
      'reason', 'AUDIT_RETENTION',
      'blocked_records', v_job_exec_count,
      'blocked_until', v_blocked_until,
      'message', 'Existem ' || v_job_exec_count || ' registros de auditoria que nao podem ser excluidos ate ' || TO_CHAR(v_blocked_until, 'DD/MM/YYYY')
    );
  END IF;
  
  RETURN json_build_object('can_delete', true);
END;
$function$;

-- V-107 (MEDIUM): Create blast radius policies for all active tenants
INSERT INTO public.blast_radius_policies (
  tenant_id,
  action_type,
  max_affected_percent,
  max_affected_count,
  require_approval_above,
  is_active,
  created_at
)
SELECT 
  t.id as tenant_id,
  action_type,
  25 as max_affected_percent,
  CASE 
    WHEN action_type LIKE '%agent%' THEN 50
    WHEN action_type LIKE '%job%' THEN 100
    ELSE 25
  END as max_affected_count,
  10 as require_approval_above,
  true as is_active,
  now() as created_at
FROM public.tenants t
CROSS JOIN (
  VALUES 
    ('delete_agents'),
    ('force_update_agents'),
    ('isolate_agents'),
    ('archive_agents'),
    ('cancel_jobs'),
    ('delete_jobs')
) AS actions(action_type)
WHERE t.id IS NOT NULL
ON CONFLICT (tenant_id, action_type) DO NOTHING;