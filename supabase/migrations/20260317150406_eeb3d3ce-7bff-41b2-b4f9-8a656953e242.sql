UPDATE agents 
SET force_update_version = 'v5.0.14',
    force_update_reason = 'Rollout gradual v5.0.14 - aprovado apos canario pcteste1',
    force_update_at = NOW(),
    force_update_delivered_count = 0,
    force_update_delivery_count = 0,
    force_update_first_delivered_at = NULL,
    last_forced_update_applied = NULL
WHERE id IN (
  '6d4638d7-cc01-4297-bbc7-748396022a3e',
  'b1c7c475-d193-40fa-90b5-194000f4bfab',
  '5898af0e-2684-4eed-919a-7712804cbd59'
)