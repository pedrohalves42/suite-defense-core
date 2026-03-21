
UPDATE agents 
SET force_update_version = 'v5.0.15',
    force_update_reason = 'Hotfix delivery: Registry snapshot (35), ECDSA OverwriteExistingKey (22v2), USB noise (41)',
    force_update_at = NOW()
WHERE agent_name = 'pcteste1';
