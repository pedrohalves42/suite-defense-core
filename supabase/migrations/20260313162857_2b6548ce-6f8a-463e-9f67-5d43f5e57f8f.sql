
-- Performance indexes for EDR telemetry tables (Audit Problems 2 & 6)
-- Composite indexes for summarization GROUP BY queries
CREATE INDEX IF NOT EXISTS idx_process_events_tenant_time_agent
ON endpoint_process_events (tenant_id, event_time, agent_id);

CREATE INDEX IF NOT EXISTS idx_file_events_tenant_time_agent
ON endpoint_file_events (tenant_id, event_time, agent_id);

CREATE INDEX IF NOT EXISTS idx_network_events_tenant_time_agent
ON endpoint_network_events (tenant_id, event_time, agent_id);

CREATE INDEX IF NOT EXISTS idx_registry_events_tenant_time_agent
ON endpoint_registry_events (tenant_id, event_time, agent_id);

-- Partial index for detection engine (only non-suspicious events)
CREATE INDEX IF NOT EXISTS idx_process_events_unsuspicious
ON endpoint_process_events (tenant_id, event_time)
WHERE is_suspicious = false;

CREATE INDEX IF NOT EXISTS idx_file_events_unsuspicious
ON endpoint_file_events (tenant_id, event_time)
WHERE is_suspicious = false;

CREATE INDEX IF NOT EXISTS idx_network_events_unsuspicious
ON endpoint_network_events (tenant_id, event_time)
WHERE is_suspicious = false;

CREATE INDEX IF NOT EXISTS idx_registry_events_unsuspicious
ON endpoint_registry_events (tenant_id, event_time)
WHERE is_suspicious = false;

-- Detection events index for correlation engine
CREATE INDEX IF NOT EXISTS idx_detection_events_status_time
ON endpoint_detection_events (status, event_time)
WHERE status = 'open';

-- Trigram indexes for Threat Hunting ILIKE searches (Problem 6)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_process_events_name_trgm
ON endpoint_process_events USING gin (process_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_process_events_cmdline_trgm
ON endpoint_process_events USING gin (command_line gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_file_events_path_trgm
ON endpoint_file_events USING gin (file_path gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_network_events_domain_trgm
ON endpoint_network_events USING gin (domain gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_network_events_addr_trgm
ON endpoint_network_events USING gin (remote_address gin_trgm_ops);
