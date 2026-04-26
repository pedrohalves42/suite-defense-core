
-- =============================================
-- LIMPEZA COMPLETA DE DADOS DE TESTE (v2)
-- =============================================

-- 1. Desabilitar triggers de imutabilidade
ALTER TABLE public.audit_logs DISABLE TRIGGER tr_prevent_audit_modification;
ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_log_integrity;
ALTER TABLE public.security_logs DISABLE TRIGGER tr_prevent_security_logs_modification;
ALTER TABLE public.agent_evidence_logs DISABLE TRIGGER tr_prevent_evidence_logs_modification;
ALTER TABLE public.job_executions DISABLE TRIGGER tr_prevent_execution_deletion;
ALTER TABLE public.job_executions DISABLE TRIGGER enforce_execution_immutability;
ALTER TABLE public.signed_documents DISABLE TRIGGER trg_prevent_signed_document_delete;
ALTER TABLE public.signed_documents DISABLE TRIGGER trg_prevent_signed_document_update;
ALTER TABLE public.playbook_executions DISABLE TRIGGER trg_prevent_playbook_execution_modification;
ALTER TABLE public.domain_events DISABLE TRIGGER tr_prevent_domain_event_mutation;
ALTER TABLE public.forensic_snapshots DISABLE TRIGGER trg_forensic_immutable;
ALTER TABLE public.jobs DISABLE TRIGGER trg_prevent_job_payload_modification;
ALTER TABLE public.failed_jobs_dlq DISABLE TRIGGER trg_audit_dlq_operations;
ALTER TABLE public.agent_signing_keys DISABLE TRIGGER enforce_signing_key_immutability;

-- 2. Truncar particoes existentes
TRUNCATE TABLE public.hmac_signatures_2026_02 CASCADE;
TRUNCATE TABLE public.agent_system_metrics_2025_12 CASCADE;
TRUNCATE TABLE public.agent_system_metrics_2026_01 CASCADE;
TRUNCATE TABLE public.agent_system_metrics_2026_02 CASCADE;

-- 3. Truncar tabelas de dados (filhas primeiro)
TRUNCATE TABLE public.scheduled_job_runs CASCADE;
TRUNCATE TABLE public.task_events CASCADE;
TRUNCATE TABLE public.tasks CASCADE;
TRUNCATE TABLE public.decision_events CASCADE;
TRUNCATE TABLE public.policy_enforcement_logs CASCADE;
TRUNCATE TABLE public.failure_occurrences CASCADE;
TRUNCATE TABLE public.failure_fingerprints CASCADE;
TRUNCATE TABLE public.ai_action_logs CASCADE;
TRUNCATE TABLE public.ai_actions CASCADE;
TRUNCATE TABLE public.ai_insights CASCADE;
TRUNCATE TABLE public.system_alerts CASCADE;
TRUNCATE TABLE public.blocked_access_attempts CASCADE;
TRUNCATE TABLE public.agent_web_activity CASCADE;
TRUNCATE TABLE public.agent_disk_metrics CASCADE;
TRUNCATE TABLE public.generated_reports CASCADE;
TRUNCATE TABLE public.red_team_assessments CASCADE;
TRUNCATE TABLE public.forensic_snapshots CASCADE;
TRUNCATE TABLE public.playbook_executions CASCADE;
TRUNCATE TABLE public.signed_documents CASCADE;
TRUNCATE TABLE public.domain_events CASCADE;
TRUNCATE TABLE public.agent_evidence_logs CASCADE;
TRUNCATE TABLE public.security_logs CASCADE;
TRUNCATE TABLE public.audit_logs CASCADE;
TRUNCATE TABLE public.job_executions CASCADE;
TRUNCATE TABLE public.failed_jobs_dlq CASCADE;
TRUNCATE TABLE public.jobs CASCADE;

-- 4. Reabilitar triggers de imutabilidade
ALTER TABLE public.audit_logs ENABLE TRIGGER tr_prevent_audit_modification;
ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_log_integrity;
ALTER TABLE public.security_logs ENABLE TRIGGER tr_prevent_security_logs_modification;
ALTER TABLE public.agent_evidence_logs ENABLE TRIGGER tr_prevent_evidence_logs_modification;
ALTER TABLE public.job_executions ENABLE TRIGGER tr_prevent_execution_deletion;
ALTER TABLE public.job_executions ENABLE TRIGGER enforce_execution_immutability;
ALTER TABLE public.signed_documents ENABLE TRIGGER trg_prevent_signed_document_delete;
ALTER TABLE public.signed_documents ENABLE TRIGGER trg_prevent_signed_document_update;
ALTER TABLE public.playbook_executions ENABLE TRIGGER trg_prevent_playbook_execution_modification;
ALTER TABLE public.domain_events ENABLE TRIGGER tr_prevent_domain_event_mutation;
ALTER TABLE public.forensic_snapshots ENABLE TRIGGER trg_forensic_immutable;
ALTER TABLE public.jobs ENABLE TRIGGER trg_prevent_job_payload_modification;
ALTER TABLE public.failed_jobs_dlq ENABLE TRIGGER trg_audit_dlq_operations;
ALTER TABLE public.agent_signing_keys ENABLE TRIGGER enforce_signing_key_immutability;
