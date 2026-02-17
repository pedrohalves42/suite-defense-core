
-- =============================================================================
-- FIX 2: Resolve duplicate critical alerts with resolved_by set (system user)
-- =============================================================================

-- Use a system UUID as the resolver for automated cleanup
-- Step 1: Mark duplicates as resolved (keep newest per title+tenant)
WITH ranked_alerts AS (
  SELECT id, 
    ROW_NUMBER() OVER (PARTITION BY tenant_id, title ORDER BY created_at DESC) as rn
  FROM system_alerts 
  WHERE resolved = false
)
UPDATE system_alerts 
SET 
  resolved = true,
  resolved_at = NOW(),
  resolved_by = '00000000-0000-0000-0000-000000000000'::uuid,
  resolution_notes = 'Auto-consolidado: alerta duplicado. Mantido apenas o mais recente.'
WHERE id IN (
  SELECT id FROM ranked_alerts WHERE rn > 1
);

-- Step 2: Resolve old high_cpu alerts
UPDATE system_alerts
SET 
  resolved = true,
  resolved_at = NOW(),
  resolved_by = '00000000-0000-0000-0000-000000000000'::uuid,
  resolution_notes = 'Auto-resolvido: condição de CPU normalizada'
WHERE resolved = false 
  AND alert_type = 'high_cpu'
  AND created_at < NOW() - INTERVAL '7 days';

-- Step 3: Create deduplication trigger
CREATE OR REPLACE FUNCTION public.deduplicate_system_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id 
  FROM system_alerts 
  WHERE tenant_id = NEW.tenant_id 
    AND title = NEW.title 
    AND alert_type = NEW.alert_type 
    AND resolved = false
  LIMIT 1;
  
  IF existing_id IS NOT NULL THEN
    UPDATE system_alerts 
    SET details = NEW.details,
        message = NEW.message
    WHERE id = existing_id;
    RETURN NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduplicate_system_alert ON system_alerts;
CREATE TRIGGER trg_deduplicate_system_alert
  BEFORE INSERT ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION deduplicate_system_alert();
