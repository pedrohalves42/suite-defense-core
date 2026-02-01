-- P0: Atualizar constraint para aceitar novos event_types do agente v4.4.0
-- Isso resolve o problema de bootstrap que impede agentes de transicionar para ENFORCING

ALTER TABLE agent_evidence_logs 
DROP CONSTRAINT IF EXISTS agent_evidence_logs_event_type_check;

ALTER TABLE agent_evidence_logs 
ADD CONSTRAINT agent_evidence_logs_event_type_check 
CHECK ((event_type = ANY (ARRAY[
  'state_change'::text, 
  'job_execution'::text, 
  'dns_block'::text, 
  'policy_sync'::text, 
  'auto_recovery'::text, 
  'heartbeat'::text, 
  'update_applied'::text, 
  'update_check'::text,
  'error'::text, 
  'policy_drift'::text, 
  'security_event'::text,
  'security_warning'::text,
  'metrics_sent'::text,
  'force_update'::text
])));