CREATE OR REPLACE FUNCTION public.get_vulnerability_counts(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM vuln_findings WHERE tenant_id = p_tenant_id),
    'critical', (SELECT count(*) FROM vuln_findings WHERE tenant_id = p_tenant_id AND severity IN ('critical', 'high'))
  );
$function$;