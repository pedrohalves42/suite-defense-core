UPDATE agents 
SET force_update_version = 'v5.0.15',
    force_update_reason = 'Fix productState parsing bug and update_agent strict mode error',
    force_update_at = NOW()
WHERE agent_version = 'v5.0.13' 
  AND status = 'active'
  AND (force_update_version IS NULL OR force_update_version != 'v5.0.15');