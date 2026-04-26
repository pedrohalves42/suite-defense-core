UPDATE agents 
SET force_update_version = 'v6.0.0', 
    force_update_reason = 'Teste canary v5->v6 migration',
    force_update_at = now(),
    force_update_delivered_count = 0,
    force_update_first_delivered_at = NULL
WHERE id = 'd7c0e8c8-cd1d-4801-8516-c229f98ec4d5';