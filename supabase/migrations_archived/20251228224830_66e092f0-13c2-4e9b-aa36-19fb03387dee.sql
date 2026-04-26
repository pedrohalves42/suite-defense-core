-- =========================================
-- FASE 1: Novas Regras de Decisao Automaticas
-- =========================================

-- Regra 1: SILENT_FAILURE_007 - Agente improdutivo (online mas nao executa)
INSERT INTO decision_rules (code, description, is_enabled, scope, definition)
VALUES (
  'SILENT_FAILURE_007',
  'Detecta agentes com heartbeat ativo mas sem execucoes recentes',
  true,
  'agent',
  '{
    "conditions": {
      "heartbeat_ok": true,
      "min_minutes_without_execution": 60,
      "min_queued_jobs": 1
    },
    "actions": ["CREATE_AI_INSIGHT", "CREATE_SYSTEM_ALERT"],
    "parameters": {
      "insight_severity": "high",
      "alert_title": "Agente improdutivo detectado"
    },
    "safety": {
      "cooldown_minutes": 60,
      "max_alerts_per_agent_per_day": 3
    }
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- Regra 2: JOB_SLOW_008 - Jobs sistematicamente lentos
INSERT INTO decision_rules (code, description, is_enabled, scope, definition)
VALUES (
  'JOB_SLOW_008',
  'Detecta jobs que consistentemente excedem o tempo esperado',
  true,
  'job',
  '{
    "conditions": {
      "execution_time_percentile": 95,
      "min_occurrences": 3,
      "time_window_hours": 24
    },
    "actions": ["CREATE_AI_INSIGHT", "REDUCE_JOB_PRIORITY"],
    "parameters": {
      "insight_severity": "medium",
      "priority_reduction": 1
    },
    "safety": {
      "cooldown_minutes": 120,
      "max_priority_reductions_per_day": 2
    }
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- Regra 3: INSIGHT_IGNORED_009 - Insights criticos ignorados
INSERT INTO decision_rules (code, description, is_enabled, scope, definition)
VALUES (
  'INSIGHT_IGNORED_009',
  'Reeleva severidade de insights criticos nao reconhecidos',
  true,
  'insight',
  '{
    "conditions": {
      "severity": "critical",
      "is_acknowledged": false,
      "min_age_hours": 72
    },
    "actions": ["ESCALATE_INSIGHT", "SEND_NOTIFICATION"],
    "parameters": {
      "new_severity": "critical",
      "notification_channel": "email",
      "notification_title": "Insight critico ignorado ha 3 dias"
    },
    "safety": {
      "cooldown_hours": 24,
      "max_escalations_per_insight": 1
    }
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- Regra 4: BLOCKED_ACCESS_PATTERN_010 - Padrao de acesso bloqueado
INSERT INTO decision_rules (code, description, is_enabled, scope, definition)
VALUES (
  'BLOCKED_ACCESS_PATTERN_010',
  'Detecta padroes suspeitos de tentativas de acesso bloqueado',
  true,
  'agent',
  '{
    "conditions": {
      "min_blocked_attempts": 10,
      "time_window_minutes": 30,
      "suspicious_categories": ["malware", "phishing", "c2"]
    },
    "actions": ["CREATE_AI_INSIGHT", "CREATE_SYSTEM_ALERT", "ENABLE_INTENSIVE_MONITORING"],
    "parameters": {
      "insight_severity": "critical",
      "alert_title": "Padrao suspeito de navegacao detectado",
      "monitoring_duration_hours": 24
    },
    "safety": {
      "cooldown_minutes": 60,
      "require_human_confirmation_for_isolation": true
    }
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- Regra 5: AGENT_DIVERGENT_011 - Agente com metricas divergentes
INSERT INTO decision_rules (code, description, is_enabled, scope, definition)
VALUES (
  'AGENT_DIVERGENT_011',
  'Detecta agentes com comportamento estatisticamente divergente do grupo',
  true,
  'agent',
  '{
    "conditions": {
      "deviation_threshold_stddev": 2,
      "metrics_to_check": ["cpu_usage", "memory_usage", "job_failure_rate"],
      "min_sample_size": 5,
      "comparison_window_hours": 24
    },
    "actions": ["CREATE_AI_INSIGHT", "REDUCE_JOB_SCOPE"],
    "parameters": {
      "insight_severity": "medium",
      "scope_reduction_percent": 50
    },
    "safety": {
      "cooldown_hours": 4,
      "max_scope_reductions_per_agent_per_day": 2
    }
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- Regra 6: PROGRESSIVE_DEGRADATION_012 - Degradacao progressiva
INSERT INTO decision_rules (code, description, is_enabled, scope, definition)
VALUES (
  'PROGRESSIVE_DEGRADATION_012',
  'Detecta tendencia de degradacao antes de se tornar critica',
  true,
  'agent',
  '{
    "conditions": {
      "trend_direction": "negative",
      "min_trend_duration_hours": 12,
      "metrics_degrading": ["job_success_rate", "response_time"],
      "degradation_threshold_percent": 20
    },
    "actions": ["CREATE_AI_INSIGHT", "ENTER_SAFE_MODE_LIGHT"],
    "parameters": {
      "insight_severity": "medium",
      "safe_mode_light_duration_hours": 4
    },
    "safety": {
      "cooldown_hours": 6,
      "allow_essential_jobs_only": true
    }
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- =========================================
-- FASE 2: RPC para gerar AI Actions de Insights Criticos
-- =========================================

CREATE OR REPLACE FUNCTION public.generate_ai_actions_from_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insights_processed int := 0;
  v_actions_created int := 0;
  v_insight RECORD;
  v_action_type text;
  v_action_payload jsonb;
BEGIN
  -- Processa insights criticos nao reconhecidos sem acao associada
  FOR v_insight IN
    SELECT i.*
    FROM ai_insights i
    LEFT JOIN ai_actions a ON a.insight_id = i.id
    WHERE i.severity IN ('critical', 'high')
      AND i.is_acknowledged = false
      AND a.id IS NULL
      AND i.created_at > NOW() - INTERVAL '7 days'
    ORDER BY 
      CASE i.severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        ELSE 3 
      END,
      i.created_at DESC
    LIMIT 20
  LOOP
    v_insights_processed := v_insights_processed + 1;
    
    -- Determina tipo de acao baseado na categoria do insight
    CASE 
      WHEN v_insight.category ILIKE '%agent%' OR v_insight.category ILIKE '%health%' THEN
        v_action_type := 'suggest_agent_restart';
        v_action_payload := jsonb_build_object(
          'insight_id', v_insight.id,
          'insight_title', v_insight.title,
          'insight_category', v_insight.category,
          'suggested_action', 'Reiniciar agente ou verificar conectividade'
        );
      WHEN v_insight.category ILIKE '%security%' OR v_insight.category ILIKE '%threat%' THEN
        v_action_type := 'create_system_alert';
        v_action_payload := jsonb_build_object(
          'insight_id', v_insight.id,
          'title', 'Alerta de Seguranca: ' || v_insight.title,
          'message', v_insight.description,
          'severity', v_insight.severity,
          'category', 'security'
        );
      WHEN v_insight.category ILIKE '%job%' OR v_insight.category ILIKE '%execution%' THEN
        v_action_type := 'suggest_job_cleanup';
        v_action_payload := jsonb_build_object(
          'insight_id', v_insight.id,
          'insight_title', v_insight.title,
          'suggested_action', 'Limpar jobs travados ou cancelar jobs problematicos'
        );
      WHEN v_insight.category ILIKE '%config%' OR v_insight.category ILIKE '%policy%' THEN
        v_action_type := 'suggest_config_change';
        v_action_payload := jsonb_build_object(
          'insight_id', v_insight.id,
          'insight_title', v_insight.title,
          'suggested_action', 'Revisar configuracao do sistema'
        );
      ELSE
        v_action_type := 'create_system_alert';
        v_action_payload := jsonb_build_object(
          'insight_id', v_insight.id,
          'title', v_insight.title,
          'message', v_insight.description,
          'severity', v_insight.severity
        );
    END CASE;
    
    -- Cria a acao
    INSERT INTO ai_actions (
      tenant_id,
      insight_id,
      action_type,
      action_payload,
      status
    ) VALUES (
      v_insight.tenant_id,
      v_insight.id,
      v_action_type,
      v_action_payload,
      'pending'
    );
    
    v_actions_created := v_actions_created + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'insights_processed', v_insights_processed,
    'actions_created', v_actions_created,
    'processed_at', NOW()
  );
END;
$$;

-- =========================================
-- FASE 3: RPC para processar regras de decisao
-- =========================================

CREATE OR REPLACE FUNCTION public.evaluate_decision_rules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules_evaluated int := 0;
  v_events_created int := 0;
  v_rule RECORD;
  v_agent RECORD;
  v_definition jsonb;
  v_conditions jsonb;
  v_event_id uuid;
BEGIN
  -- Avalia cada regra ativa
  FOR v_rule IN
    SELECT * FROM decision_rules WHERE is_enabled = true
  LOOP
    v_rules_evaluated := v_rules_evaluated + 1;
    v_definition := v_rule.definition;
    v_conditions := v_definition->'conditions';
    
    -- Regra SILENT_FAILURE_007: Agente improdutivo
    IF v_rule.code = 'SILENT_FAILURE_007' THEN
      FOR v_agent IN
        SELECT a.*, 
               COALESCE(
                 (SELECT MAX(executed_at) FROM jobs j WHERE j.agent_id = a.id AND j.status = 'completed'),
                 a.enrolled_at
               ) as last_execution
        FROM agents a
        WHERE a.status = 'online'
          AND a.last_heartbeat > NOW() - INTERVAL '5 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM decision_events de 
            WHERE de.agent_id = a.id 
              AND de.rule_code = 'SILENT_FAILURE_007'
              AND de.created_at > NOW() - INTERVAL '60 minutes'
          )
          AND EXISTS (
            SELECT 1 FROM jobs j 
            WHERE j.agent_id = a.id 
              AND j.status = 'queued'
              AND j.created_at < NOW() - INTERVAL '30 minutes'
          )
      LOOP
        -- Verifica se nao executou jobs recentemente
        IF v_agent.last_execution < NOW() - INTERVAL '60 minutes' THEN
          -- Cria evento de decisao
          INSERT INTO decision_events (
            tenant_id, rule_code, agent_id, agent_name, action,
            evidence, executed_actions
          ) VALUES (
            v_agent.tenant_id,
            'SILENT_FAILURE_007',
            v_agent.id,
            v_agent.agent_name,
            'detect_silent_failure',
            jsonb_build_object(
              'last_heartbeat', v_agent.last_heartbeat,
              'last_execution', v_agent.last_execution,
              'agent_status', v_agent.status
            ),
            ARRAY['CREATE_AI_INSIGHT']
          ) RETURNING id INTO v_event_id;
          
          -- Cria insight
          INSERT INTO ai_insights (
            tenant_id, severity, category, title, description
          ) VALUES (
            v_agent.tenant_id,
            'high',
            'agent_health',
            'Agente improdutivo: ' || v_agent.agent_name,
            'O agente ' || v_agent.agent_name || ' esta online mas nao executou jobs nas ultimas horas. Ultima execucao: ' || 
            COALESCE(v_agent.last_execution::text, 'nunca')
          );
          
          v_events_created := v_events_created + 1;
        END IF;
      END LOOP;
    END IF;
    
    -- Regra INSIGHT_IGNORED_009: Insights criticos ignorados
    IF v_rule.code = 'INSIGHT_IGNORED_009' THEN
      -- Escala insights ignorados ha mais de 72h
      UPDATE ai_insights
      SET 
        severity = 'critical',
        title = '[ESCALADO] ' || title,
        updated_at = NOW()
      WHERE severity IN ('critical', 'high')
        AND is_acknowledged = false
        AND created_at < NOW() - INTERVAL '72 hours'
        AND title NOT LIKE '[ESCALADO]%';
        
      -- Registra evento se houve escalacoes
      IF FOUND THEN
        INSERT INTO decision_events (
          tenant_id, rule_code, action, evidence, executed_actions
        ) 
        SELECT DISTINCT 
          tenant_id,
          'INSIGHT_IGNORED_009',
          'escalate_insight',
          jsonb_build_object('escalated_at', NOW()),
          ARRAY['ESCALATE_INSIGHT']
        FROM ai_insights
        WHERE title LIKE '[ESCALADO]%'
          AND updated_at > NOW() - INTERVAL '1 minute';
          
        v_events_created := v_events_created + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Gera AI Actions para insights nao processados
  PERFORM generate_ai_actions_from_insights();
  
  RETURN jsonb_build_object(
    'success', true,
    'rules_evaluated', v_rules_evaluated,
    'events_created', v_events_created,
    'evaluated_at', NOW()
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_ai_actions_from_insights() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_ai_actions_from_insights() TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_decision_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_decision_rules() TO service_role;