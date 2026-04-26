UPDATE agents 
SET force_update_version = 'v5.0.13', 
    force_update_at = now(), 
    force_update_reason = 'HOTFIX 24d/24e: skip_firewall_remediation guard + init flag file'
WHERE id = '5898af0e-2684-4eed-919a-7712804cbd59';