-- Clean duplicate uppercase "V5.0.14" releases (keep lowercase active ones)
DELETE FROM agent_releases 
WHERE version = 'V5.0.14' AND is_active = false;

-- Also clean old "unknown" version releases
DELETE FROM agent_releases 
WHERE version = 'unknown' AND is_active = false;