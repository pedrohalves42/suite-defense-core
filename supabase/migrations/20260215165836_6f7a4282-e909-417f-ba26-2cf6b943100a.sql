
CREATE OR REPLACE FUNCTION public.validate_job_type_for_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  supported_types text[] := ARRAY[
    -- Legacy/generic types
    'scan',
    'update_agent',
    'reinstall_agent',
    'report',
    'config',
    'collect_info',
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
    'disk_cleanup',
    -- Testing
    'integration_test_v3'
  ];
BEGIN
  IF NOT (NEW.type = ANY(supported_types)) THEN
    RAISE EXCEPTION 'Job type "%" not supported by agent v5.0.5. Supported: %', NEW.type, array_to_string(supported_types, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
