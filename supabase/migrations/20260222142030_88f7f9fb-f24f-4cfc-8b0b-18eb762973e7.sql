
-- Add remaining FK constraints (skip agents which already has it)
DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['jobs','fk_jobs_tenant'],
    ['tasks','fk_tasks_tenant'],
    ['system_alerts','fk_system_alerts_tenant'],
    ['security_logs','fk_security_logs_tenant'],
    ['audit_logs','fk_audit_logs_tenant'],
    ['automation_rules','fk_automation_rules_tenant'],
    ['automation_executions','fk_automation_executions_tenant'],
    ['domain_events','fk_domain_events_tenant'],
    ['failed_jobs_dlq','fk_failed_jobs_dlq_tenant'],
    ['notification_queue','fk_notification_queue_tenant'],
    ['notification_log','fk_notification_log_tenant'],
    ['scheduled_jobs','fk_scheduled_jobs_tenant'],
    ['software_inventory','fk_software_inventory_tenant'],
    ['playbook_executions','fk_playbook_executions_tenant'],
    ['incident_timelines','fk_incident_timelines_tenant'],
    ['feature_flags','fk_feature_flags_tenant'],
    ['job_executions','fk_job_executions_tenant'],
    ['automation_execution_log','fk_automation_execution_log_tenant'],
    ['scheduled_job_runs','fk_scheduled_job_runs_tenant']
  ];
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = pair[2]
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)',
        pair[1], pair[2]
      );
      RAISE NOTICE 'Added FK % on %', pair[2], pair[1];
    ELSE
      RAISE NOTICE 'FK % already exists', pair[2];
    END IF;
  END LOOP;
END $$;
