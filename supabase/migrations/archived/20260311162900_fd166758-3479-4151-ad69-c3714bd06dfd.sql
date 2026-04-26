-- Cancel stuck sync_blocked_websites jobs
UPDATE jobs SET status = 'cancelled', error_message = 'Cancelled: dedup fix applied'
WHERE type = 'sync_blocked_websites' AND status IN ('pending', 'queued', 'delivered')