-- Atualizar diagnose_agent_issues para gerar mensagens descritivas
-- baseadas em event_type e campos disponiveis em event_data

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
      'Agente nao encontrado no sistema'::text,
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
  
  -- Verificar issues do agente ativo com mensagens descritivas
  RETURN QUERY
  SELECT
    e.event_type,
    COALESCE(e.severity, 'medium'),
    -- Gerar mensagem descritiva baseada no tipo de evento e campos disponiveis
    CASE e.event_type
      -- Mudancas de estado
      WHEN 'state_change' THEN
        'Mudanca de estado: ' || 
        COALESCE(e.event_data->>'from', e.state_before, '?') || 
        ' ? ' || 
        COALESCE(e.event_data->>'to', e.state_after, '?')
      
      -- Eventos de seguranca
      WHEN 'security_event' THEN
        COALESCE(
          e.event_data->>'error_message',
          e.event_data->>'reason',
          'Evento de seguranca: ' || COALESCE(e.event_data->>'component', 'sistema')
        )
      
      -- Desvio de politica
      WHEN 'policy_drift' THEN
        'Desvio de politica detectado (' || 
        COALESCE(e.event_data->>'drift_count', '0') || 
        ' itens divergentes)'
      
      -- Erro de componente
      WHEN 'component_error' THEN
        'Erro no componente ' || 
        COALESCE(e.event_data->>'component', 'desconhecido') || 
        COALESCE(': ' || (e.event_data->>'error_message'), '')
      
      -- Servico parado
      WHEN 'service_stopped' THEN
        'Servico ' || 
        COALESCE(e.event_data->>'service_name', e.event_data->>'component', 'desconhecido') || 
        ' nao esta executando'
      
      -- Atualizacao falhou
      WHEN 'update_failed' THEN
        'Falha na atualizacao' || 
        COALESCE(': ' || (e.event_data->>'reason'), '') ||
        COALESCE(' (versao ' || (e.event_data->>'version') || ')', '')
      
      -- Rollback
      WHEN 'rollback' THEN
        'Rollback executado' || 
        COALESCE(': ' || (e.event_data->>'reason'), '')
      
      -- Safe mode
      WHEN 'safe_mode_entered' THEN
        'Modo protegido ativado' || 
        COALESCE(': ' || (e.event_data->>'reason'), '')
      
      -- Heartbeat/conexao
      WHEN 'heartbeat_missing' THEN
        'Sem comunicacao ha ' || 
        COALESCE(e.event_data->>'minutes', '?') || ' minutos'
      
      -- Recursos
      WHEN 'resource_warning' THEN
        'Alerta de recursos: ' ||
        COALESCE(e.event_data->>'resource', 'sistema') || ' em ' ||
        COALESCE(e.event_data->>'usage', '?') || '%'
      
      -- Fallback: tentar campos comuns em ordem de preferencia
      ELSE
        COALESCE(
          e.event_data->>'message',
          e.event_data->>'error_message',
          e.event_data->>'reason',
          e.event_data->>'description',
          e.event_data->>'event',
          -- Construir descricao generica
          CASE 
            WHEN e.event_type IS NOT NULL THEN 
              'Evento: ' || replace(e.event_type, '_', ' ')
            ELSE 
              'Problema detectado'
          END
        )
    END,
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

COMMENT ON FUNCTION public.diagnose_agent_issues(TEXT, UUID) IS '? Essencial - Diagnostico de agentes com mensagens descritivas';