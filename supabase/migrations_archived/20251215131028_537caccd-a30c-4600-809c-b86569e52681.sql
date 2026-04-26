-- ============================================
-- FASE 4: CORRECOES FINAIS DE PRODUCAO
-- ============================================

-- 1. CLEANUP: Desativar enrollment_keys expiradas
UPDATE public.enrollment_keys
SET is_active = false
WHERE expires_at < NOW() AND is_active = true;

-- 2. INDICES DE PERFORMANCE para tabelas de alto volume
-- agent_web_activity
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_created_at 
ON public.agent_web_activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_web_activity_tenant_visited 
ON public.agent_web_activity(tenant_id, visited_at DESC);

-- ai_actions
CREATE INDEX IF NOT EXISTS idx_ai_actions_created_at 
ON public.ai_actions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_actions_tenant_status 
ON public.ai_actions(tenant_id, status);

-- ai_insights
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at 
ON public.ai_insights(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_severity 
ON public.ai_insights(tenant_id, severity);

-- anomaly_events
CREATE INDEX IF NOT EXISTS idx_anomaly_events_created_at 
ON public.anomaly_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_tenant_type 
ON public.anomaly_events(tenant_id, type);

-- antivirus_status
CREATE INDEX IF NOT EXISTS idx_antivirus_status_collected_at 
ON public.antivirus_status(collected_at DESC);

-- audit_logs (alta frequencia de queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action 
ON public.audit_logs(tenant_id, action);

-- generated_reports
CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at 
ON public.generated_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_reports_commercial 
ON public.generated_reports(tenant_id, commercial_priority, sales_status);

-- jobs (critico para performance)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at 
ON public.jobs(created_at DESC);

-- security_events
CREATE INDEX IF NOT EXISTS idx_security_events_created_at 
ON public.security_events(created_at DESC);

-- system_alerts
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at 
ON public.system_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_resolved 
ON public.system_alerts(tenant_id, resolved);

-- 3. CLEANUP automatico via pg_cron (se nao existir)
-- Adicionar job para cleanup de enrollment_keys expiradas (diario as 03:00)
SELECT cron.schedule(
  'cleanup-expired-enrollment-keys',
  '0 3 * * *',
  $$UPDATE public.enrollment_keys SET is_active = false WHERE expires_at < NOW() AND is_active = true$$
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-enrollment-keys'
);