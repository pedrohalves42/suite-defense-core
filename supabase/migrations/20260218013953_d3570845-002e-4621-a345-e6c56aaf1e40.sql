
-- Fix search_path on get_zombie_threshold_minutes
CREATE OR REPLACE FUNCTION public.get_zombie_threshold_minutes(p_job_type text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
  SELECT CASE
    WHEN p_job_type LIKE 'collect_%' THEN 30
    WHEN p_job_type = 'light_vuln_scan' THEN 30
    WHEN p_job_type = 'integration_test_v3' THEN 30
    WHEN p_job_type = 'health_check' THEN 15
    WHEN p_job_type = 'config' THEN 15
    WHEN p_job_type = 'software_inventory_collect' THEN 60
    WHEN p_job_type = 'disk_cleanup' THEN 60
    WHEN p_job_type = 'update_agent' THEN 120
    WHEN p_job_type = 'apply_security_patch' THEN 120
    WHEN p_job_type = 'reinstall_agent' THEN 120
    ELSE 45
  END;
$function$;
