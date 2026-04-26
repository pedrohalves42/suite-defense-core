
-- =============================================================================
-- Phase 2: FK Referential Integrity Hardening - Batch 2
-- Tables without tenant_id FK to tenants
-- =============================================================================

-- Use IF NOT EXISTS pattern via DO block for safety
DO $$
BEGIN
  -- Agent telemetry batch
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_certificates_tenant_id_fkey') THEN
    ALTER TABLE public.agent_certificates ADD CONSTRAINT agent_certificates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_disk_metrics_tenant_id_fkey') THEN
    ALTER TABLE public.agent_disk_metrics ADD CONSTRAINT agent_disk_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_evidence_logs_tenant_id_fkey') THEN
    ALTER TABLE public.agent_evidence_logs ADD CONSTRAINT agent_evidence_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_file_integrity_tenant_id_fkey') THEN
    ALTER TABLE public.agent_file_integrity ADD CONSTRAINT agent_file_integrity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_groups_tenant_id_fkey') THEN
    ALTER TABLE public.agent_groups ADD CONSTRAINT agent_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_builds_tenant_id_fkey') THEN
    ALTER TABLE public.agent_builds ADD CONSTRAINT agent_builds_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_behavioral_baseline_tenant_id_fkey') THEN
    ALTER TABLE public.agent_behavioral_baseline ADD CONSTRAINT agent_behavioral_baseline_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_light_mode_configs_tenant_id_fkey') THEN
    ALTER TABLE public.agent_light_mode_configs ADD CONSTRAINT agent_light_mode_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  -- AI engine tables
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_actions_tenant_id_fkey') THEN
    ALTER TABLE public.ai_actions ADD CONSTRAINT ai_actions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_anomalies_tenant_id_fkey') THEN
    ALTER TABLE public.ai_anomalies ADD CONSTRAINT ai_anomalies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_insights_tenant_id_fkey') THEN
    ALTER TABLE public.ai_insights ADD CONSTRAINT ai_insights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_feedback_tenant_id_fkey') THEN
    ALTER TABLE public.ai_feedback ADD CONSTRAINT ai_feedback_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  -- Operational tables
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_sessions_tenant_id_fkey') THEN
    ALTER TABLE public.active_sessions ADD CONSTRAINT active_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_progress_tenant_id_fkey') THEN
    ALTER TABLE public.onboarding_progress ADD CONSTRAINT onboarding_progress_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_tenant_id_fkey') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_tenant_id_fkey') THEN
    ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'antivirus_status_tenant_id_fkey') THEN
    ALTER TABLE public.antivirus_status ADD CONSTRAINT antivirus_status_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_websites_tenant_id_fkey') THEN
    ALTER TABLE public.blocked_websites ADD CONSTRAINT blocked_websites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quarantined_files_tenant_id_fkey') THEN
    ALTER TABLE public.quarantined_files ADD CONSTRAINT quarantined_files_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_branding_tenant_id_fkey') THEN
    ALTER TABLE public.tenant_branding ADD CONSTRAINT tenant_branding_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_job_quotas_tenant_id_fkey') THEN
    ALTER TABLE public.tenant_job_quotas ADD CONSTRAINT tenant_job_quotas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_action_policies_tenant_id_fkey') THEN
    ALTER TABLE public.tenant_action_policies ADD CONSTRAINT tenant_action_policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  RAISE NOTICE 'Phase 2 FK hardening complete: 22 constraints verified/added';
END $$;
