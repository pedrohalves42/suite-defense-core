UPDATE agent_releases SET sha256 = 'pending_hotfix46_recalc' WHERE platform = 'windows' AND is_active = true AND id = '1f28545e-e701-41fb-ab5a-c76ba9a08f99';

UPDATE agents SET force_update_version = 'v5.0.15', force_update_reason = 'HOTFIX 46: Patch outer TOCTOU caller Exit(9004)', force_update_at = now() WHERE agent_name = 'pcteste1';