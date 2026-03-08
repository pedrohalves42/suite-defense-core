UPDATE agents 
SET force_update_at = now(), 
    force_update_version = 'v5.0.13'
WHERE agent_version = 'v5.0.13'
  AND status != 'archived';