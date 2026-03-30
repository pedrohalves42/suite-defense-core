
-- E7: Automated partitioning and retention for heavy telemetry tables
-- Step 1: Create partitioned versions of the 3 heaviest endpoint tables

-- 1a. endpoint_process_events_partitioned
CREATE TABLE IF NOT EXISTS public.endpoint_process_events_partitioned (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'process_start',
    pid INTEGER NOT NULL,
    parent_pid INTEGER,
    process_name TEXT NOT NULL,
    command_line TEXT,
    executable_path TEXT,
    user_name TEXT,
    sha256_hash TEXT,
    parent_process_name TEXT,
    parent_command_line TEXT,
    mitre_technique_id TEXT,
    mitre_tactic TEXT,
    is_suspicious BOOLEAN DEFAULT false,
    detection_tags TEXT[] DEFAULT '{}',
    event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 1b. endpoint_event_buffer_partitioned
CREATE TABLE IF NOT EXISTS public.endpoint_event_buffer_partitioned (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    agent_id UUID NOT NULL,
    event_category TEXT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    batch_id UUID,
    PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

-- 1c. endpoint_network_events_partitioned
CREATE TABLE IF NOT EXISTS public.endpoint_network_events_partitioned (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'connection',
    protocol TEXT DEFAULT 'tcp',
    local_address TEXT,
    local_port INTEGER,
    remote_address TEXT,
    remote_port INTEGER,
    direction TEXT DEFAULT 'outbound',
    process_name TEXT,
    process_pid INTEGER,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    domain TEXT,
    dns_query_type TEXT,
    dns_response TEXT,
    is_suspicious BOOLEAN DEFAULT false,
    detection_tags TEXT[] DEFAULT '{}',
    geo_country TEXT,
    event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 2: Create initial partitions (current + next 2 months)
SELECT create_monthly_partitions('endpoint_process_events_partitioned', 'created_at', 3);
SELECT create_monthly_partitions('endpoint_event_buffer_partitioned', 'received_at', 3);
SELECT create_monthly_partitions('endpoint_network_events_partitioned', 'created_at', 3);

-- Step 3: Add indexes on partitioned tables
CREATE INDEX IF NOT EXISTS idx_epe_part_tenant_time ON endpoint_process_events_partitioned(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_epe_part_agent_time ON endpoint_process_events_partitioned(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_epe_part_suspicious ON endpoint_process_events_partitioned(tenant_id, is_suspicious) WHERE is_suspicious = true;

CREATE INDEX IF NOT EXISTS idx_eeb_part_tenant_time ON endpoint_event_buffer_partitioned(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_eeb_part_processed ON endpoint_event_buffer_partitioned(processed_at) WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ene_part_tenant_time ON endpoint_network_events_partitioned(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ene_part_suspicious ON endpoint_network_events_partitioned(tenant_id, is_suspicious) WHERE is_suspicious = true;

-- Step 4: Update maintain_partitions to cover all partitioned tables
CREATE OR REPLACE FUNCTION public.maintain_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Existing partitioned tables
    PERFORM create_monthly_partitions('audit_logs', 'created_at', 3);
    PERFORM create_monthly_partitions('job_executions', 'created_at', 3);
    PERFORM create_monthly_partitions('agent_system_metrics_partitioned', 'collected_at', 3);
    
    -- New partitioned endpoint tables
    PERFORM create_monthly_partitions('endpoint_process_events_partitioned', 'created_at', 3);
    PERFORM create_monthly_partitions('endpoint_event_buffer_partitioned', 'received_at', 3);
    PERFORM create_monthly_partitions('endpoint_network_events_partitioned', 'created_at', 3);
END;
$$;

-- Step 5: Create retention cleanup function
CREATE OR REPLACE FUNCTION public.drop_old_partitions(
    p_table_name TEXT,
    p_retention_months INTEGER DEFAULT 3
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partition RECORD;
    v_dropped INTEGER := 0;
    v_cutoff DATE;
BEGIN
    v_cutoff := date_trunc('month', now()) - (p_retention_months || ' months')::interval;
    
    FOR v_partition IN
        SELECT c.relname AS partition_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = p_table_name
        ORDER BY c.relname
    LOOP
        -- Extract YYYY_MM from partition name and check if older than cutoff
        DECLARE
            v_date_part TEXT;
            v_partition_date DATE;
        BEGIN
            v_date_part := substring(v_partition.partition_name FROM '_(\d{4}_\d{2})$');
            IF v_date_part IS NOT NULL THEN
                v_partition_date := to_date(v_date_part, 'YYYY_MM');
                IF v_partition_date < v_cutoff THEN
                    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_partition.partition_name);
                    v_dropped := v_dropped + 1;
                END IF;
            END IF;
        END;
    END LOOP;
    
    RETURN v_dropped;
END;
$$;

-- Step 6: Create unified maintenance function (partitions + retention)
CREATE OR REPLACE FUNCTION public.run_partition_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Create future partitions
    PERFORM maintain_partitions();
    
    -- Drop old partitions (keep 3 months)
    PERFORM drop_old_partitions('audit_logs', 3);
    PERFORM drop_old_partitions('job_executions', 3);
    PERFORM drop_old_partitions('agent_system_metrics_partitioned', 3);
    PERFORM drop_old_partitions('endpoint_process_events_partitioned', 3);
    PERFORM drop_old_partitions('endpoint_event_buffer_partitioned', 3);
    PERFORM drop_old_partitions('endpoint_network_events_partitioned', 3);
END;
$$;

-- Step 7: Enable RLS on new partitioned tables
ALTER TABLE public.endpoint_process_events_partitioned ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_event_buffer_partitioned ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_network_events_partitioned ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.endpoint_process_events_partitioned FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.endpoint_event_buffer_partitioned FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.endpoint_network_events_partitioned FOR ALL USING (true) WITH CHECK (true);
