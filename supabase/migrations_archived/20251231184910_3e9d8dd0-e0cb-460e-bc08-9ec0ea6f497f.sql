-- =====================================================
-- URGENT FIX: Complete Audit Score Improvement
-- =====================================================

-- 1. BACKFILL FUNCTION: Calculate hashes for existing audit logs
CREATE OR REPLACE FUNCTION public.backfill_audit_log_hashes(p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE(updated_count INTEGER, tenant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT := 'GENESIS';
  v_count INTEGER := 0;
  v_current_tenant UUID;
BEGIN
  FOR v_current_tenant IN 
    SELECT DISTINCT al.tenant_id 
    FROM audit_logs al 
    WHERE (p_tenant_id IS NULL OR al.tenant_id = p_tenant_id)
    ORDER BY al.tenant_id
  LOOP
    v_previous_hash := 'GENESIS';
    
    FOR v_log IN 
      SELECT al.id, al.created_at, al.user_id, al.action, al.resource_type, al.resource_id, al.success
      FROM audit_logs al
      WHERE al.tenant_id = v_current_tenant
      ORDER BY al.created_at ASC, al.id ASC
    LOOP
      UPDATE audit_logs
      SET 
        integrity_hash = encode(sha256(convert_to(
          COALESCE(v_log.id::text, '') || 
          COALESCE(v_log.created_at::text, '') || 
          COALESCE(v_log.user_id::text, '') || 
          COALESCE(v_log.action, '') || 
          COALESCE(v_log.resource_type, '') || 
          COALESCE(v_log.resource_id, '') || 
          v_log.success::text || 
          v_previous_hash,
          'UTF8'
        )), 'hex'),
        previous_log_hash = v_previous_hash
      WHERE id = v_log.id
      RETURNING integrity_hash INTO v_previous_hash;
      
      v_count := v_count + 1;
    END LOOP;
    
    updated_count := v_count;
    tenant_id := v_current_tenant;
    RETURN NEXT;
    v_count := 0;
  END LOOP;
  
  RETURN;
END;
$function$;