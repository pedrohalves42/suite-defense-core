
-- ============================================================
-- Fase 2: Modo Dry-Run, Risk Score e Motor de Correlação
-- ============================================================

-- 2.1 Adicionar colunas em detection_rules
ALTER TABLE public.detection_rules
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS false_positive_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS true_positive_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_detection_rules_mode
  ON public.detection_rules (mode)
  WHERE mode != 'disabled';

-- 2.2 Tabela correlation_rules
CREATE TABLE IF NOT EXISTS public.correlation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  description TEXT,
  condition_a_event_type TEXT NOT NULL,
  condition_b_event_type TEXT NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  severity TEXT NOT NULL DEFAULT 'medium',
  mitre_technique_id TEXT,
  mitre_tactic TEXT,
  mode TEXT NOT NULL DEFAULT 'dry_run',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  risk_score NUMERIC(5,2) DEFAULT 0,
  match_count INTEGER NOT NULL DEFAULT 0,
  false_positive_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.correlation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their correlation rules"
  ON public.correlation_rules FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant members can insert correlation rules"
  ON public.correlation_rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant members can update their correlation rules"
  ON public.correlation_rules FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant members can delete their correlation rules"
  ON public.correlation_rules FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_correlation_rules_tenant_enabled
  ON public.correlation_rules (tenant_id)
  WHERE is_enabled = true;

-- 2.3 Tabela correlation_results
CREATE TABLE IF NOT EXISTS public.correlation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  correlation_rule_id UUID NOT NULL REFERENCES public.correlation_rules(id) ON DELETE CASCADE,
  agent_id UUID,
  event_a_time TIMESTAMPTZ NOT NULL,
  event_b_time TIMESTAMPTZ NOT NULL,
  event_a_summary TEXT,
  event_b_summary TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  is_false_positive BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.correlation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their correlation results"
  ON public.correlation_results FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant members can update their correlation results"
  ON public.correlation_results FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_correlation_results_tenant_created
  ON public.correlation_results (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_correlation_results_rule
  ON public.correlation_results (correlation_rule_id, created_at DESC);

-- 2.4 Função: Recalcular risk_score
CREATE OR REPLACE FUNCTION public.recalculate_risk_scores(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.detection_rules
  SET risk_score = ROUND((
    (CASE severity
      WHEN 'critical' THEN 10
      WHEN 'high' THEN 7
      WHEN 'medium' THEN 4
      WHEN 'low' THEN 1
      ELSE 0
    END) * 0.4
    + CASE WHEN (true_positive_count + false_positive_count) > 0
        THEN (true_positive_count::NUMERIC / (true_positive_count + false_positive_count)) * 6
        ELSE 3
      END * 0.3
    - CASE WHEN (true_positive_count + false_positive_count) > 0
        THEN (false_positive_count::NUMERIC / (true_positive_count + false_positive_count)) * 6
        ELSE 0
      END * 0.3
  )::NUMERIC, 2),
  updated_at = now()
  WHERE (tenant_id = p_tenant_id OR tenant_id IS NULL)
    AND mode != 'disabled';
END;
$$;

-- 2.5 Função: Motor de correlação leve
CREATE OR REPLACE FUNCTION public.run_correlation_engine(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_match RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_rule IN
    SELECT id, condition_a_event_type, condition_b_event_type, window_minutes, severity
    FROM public.correlation_rules
    WHERE tenant_id = p_tenant_id
      AND is_enabled = true
      AND mode IN ('active', 'dry_run')
  LOOP
    FOR v_match IN
      SELECT
        a.agent_id,
        a.created_at AS event_a_time,
        b.created_at AS event_b_time,
        a.event_type AS event_a_type,
        b.event_type AS event_b_type
      FROM public.agent_evidence_logs a
      JOIN public.agent_evidence_logs b
        ON a.tenant_id = b.tenant_id
        AND a.agent_id = b.agent_id
        AND b.event_type = v_rule.condition_b_event_type
        AND b.created_at > a.created_at
        AND b.created_at < a.created_at + (v_rule.window_minutes || ' minutes')::INTERVAL
      WHERE a.tenant_id = p_tenant_id
        AND a.event_type = v_rule.condition_a_event_type
        AND a.created_at > now() - INTERVAL '1 hour'
      LIMIT 100
    LOOP
      INSERT INTO public.correlation_results (
        tenant_id, correlation_rule_id, agent_id,
        event_a_time, event_b_time,
        event_a_summary, event_b_summary, severity
      ) VALUES (
        p_tenant_id, v_rule.id, v_match.agent_id,
        v_match.event_a_time, v_match.event_b_time,
        v_match.event_a_type, v_match.event_b_type,
        v_rule.severity
      );
      v_count := v_count + 1;
    END LOOP;

    UPDATE public.correlation_rules
    SET match_count = match_count + v_count,
        updated_at = now()
    WHERE id = v_rule.id;
  END LOOP;

  RETURN v_count;
END;
$$;
