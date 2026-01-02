-- =====================================================
-- GOVERNANCE ENTERPRISE: Kill-switch, Rollback & Explicability
-- =====================================================

-- 1. Kill-switch table
CREATE TABLE IF NOT EXISTS public.system_kill_switch (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  reason text,
  activated_by uuid REFERENCES auth.users(id),
  activated_at timestamptz,
  scope text CHECK (scope IN ('auto_execute', 'high_risk_only')) DEFAULT 'auto_execute',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for kill_switch
ALTER TABLE public.system_kill_switch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage kill_switch"
ON public.system_kill_switch
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = system_kill_switch.tenant_id
      AND role IN ('admin', 'super_admin')
  )
);

-- 2. Add rollback columns to ai_actions
ALTER TABLE public.ai_actions
ADD COLUMN IF NOT EXISTS reversible boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rollback_status text CHECK (rollback_status IN ('pending', 'executed', 'failed')),
ADD COLUMN IF NOT EXISTS rollback_reason text,
ADD COLUMN IF NOT EXISTS block_reason text;

-- 3. Kill-switch enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_kill_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ks RECORD;
BEGIN
  SELECT * INTO ks
  FROM public.system_kill_switch
  WHERE tenant_id = NEW.tenant_id
    AND enabled = true;

  IF ks.enabled THEN
    -- Block high-risk only if scope is 'high_risk_only'
    IF ks.scope = 'high_risk_only' AND NEW.risk_level != 'high' THEN
      RETURN NEW;
    END IF;
    
    NEW.status := 'blocked';
    NEW.block_reason := 'kill_switch_active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kill_switch_enforcement ON public.ai_actions;

CREATE TRIGGER trg_kill_switch_enforcement
BEFORE UPDATE ON public.ai_actions
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status = 'executed'
)
EXECUTE FUNCTION public.enforce_kill_switch();

-- 4. Rollback request function
CREATE OR REPLACE FUNCTION public.request_ai_action_rollback(
  p_ai_action_id uuid,
  p_requested_by uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act RECORD;
BEGIN
  SELECT * INTO act
  FROM public.ai_actions
  WHERE id = p_ai_action_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'AI action not found');
  END IF;

  IF act.reversible IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action is not reversible');
  END IF;

  IF act.rollback_status IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rollback already requested');
  END IF;

  -- Mark rollback pending
  UPDATE public.ai_actions
  SET
    rollback_status = 'pending',
    rollback_reason = p_reason
  WHERE id = p_ai_action_id;

  -- Create decision event
  INSERT INTO public.decision_events (
    tenant_id,
    rule_code,
    agent_id,
    agent_name,
    action,
    decision_source,
    decision_type,
    evidence,
    created_at
  ) VALUES (
    act.tenant_id,
    'ROLLBACK_REQUEST',
    act.agent_id,
    act.agent_name,
    'rollback_requested',
    'human',
    'compensating_action',
    jsonb_build_object(
      'ai_action_id', act.id,
      'requested_by', p_requested_by,
      'reason', p_reason,
      'original_action', act.action_type
    ),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'ai_action_id', p_ai_action_id);
END;
$$;

-- 5. Rollback execution function
CREATE OR REPLACE FUNCTION public.execute_ai_action_rollback(
  p_ai_action_id uuid,
  p_success boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act RECORD;
BEGIN
  SELECT * INTO act
  FROM public.ai_actions
  WHERE id = p_ai_action_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'AI action not found');
  END IF;

  IF act.rollback_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending rollback');
  END IF;

  UPDATE public.ai_actions
  SET rollback_status = CASE WHEN p_success THEN 'executed' ELSE 'failed' END
  WHERE id = p_ai_action_id;

  INSERT INTO public.decision_events (
    tenant_id,
    rule_code,
    agent_id,
    agent_name,
    action,
    decision_source,
    decision_type,
    evidence,
    created_at
  ) VALUES (
    act.tenant_id,
    'ROLLBACK_EXECUTION',
    act.agent_id,
    act.agent_name,
    'rollback_executed',
    'system',
    'compensating_action',
    jsonb_build_object(
      'ai_action_id', act.id,
      'success', p_success,
      'notes', p_notes
    ),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'executed', p_success);
END;
$$;

-- 6. Audit reason trees table
CREATE TABLE IF NOT EXISTS public.audit_reason_trees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  audit_id uuid,
  score integer NOT NULL,
  verdict text CHECK (verdict IN ('low_risk', 'moderate_risk', 'high_risk', 'critical_risk')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_reason_trees_tenant ON public.audit_reason_trees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_reason_trees_generated ON public.audit_reason_trees(generated_at DESC);

ALTER TABLE public.audit_reason_trees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant reason trees"
ON public.audit_reason_trees
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = audit_reason_trees.tenant_id
  )
);

-- 7. Generate reason tree function
CREATE OR REPLACE FUNCTION public.generate_audit_reason_tree(
  p_tenant_id uuid,
  p_score integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reasons jsonb := '[]'::jsonb;
  v_ai_total integer;
  v_human_reviewed integer;
  v_shadow_validated integer;
  v_decision_events integer;
  v_dlq_suspicious integer;
  v_kill_switch boolean;
BEGIN
  -- Count AI actions
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE human_reviewed = true),
    COUNT(*) FILTER (WHERE ai_validation_status IS NOT NULL)
  INTO v_ai_total, v_human_reviewed, v_shadow_validated
  FROM public.ai_actions
  WHERE tenant_id = p_tenant_id;

  -- Count decision events
  SELECT COUNT(DISTINCT (evidence->>'ai_action_id')::uuid)
  INTO v_decision_events
  FROM public.decision_events
  WHERE tenant_id = p_tenant_id;

  -- Count suspicious DLQ
  SELECT COUNT(*)
  INTO v_dlq_suspicious
  FROM public.failed_jobs_dlq
  WHERE tenant_id = p_tenant_id
    AND classification = 'suspicious'
    AND review_required = true;

  -- Check kill switch
  SELECT EXISTS (
    SELECT 1 FROM public.system_kill_switch
    WHERE tenant_id = p_tenant_id
  ) INTO v_kill_switch;

  -- Build reason tree
  
  -- Governance: no human review
  IF v_ai_total > 0 AND v_human_reviewed = 0 THEN
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'dimension', 'governance',
        'impact', -20,
        'signal', 'no_human_review',
        'evidence', jsonb_build_object(
          'ai_actions_total', v_ai_total,
          'human_reviewed', v_human_reviewed
        )
      )
    );
  ELSIF v_ai_total > 0 AND v_human_reviewed > 0 THEN
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'dimension', 'governance',
        'impact', 10,
        'signal', 'human_review_present',
        'evidence', jsonb_build_object(
          'ai_actions_total', v_ai_total,
          'human_reviewed', v_human_reviewed,
          'rate', ROUND((v_human_reviewed::numeric / v_ai_total) * 100, 1)
        )
      )
    );
  END IF;

  -- Safety: shadow validation
  IF v_shadow_validated > 0 THEN
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'dimension', 'safety',
        'impact', 15,
        'signal', 'shadow_validation_active',
        'evidence', jsonb_build_object(
          'validated_count', v_shadow_validated,
          'rate', CASE WHEN v_ai_total > 0 
            THEN ROUND((v_shadow_validated::numeric / v_ai_total) * 100, 1)
            ELSE 0 END
        )
      )
    );
  END IF;

  -- Traceability: decision events
  IF v_ai_total > 0 AND v_decision_events > 0 THEN
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'dimension', 'traceability',
        'impact', 15,
        'signal', 'decision_events_linked',
        'evidence', jsonb_build_object(
          'decision_events', v_decision_events,
          'coverage', ROUND((v_decision_events::numeric / v_ai_total) * 100, 1)
        )
      )
    );
  END IF;

  -- Resilience: kill switch configured
  IF v_kill_switch THEN
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'dimension', 'resilience',
        'impact', 10,
        'signal', 'kill_switch_configured'
      )
    );
  END IF;

  -- Risk: suspicious DLQ
  IF v_dlq_suspicious > 0 THEN
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'dimension', 'risk',
        'impact', -25,
        'signal', 'dlq_suspicious_unreviewed',
        'evidence', jsonb_build_object(
          'suspicious_count', v_dlq_suspicious
        )
      )
    );
  END IF;

  RETURN reasons;
END;
$$;

-- 8. Update get_audit_raw_metrics with new metrics
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- Existing metrics
    'ai_actions_total', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id),
    'ai_actions_executed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'executed'),
    'ai_actions_blocked', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'blocked'),
    'ai_actions_human_reviewed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true),
    'ai_validation_pass', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND ai_validation_status = 'pass'),
    'ai_validation_warn', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND ai_validation_status = 'warn'),
    'decision_events_total', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id),
    'decision_events_human', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND decision_source = 'human'),
    'decision_events_ai', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND decision_source = 'ai'),
    
    -- DLQ metrics
    'dlq_total', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id),
    'dlq_review_required', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND review_required = true),
    'dlq_classification_expected', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND classification = 'expected'),
    'dlq_classification_transient', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND classification = 'transient'),
    'dlq_classification_suspicious', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND classification = 'suspicious'),
    
    -- NEW: Shadow validation rate
    'shadow_validation_rate', (
      SELECT CASE WHEN COUNT(*) > 0 
        THEN ROUND((COUNT(*) FILTER (WHERE ai_validation_status IS NOT NULL)::numeric / COUNT(*)) * 100, 1)
        ELSE 0 END
      FROM ai_actions WHERE tenant_id = p_tenant_id
    ),
    
    -- NEW: Decision event coverage
    'decision_event_coverage', (
      SELECT CASE WHEN (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id) > 0
        THEN ROUND(
          (COUNT(DISTINCT (evidence->>'ai_action_id')::uuid)::numeric / 
           NULLIF((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0)) * 100, 1
        )
        ELSE 0 END
      FROM decision_events WHERE tenant_id = p_tenant_id
    ),
    
    -- NEW: Kill switch present
    'kill_switch_present', (
      SELECT EXISTS (SELECT 1 FROM system_kill_switch WHERE tenant_id = p_tenant_id)
    ),
    
    -- NEW: Rollback events
    'rollback_events_total', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
        AND decision_type = 'compensating_action'
    ),
    
    -- NEW: Suspicious rate
    'dlq_suspicious_rate', (
      SELECT CASE WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE classification = 'suspicious')::numeric / COUNT(*)) * 100, 1)
        ELSE 0 END
      FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id
    )
  ) INTO result;

  RETURN result;
END;
$$;