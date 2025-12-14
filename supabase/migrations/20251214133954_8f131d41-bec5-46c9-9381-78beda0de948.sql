-- Fix stuck jobs for Vm-Linux (collect_web_activity, light_vuln_scan)
UPDATE jobs 
SET status = 'failed', 
    completed_at = NOW(),
    error_message = 'Job timeout: exceeded delivery window without completion (auto-cleanup)'
WHERE agent_name = 'Vm-Linux' 
  AND status = 'delivered'
  AND delivered_at < NOW() - INTERVAL '5 minutes';