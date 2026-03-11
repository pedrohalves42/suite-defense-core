-- Cancel all stuck collect_web_activity jobs
UPDATE jobs 
SET status = 'cancelled', 
    completed_at = NOW(), 
    error_message = '[HOTFIX] Cancelled - agent handler hanging on browser history SQLite'
WHERE type = 'collect_web_activity' 
AND status IN ('delivered', 'pending')