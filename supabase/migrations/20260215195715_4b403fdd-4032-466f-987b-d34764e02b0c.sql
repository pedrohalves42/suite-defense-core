
CREATE OR REPLACE FUNCTION public.validate_job_type_for_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_version text;
  v_supported_types text[];
BEGIN
  -- Get agent version
  SELECT agent_version INTO v_agent_version
  FROM agents WHERE id = NEW.agent_id;

  -- v5.x supported types (25 handlers + integration_test_v3)
  v_supported_types := ARRAY[
    'scan', 'update_agent', 'reinstall_agent', 'report', 'config',
    'collect_info', 'software_inventory_collect', 'light_vuln_scan',
    'collect_antivirus_status', 'collect_web_activity', 'collect_network_info',
    'sync_blocked_websites', 'setup_dns_filter', 'collect_dns_blocks',
    'remove_dns_filter', 'fix_firewall', 'kill_process', 'stop_service',
    'disable_service', 'restart_service', 'service_health_check',
    'network_diagnostics', 'quarantine_agent', 'apply_security_patch',
    'disk_cleanup', 'integration_test_v3'
  ];

  IF NEW.type IS NOT NULL AND NOT (NEW.type = ANY(v_supported_types)) THEN
    RAISE EXCEPTION 'Job type "%" not supported by agent %. Supported: %',
      NEW.type, COALESCE(v_agent_version, 'unknown'), array_to_string(v_supported_types, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
