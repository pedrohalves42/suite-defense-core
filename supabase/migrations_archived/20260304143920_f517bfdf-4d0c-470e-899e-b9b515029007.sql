-- Recalculate SHA256 for the updated script and reset force update for MIT-SERVIDOR
-- SHA256 will be recalculated by the heartbeat edge function on next delivery (best-effort persist)
-- Reset force update counter to ensure fresh delivery
UPDATE agents 
SET force_update_at = now(),
    force_update_version = 'v5.0.13',
    force_update_reason = 'HOTFIX-24h: inject skip_firewall_remediation heartbeat reader + flag file persist',
    force_update_delivered_count = 0,
    force_update_first_delivered_at = NULL
WHERE agent_name = 'MIT-SERVIDOR';