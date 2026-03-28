
-- =====================================================
-- FASE 4: DLQ Review Obrigatorio (High - 10 pts)
-- Usando tabela correta: failed_jobs_dlq
-- =====================================================

-- 4.1 Adicionar colunas de revisao obrigatoria a DLQ (algumas ja existem)
ALTER TABLE public.failed_jobs_dlq 
  ADD COLUMN IF NOT EXISTS review_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_suspicious boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_flagged_reason text;

-- 4.2 Trigger de Fallback para Revisao Obrigatoria
CREATE OR REPLACE FUNCTION public.enforce_dlq_review_on_age()
RETURNS TRIGGER AS $$
BEGIN
  -- Se item na DLQ ha mais de 24h sem revisao adequada, bloquear resolucao
  IF OLD.created_at < now() - interval '24 hours' 
     AND OLD.resolved_by IS NULL 
     AND NEW.status = 'resolved' 
     AND (NEW.resolved_by IS NULL OR NEW.review_notes IS NULL OR NEW.review_notes = '') THEN
    RAISE EXCEPTION 'DLQ_REVIEW_REQUIRED: Items older than 24h require manual review with notes. Item ID: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  -- Marcar automaticamente como suspeito se padroes detectados
  IF NEW.failure_class IN ('security', 'critical', 'auth_failure') 
     AND NOT COALESCE(NEW.flagged_suspicious, false) THEN
    NEW.flagged_suspicious := true;
    NEW.auto_flagged_reason := 'auto_flagged_security_pattern';
    NEW.review_required := true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_dlq_review ON public.failed_jobs_dlq;
CREATE TRIGGER trg_enforce_dlq_review
  BEFORE UPDATE ON public.failed_jobs_dlq
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dlq_review_on_age();

-- 4.3 Funcao de Revisao em Massa com Validacao
CREATE OR REPLACE FUNCTION public.force_review_unreviewed_dlq(
  p_reviewer_id uuid,
  p_max_items int DEFAULT 100
)
RETURNS TABLE(reviewed_count int, flagged_suspicious int, items_processed uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reviewed int := 0;
  v_flagged int := 0;
  v_items uuid[];
BEGIN
  -- Marcar itens antigos como requiring review
  WITH updated AS (
    UPDATE public.failed_jobs_dlq
    SET 
      review_required = true,
      flagged_suspicious = CASE 
        WHEN failure_class IN ('security', 'critical', 'auth_failure') THEN true
        WHEN retry_count > 5 THEN true
        ELSE false
      END,
      auto_flagged_reason = CASE 
        WHEN failure_class IN ('security', 'critical', 'auth_failure') THEN 'security_pattern'
        WHEN retry_count > 5 THEN 'excessive_retries'
        ELSE NULL
      END
    WHERE status != 'resolved'
      AND resolved_by IS NULL
      AND created_at < now() - interval '24 hours'
    RETURNING id, flagged_suspicious
  )
  SELECT 
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE flagged_suspicious)::int,
    array_agg(id)
  INTO v_reviewed, v_flagged, v_items
  FROM updated;

  RETURN QUERY SELECT v_reviewed, v_flagged, v_items;
END;
$$;

-- 4.4 View de Risco da DLQ
DROP VIEW IF EXISTS public.v_dlq_risk_overview;
CREATE VIEW public.v_dlq_risk_overview 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_items,
  COUNT(*) FILTER (WHERE resolved_by IS NOT NULL) as manually_reviewed,
  COUNT(*) FILTER (WHERE flagged_suspicious) as suspicious_items,
  COUNT(*) FILTER (WHERE created_at < now() - interval '24 hours' AND status != 'resolved') as overdue_items,
  ROUND(
    CASE WHEN COUNT(*) > 0 
    THEN (COUNT(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / COUNT(*)::numeric) * 100 
    ELSE 0 END, 2
  ) as review_rate_pct
FROM public.failed_jobs_dlq
WHERE created_at > now() - interval '30 days'
GROUP BY tenant_id;

-- 4.5 View categorizada da DLQ
DROP VIEW IF EXISTS public.dlq_categorized;
CREATE VIEW public.dlq_categorized
WITH (security_invoker = true) AS
SELECT 
  id,
  tenant_id,
  agent_id,
  job_type,
  error_message,
  retry_count,
  status,
  created_at,
  resolved_at,
  resolved_by,
  review_notes,
  flagged_suspicious,
  COALESCE(risk_category, 
    CASE 
      WHEN failure_class IN ('security', 'critical', 'auth_failure') THEN 'security'
      WHEN retry_count > 5 THEN 'reliability'
      ELSE 'operational'
    END
  ) as risk_category
FROM public.failed_jobs_dlq;

-- =====================================================
-- FASE 5: Atualizacao de get_audit_raw_metrics (Corrigida)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Verify access
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: No access to tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    -- Metricas basicas de auditoria
    'total_audit_logs', (SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = p_tenant_id),
    'audit_logs_30d', (SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'audit_logs_with_hash', (SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = p_tenant_id AND integrity_hash IS NOT NULL),
    
    -- Metricas de auditoria de IA
    'ai_decisions_logged', (
      SELECT COUNT(*) FROM public.audit_logs 
      WHERE tenant_id = p_tenant_id 
      AND resource_type = 'ai_action'
      AND created_at > now() - interval '30 days'
    ),
    'ai_rejections_logged', (
      SELECT COUNT(*) FROM public.ai_rejected_decisions 
      WHERE tenant_id = p_tenant_id 
      AND rejected_at > now() - interval '30 days'
    ),
    'ai_actions_total', (SELECT COUNT(*) FROM public.ai_actions WHERE tenant_id = p_tenant_id),
    'ai_audit_coverage_pct', (
      SELECT CASE 
        WHEN (SELECT COUNT(*) FROM public.ai_actions WHERE tenant_id = p_tenant_id) > 0
        THEN ROUND(
          (SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = p_tenant_id AND resource_type = 'ai_action')::numeric /
          (SELECT COUNT(*) FROM public.ai_actions WHERE tenant_id = p_tenant_id)::numeric * 100, 2
        )
        ELSE 100
      END
    ),
    
    -- Metricas de testes RLS
    'rls_test_runs_30d', (SELECT COUNT(DISTINCT test_run_id) FROM public.rls_test_results WHERE tested_at > now() - interval '30 days'),
    'rls_failures_detected', (SELECT COUNT(*) FROM public.rls_test_results WHERE NOT passed AND tested_at > now() - interval '30 days'),
    'rls_last_test', (SELECT MAX(tested_at) FROM public.rls_test_results),
    
    -- Metricas de integridade
    'audit_integrity_checks_30d', (SELECT COUNT(*) FROM public.audit_integrity_checks WHERE tenant_id = p_tenant_id AND checked_at > now() - interval '30 days'),
    'audit_integrity_breaches', (SELECT COUNT(*) FROM public.audit_integrity_checks WHERE tenant_id = p_tenant_id AND NOT chain_valid AND checked_at > now() - interval '30 days'),
    'audit_integrity_last_check', (SELECT MAX(checked_at) FROM public.audit_integrity_checks WHERE tenant_id = p_tenant_id),
    'audit_chain_valid', (SELECT bool_and(chain_valid) FROM public.audit_integrity_checks WHERE tenant_id = p_tenant_id AND checked_at > now() - interval '7 days'),
    
    -- Metricas de DLQ (usando failed_jobs_dlq)
    'dlq_total_items', (SELECT COUNT(*) FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id),
    'dlq_unresolved', (SELECT COUNT(*) FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id AND status != 'resolved'),
    'dlq_reviewed_count', (SELECT COUNT(*) FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id AND resolved_by IS NOT NULL),
    'dlq_review_rate_pct', (
      SELECT CASE 
        WHEN COUNT(*) > 0 
        THEN ROUND((COUNT(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / COUNT(*)::numeric) * 100, 2)
        ELSE 100
      END
      FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id
    ),
    'dlq_items_over_24h', (
      SELECT COUNT(*) FROM public.failed_jobs_dlq 
      WHERE tenant_id = p_tenant_id 
      AND status != 'resolved' 
      AND created_at < now() - interval '24 hours'
    ),
    'dlq_suspicious_count', (SELECT COUNT(*) FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id AND flagged_suspicious),
    
    -- Metricas de validacao de acoes
    'ai_validations_30d', (SELECT COUNT(*) FROM public.ai_action_validations WHERE tenant_id = p_tenant_id AND validated_at > now() - interval '30 days'),
    'ai_validations_passed', (SELECT COUNT(*) FROM public.ai_action_validations WHERE tenant_id = p_tenant_id AND validation_passed AND validated_at > now() - interval '30 days'),
    'ai_validations_failed', (SELECT COUNT(*) FROM public.ai_action_validations WHERE tenant_id = p_tenant_id AND NOT validation_passed AND validated_at > now() - interval '30 days'),
    
    -- Metricas de DLQ categorizadas
    'dlq_categorized_total', (SELECT COUNT(*) FROM public.dlq_categorized WHERE tenant_id = p_tenant_id),
    'dlq_categorized_security', (SELECT COUNT(*) FROM public.dlq_categorized WHERE tenant_id = p_tenant_id AND risk_category = 'security'),
    
    -- Timestamp
    'collected_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =====================================================
-- INDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_dlq_suspicious ON public.failed_jobs_dlq(flagged_suspicious) WHERE flagged_suspicious = true;
CREATE INDEX IF NOT EXISTS idx_dlq_overdue ON public.failed_jobs_dlq(created_at) WHERE status != 'resolved';
CREATE INDEX IF NOT EXISTS idx_dlq_review_required ON public.failed_jobs_dlq(review_required) WHERE review_required = true;
