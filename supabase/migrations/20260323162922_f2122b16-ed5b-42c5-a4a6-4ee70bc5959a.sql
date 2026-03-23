UPDATE agents 
SET archived_at = NULL,
    archived_reason = NULL,
    agent_state_reason = 'Reativado - correção de inconsistência archived_at'
WHERE status = 'active' 
AND archived_at IS NOT NULL;