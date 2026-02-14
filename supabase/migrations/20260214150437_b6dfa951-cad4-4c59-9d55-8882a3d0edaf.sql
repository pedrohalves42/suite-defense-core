-- Align trg_validate_job_type with all agent v5.0.4 handlers (Windows/Linux/macOS)
CREATE OR REPLACE FUNCTION validate_job_type_for_agent()
RETURNS trigger AS $$
DECLARE
  supported_types text[] := ARRAY[
    -- Collection handlers (v5.0.0+)
    'software_inventory_collect',
    'collect_antivirus_status',
    'collect_network_info',
    'collect_web_activity',
    -- Remediation handlers (v5.0.0+)
    'fix_firewall',
    -- Process/Service control (v5.0.1+)
    'kill_process',
    'stop_service',
    'disable_service',
    'restart_service',
    -- SOAR/Automation handlers (v5.0.4+)
    'sync_blocked_websites',
    'service_health_check',
    'network_diagnostics',
    'quarantine_agent',
    'apply_security_patch',
    'disk_cleanup',
    -- Infrastructure
    'reinstall_agent'
  ];
BEGIN
  IF NOT (NEW.type = ANY(supported_types)) THEN
    RAISE EXCEPTION 'Job type "%" not supported by agent v5.0.4. Supported: %', NEW.type, array_to_string(supported_types, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Also cancel any remaining unsupported jobs
UPDATE jobs 
SET status = 'cancelled',
    error_message = '[CANCELLED:UNSUPPORTED_JOB_TYPE] Job type not supported by agent v5.0.4',
    completed_at = now()
WHERE status IN ('pending', 'queued')
  AND type NOT IN (
    'software_inventory_collect', 'collect_antivirus_status', 'collect_network_info',
    'collect_web_activity', 'fix_firewall', 'kill_process', 'stop_service',
    'disable_service', 'restart_service', 'sync_blocked_websites',
    'service_health_check', 'network_diagnostics', 'quarantine_agent',
    'apply_security_patch', 'disk_cleanup', 'reinstall_agent'
  );