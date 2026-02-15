
-- ============================================================
-- P0: Fix validate_job_type_for_agent trigger
-- Add ALL job types referenced in the codebase (validation.ts)
-- This eliminates [DLQ:BUG] Unknown job type errors
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_job_type_for_agent()
RETURNS TRIGGER AS $$
DECLARE
  supported_types text[] := ARRAY[
    -- Legacy/generic types (used by create-job validation.ts)
    'scan',
    'update_agent',
    'reinstall_agent',
    'report',
    'config',
    -- Collection handlers (v5.0.0+)
    'software_inventory_collect',
    'light_vuln_scan',
    'collect_antivirus_status',
    'collect_web_activity',
    'collect_network_info',
    -- DNS management
    'sync_blocked_websites',
    'setup_dns_filter',
    'collect_dns_blocks',
    'remove_dns_filter',
    -- Remediation handlers (v5.0.0+)
    'fix_firewall',
    -- Process/Service control (v5.0.1+)
    'kill_process',
    'stop_service',
    'disable_service',
    'restart_service',
    -- SOAR/Automation handlers (v5.0.4+)
    'service_health_check',
    'network_diagnostics',
    'quarantine_agent',
    'apply_security_patch',
    'disk_cleanup'
  ];
BEGIN
  IF NOT (NEW.type = ANY(supported_types)) THEN
    RAISE EXCEPTION 'Job type "%" not supported by agent v5.0.4. Supported: %', NEW.type, array_to_string(supported_types, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION public.validate_job_type_for_agent() IS 'Validates job types against the complete list of supported agent v5.0.4 handlers. Synchronized with _shared/validation.ts CreateJobSchema.';
