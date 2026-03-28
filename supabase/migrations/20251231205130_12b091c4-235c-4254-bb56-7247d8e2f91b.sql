
-- Corrigir get_audit_raw_metrics removendo referencia a blast_radius inexistente
DROP FUNCTION IF EXISTS get_audit_raw_metrics(uuid);

CREATE OR REPLACE FUNCTION get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  rls_count integer;
  total_tables integer;
BEGIN
  -- Contar tabelas com RLS habilitado
  SELECT COUNT(*) INTO rls_count
  FROM pg_tables t
  WHERE t.schemaname = 'public' AND t.rowsecurity = true;
  
  SELECT COUNT(*) INTO total_tables
  FROM pg_tables t
  WHERE t.schemaname = 'public';

  WITH
  -- JOBS (30d) - excluindo jobs que foram para DLQ
  job_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) AS total
    FROM jobs
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
      AND id NOT IN (SELECT original_job_id FROM failed_jobs_dlq WHERE original_job_id IS NOT NULL)
  ),
  -- DLQ
  dlq_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status != 'pending') AS reviewed
    FROM failed_jobs_dlq
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- INSIGHTS
  insight_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status != 'open') AS resolved
    FROM ai_insights
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- ACTIONS
  action_stats AS (
    SELECT COUNT(*) FILTER (WHERE status = 'executed') AS executed
    FROM ai_actions
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- DECISIONS
  decision_stats AS (
    SELECT COUNT(*) AS total
    FROM decision_events
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- APPROVALS (Governanca) - incluindo rejeicoes
  approval_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending
    FROM approval_requests
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- AUDIT LOGS
  audit_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE integrity_hash IS NOT NULL) AS with_hash
    FROM audit_logs
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- DECISION RULES (Auto-execute governance)
  rule_stats AS (
    SELECT
      COUNT(*) AS total_rules,
      COUNT(*) FILTER (WHERE auto_execute = true AND is_enabled = true) AS auto_execute_active
    FROM decision_rules
  )
  SELECT jsonb_build_object(
    -- OPERATIONS
    'job_success_rate', CASE WHEN job_stats.total > 0 
      THEN ROUND(job_stats.completed::numeric / job_stats.total * 100, 2) ELSE 0 END,
    'failed_jobs_30d', job_stats.failed,
    'real_failures_30d', job_stats.failed,
    
    -- DLQ RESILIENCE
    'dlq_jobs_30d', dlq_stats.total,
    'dlq_reviewed_30d', dlq_stats.reviewed,
    'dlq_review_rate', CASE WHEN dlq_stats.total > 0 
      THEN ROUND(dlq_stats.reviewed::numeric / dlq_stats.total * 100, 2) ELSE 100 END,
    
    -- INSIGHTS ? ACTIONS
    'ai_insights_30d', insight_stats.total,
    'insights_resolved_30d', insight_stats.resolved,
    'insights_resolution_rate', CASE WHEN insight_stats.total > 0 
      THEN ROUND(insight_stats.resolved::numeric / insight_stats.total * 100, 2) ELSE 0 END,
    'ai_actions_executed', action_stats.executed,
    'action_rate_pct', CASE WHEN insight_stats.total > 0 
      THEN ROUND(action_stats.executed::numeric / insight_stats.total * 100, 2) ELSE 0 END,
    
    -- DECISION GOVERNANCE
    'decision_events_30d', decision_stats.total,
    
    -- HUMAN OVERSIGHT (Governanca Critica)
    'approval_requests_30d', approval_stats.total,
    'approved_requests_30d', approval_stats.approved,
    'rejected_requests_30d', approval_stats.rejected,
    'pending_approvals', approval_stats.pending,
    'human_review_rate', CASE WHEN action_stats.executed > 0 
      THEN ROUND(approval_stats.total::numeric / action_stats.executed * 100, 2) ELSE 0 END,
    'rejection_rate', CASE WHEN approval_stats.total > 0
      THEN ROUND(approval_stats.rejected::numeric / approval_stats.total * 100, 2) ELSE 0 END,
    
    -- AUDIT / EVIDENCE
    'audit_logs_30d', audit_stats.total,
    'audit_logs_with_hash', audit_stats.with_hash,
    
    -- MULTI-TENANT ISOLATION (RLS)
    'rls_enabled_tables', rls_count,
    'total_public_tables', total_tables,
    'rls_coverage_pct', CASE WHEN total_tables > 0 
      THEN ROUND(rls_count::numeric / total_tables * 100, 2) ELSE 0 END,
    
    -- POLICY / RULES GOVERNANCE
    'auto_execute_rules', rule_stats.auto_execute_active,
    'total_decision_rules', rule_stats.total_rules
  )
  INTO result
  FROM job_stats, dlq_stats, insight_stats, action_stats, decision_stats, approval_stats, audit_stats, rule_stats;

  RETURN result;
END;
$$;
