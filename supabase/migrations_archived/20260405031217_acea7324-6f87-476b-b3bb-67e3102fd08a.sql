
-- Fase 3: Feedback do Analista

-- 3.1 Adicionar colunas de feedback em system_alerts
ALTER TABLE public.system_alerts
  ADD COLUMN IF NOT EXISTS detection_rule_id UUID,
  ADD COLUMN IF NOT EXISTS feedback TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS feedback_by UUID,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_system_alerts_feedback_pending
  ON public.system_alerts (tenant_id, feedback)
  WHERE feedback = 'pending';

CREATE INDEX IF NOT EXISTS idx_system_alerts_rule_id
  ON public.system_alerts (detection_rule_id)
  WHERE detection_rule_id IS NOT NULL;

-- 3.2 Função atômica para registrar feedback e atualizar contadores
CREATE OR REPLACE FUNCTION public.submit_alert_feedback(
  p_alert_id UUID,
  p_tenant_id UUID,
  p_user_id UUID,
  p_is_true_positive BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule_id UUID;
  v_feedback TEXT;
BEGIN
  v_feedback := CASE WHEN p_is_true_positive THEN 'true_positive' ELSE 'false_positive' END;

  -- Update alert feedback
  UPDATE public.system_alerts
  SET feedback = v_feedback,
      feedback_by = p_user_id,
      feedback_at = now(),
      human_reviewed = true,
      reviewed_by = p_user_id,
      reviewed_at = now()
  WHERE id = p_alert_id
    AND tenant_id = p_tenant_id
  RETURNING detection_rule_id INTO v_rule_id;

  -- If linked to a detection rule, update its counters
  IF v_rule_id IS NOT NULL THEN
    IF p_is_true_positive THEN
      UPDATE public.detection_rules
      SET true_positive_count = true_positive_count + 1,
          last_triggered_at = now(),
          updated_at = now()
      WHERE id = v_rule_id
        AND (tenant_id = p_tenant_id OR tenant_id IS NULL);
    ELSE
      UPDATE public.detection_rules
      SET false_positive_count = false_positive_count + 1,
          last_triggered_at = now(),
          updated_at = now()
      WHERE id = v_rule_id
        AND (tenant_id = p_tenant_id OR tenant_id IS NULL);
    END IF;

    -- Recalculate risk_score for the specific rule
    UPDATE public.detection_rules
    SET risk_score = ROUND((
      (CASE severity
        WHEN 'critical' THEN 10 WHEN 'high' THEN 7 WHEN 'medium' THEN 4 WHEN 'low' THEN 1 ELSE 0
      END) * 0.4
      + CASE WHEN (true_positive_count + false_positive_count) > 0
          THEN (true_positive_count::NUMERIC / (true_positive_count + false_positive_count)) * 6
          ELSE 3 END * 0.3
      - CASE WHEN (true_positive_count + false_positive_count) > 0
          THEN (false_positive_count::NUMERIC / (true_positive_count + false_positive_count)) * 6
          ELSE 0 END * 0.3
    )::NUMERIC, 2)
    WHERE id = v_rule_id
      AND (tenant_id = p_tenant_id OR tenant_id IS NULL);
  END IF;
END;
$$;
