-- ADR-030 Phase 3: Performance indexes for frequent tenant queries
-- Note: Using non-concurrent indexes since CONCURRENTLY cannot run in transaction

-- Tasks table - most queried table
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_severity_created 
ON tasks (tenant_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status 
ON tasks (tenant_id, status);

-- Software inventory
CREATE INDEX IF NOT EXISTS idx_software_inventory_tenant_agent 
ON software_inventory (tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_software_inventory_tenant_risk 
ON software_inventory (tenant_id, risk_level);

-- Jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status_delivered 
ON jobs (tenant_id, status, delivered_at DESC);

-- Web activity
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_tenant_agent_visited 
ON agent_web_activity (tenant_id, agent_id, visited_at DESC);

-- Vuln findings
CREATE INDEX IF NOT EXISTS idx_vuln_findings_tenant_agent_severity 
ON vuln_findings (tenant_id, agent_id, severity);