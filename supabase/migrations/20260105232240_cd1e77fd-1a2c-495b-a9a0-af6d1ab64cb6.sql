-- ============================================
-- CORRIGIR FUNCOES SEM search_path
-- ============================================

-- Corrigir diagnose_agent_issues
CREATE OR REPLACE FUNCTION public.diagnose_agent_issues(p_agent_name text, p_tenant_id uuid)
 RETURNS TABLE(issue_type text, severity text, message text, details jsonb, detected_at timestamp with time zone, origin text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_agent_id uuid;
  v_is_archived boolean;
BEGIN
  -- Buscar agente
  SELECT id, (archived_at IS NOT NULL) 
  INTO v_agent_id, v_is_archived
  FROM agents 
  WHERE agent_name = p_agent_name 
    AND tenant_id = p_tenant_id;
  
  IF v_agent_id IS NULL THEN
    RETURN QUERY SELECT 
      'agent_not_found'::text,
      'critical'::text,
      'Agente nao encontrado'::text,
      jsonb_build_object('agent_name', p_agent_name),
      now(),
      'diagnose_agent_issues'::text;
    RETURN;
  END IF;
  
  -- Se arquivado, retornar apenas essa informacao
  IF v_is_archived THEN
    RETURN QUERY SELECT 
      'agent_archived'::text,
      'info'::text,
      'Agente esta arquivado e nao aparece em dashboards operacionais'::text,
      jsonb_build_object('agent_id', v_agent_id),
      now(),
      'diagnose_agent_issues'::text;
    RETURN;
  END IF;
  
  -- Verificar issues do agente ativo
  RETURN QUERY
  SELECT
    e.event_type,
    COALESCE(e.severity, 'medium'),
    e.event_data->>'message',
    e.event_data,
    e.created_at,
    'agent_evidence_logs'::text
  FROM agent_evidence_logs e
  WHERE e.agent_id = v_agent_id
    AND e.created_at > now() - interval '7 days'
  ORDER BY e.created_at DESC
  LIMIT 50;
END;
$function$;

-- Corrigir enforce_ai_action_approval
CREATE OR REPLACE FUNCTION public.enforce_ai_action_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF NEW.review_decision = 'approved' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, NEW.executed_by);
  END IF;
  RETURN NEW;
END;
$function$;