-- =====================================================
-- FIX: Agent Deletion - Update Foreign Key Constraints
-- =====================================================

-- Enable pgcrypto extension for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. job_executions (RESTRICT ? CASCADE) - Principal causa do erro
ALTER TABLE public.job_executions 
DROP CONSTRAINT IF EXISTS job_executions_agent_id_fkey;

ALTER TABLE public.job_executions 
ADD CONSTRAINT job_executions_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- 2. system_alerts (NO ACTION ? CASCADE)
ALTER TABLE public.system_alerts 
DROP CONSTRAINT IF EXISTS system_alerts_agent_id_fkey;

ALTER TABLE public.system_alerts 
ADD CONSTRAINT system_alerts_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- 3. enrollment_keys (NO ACTION ? CASCADE)
ALTER TABLE public.enrollment_keys 
DROP CONSTRAINT IF EXISTS enrollment_keys_agent_id_fkey;

ALTER TABLE public.enrollment_keys 
ADD CONSTRAINT enrollment_keys_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- 4. policy_enforcement_logs (NO ACTION ? CASCADE)
ALTER TABLE public.policy_enforcement_logs 
DROP CONSTRAINT IF EXISTS policy_enforcement_logs_agent_id_fkey;

ALTER TABLE public.policy_enforcement_logs 
ADD CONSTRAINT policy_enforcement_logs_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- 5. agent_update_decisions (NO ACTION ? CASCADE)
ALTER TABLE public.agent_update_decisions 
DROP CONSTRAINT IF EXISTS agent_update_decisions_agent_id_fkey;

ALTER TABLE public.agent_update_decisions 
ADD CONSTRAINT agent_update_decisions_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- 6. agent_rollback_events (NO ACTION ? CASCADE)
ALTER TABLE public.agent_rollback_events 
DROP CONSTRAINT IF EXISTS agent_rollback_events_agent_id_fkey;

ALTER TABLE public.agent_rollback_events 
ADD CONSTRAINT agent_rollback_events_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- 7. installation_analytics (NO ACTION ? SET NULL)
ALTER TABLE public.installation_analytics 
DROP CONSTRAINT IF EXISTS installation_analytics_agent_id_fkey;

ALTER TABLE public.installation_analytics 
ADD CONSTRAINT installation_analytics_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- 8. security_events (NO ACTION ? SET NULL)
ALTER TABLE public.security_events 
DROP CONSTRAINT IF EXISTS security_events_agent_id_fkey;

ALTER TABLE public.security_events 
ADD CONSTRAINT security_events_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- 9. failed_jobs_dlq (NO ACTION ? SET NULL)
ALTER TABLE public.failed_jobs_dlq 
DROP CONSTRAINT IF EXISTS failed_jobs_dlq_agent_id_fkey;

ALTER TABLE public.failed_jobs_dlq 
ADD CONSTRAINT failed_jobs_dlq_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- 10. generated_reports (NO ACTION ? SET NULL)
ALTER TABLE public.generated_reports 
DROP CONSTRAINT IF EXISTS generated_reports_agent_id_fkey;

ALTER TABLE public.generated_reports 
ADD CONSTRAINT generated_reports_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- 11. playbook_executions (NO ACTION ? SET NULL)
ALTER TABLE public.playbook_executions 
DROP CONSTRAINT IF EXISTS playbook_executions_agent_id_fkey;

ALTER TABLE public.playbook_executions 
ADD CONSTRAINT playbook_executions_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- 12. risk_decision_log (NO ACTION ? SET NULL)
ALTER TABLE public.risk_decision_log 
DROP CONSTRAINT IF EXISTS risk_decision_log_agent_id_fkey;

ALTER TABLE public.risk_decision_log 
ADD CONSTRAINT risk_decision_log_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- 13. incident_timelines (NO ACTION ? SET NULL)
ALTER TABLE public.incident_timelines 
DROP CONSTRAINT IF EXISTS incident_timelines_agent_id_fkey;

ALTER TABLE public.incident_timelines 
ADD CONSTRAINT incident_timelines_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;