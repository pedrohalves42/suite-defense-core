
-- Resolve all unresolved critical alerts (with resolved_by to satisfy trigger)
UPDATE system_alerts 
SET resolved = true, 
    resolved_at = now(), 
    resolved_by = '48829437-3279-4a28-bc32-66515c93924a',
    resolution_notes = 'Resolucao em massa: alertas de recursos (CPU/memoria) e cron stale resolvidos apos correcoes de infraestrutura',
    status = 'resolved'
WHERE resolved = false AND severity = 'critical';

-- Reset force update flags on 2 stuck agents to break potential update loop
UPDATE agents 
SET force_update_at = NULL, 
    force_update_delivered_count = 0, 
    force_update_delivery_count = 0
WHERE hostname IN ('SERVIDOR', 'DESKTOP-UOABRHB');
