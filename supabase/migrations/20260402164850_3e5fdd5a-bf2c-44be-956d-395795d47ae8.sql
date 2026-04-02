-- =============================================================
-- TELEMETRY LIFECYCLE: Partitioning, Routing, Retention
-- =============================================================

-- 1. INSERT REDIRECTORS: Route new writes from old tables to partitioned tables

-- 1a. endpoint_event_buffer → endpoint_event_buffer_partitioned
CREATE OR REPLACE FUNCTION public.redirect_event_buffer_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.endpoint_event_buffer_partitioned 
    (id, tenant_id, agent_id, event_category, payload, received_at, processed_at, batch_id)
  VALUES 
    (NEW.id, NEW.tenant_id, NEW.agent_id, NEW.event_category, NEW.payload, NEW.received_at, NEW.processed_at, NEW.batch_id);
  RETURN NULL; -- skip insert into old table
END;
$$;

DROP TRIGGER IF EXISTS trg_redirect_event_buffer ON public.endpoint_event_buffer;
CREATE TRIGGER trg_redirect_event_buffer
  BEFORE INSERT ON public.endpoint_event_buffer
  FOR EACH ROW
  EXECUTE FUNCTION public.redirect_event_buffer_insert();

-- 1b. endpoint_process_events → endpoint_process_events_partitioned
CREATE OR REPLACE FUNCTION public.redirect_process_events_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.endpoint_process_events_partitioned 
    (id, tenant_id, agent_id, event_type, pid, parent_pid, process_name, command_line, 
     executable_path, user_name, sha256_hash, parent_process_name, parent_command_line,
     mitre_technique_id, mitre_tactic, is_suspicious, detection_tags, event_time, created_at)
  VALUES 
    (NEW.id, NEW.tenant_id, NEW.agent_id, NEW.event_type, NEW.pid, NEW.parent_pid, NEW.process_name, NEW.command_line,
     NEW.executable_path, NEW.user_name, NEW.sha256_hash, NEW.parent_process_name, NEW.parent_command_line,
     NEW.mitre_technique_id, NEW.mitre_tactic, NEW.is_suspicious, NEW.detection_tags, NEW.event_time, NEW.created_at);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_redirect_process_events ON public.endpoint_process_events;
CREATE TRIGGER trg_redirect_process_events
  BEFORE INSERT ON public.endpoint_process_events
  FOR EACH ROW
  EXECUTE FUNCTION public.redirect_process_events_insert();

-- 1c. endpoint_network_events → endpoint_network_events_partitioned
-- First check columns
CREATE OR REPLACE FUNCTION public.redirect_network_events_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.endpoint_network_events_partitioned 
    (id, tenant_id, agent_id, event_type, process_name, pid, 
     remote_address, remote_port, local_address, local_port,
     protocol, direction, connection_state, is_suspicious,
     detection_tags, event_time, created_at)
  VALUES 
    (NEW.id, NEW.tenant_id, NEW.agent_id, NEW.event_type, NEW.process_name, NEW.pid,
     NEW.remote_address, NEW.remote_port, NEW.local_address, NEW.local_port,
     NEW.protocol, NEW.direction, NEW.connection_state, NEW.is_suspicious,
     NEW.detection_tags, NEW.event_time, NEW.created_at);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_redirect_network_events ON public.endpoint_network_events;
CREATE TRIGGER trg_redirect_network_events
  BEFORE INSERT ON public.endpoint_network_events
  FOR EACH ROW
  EXECUTE FUNCTION public.redirect_network_events_insert();

-- 2. AUTO-PARTITION CREATION FUNCTION
CREATE OR REPLACE FUNCTION public.create_telemetry_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date;
  v_next date;
  v_suffix text;
  v_part_name text;
  v_tables text[] := ARRAY[
    'endpoint_event_buffer_partitioned',
    'endpoint_process_events_partitioned', 
    'endpoint_network_events_partitioned'
  ];
  v_table text;
  v_part_col text;
BEGIN
  -- Create partitions for the next 3 months
  FOR i IN 0..2 LOOP
    v_month := date_trunc('month', NOW() + (i || ' months')::interval)::date;
    v_next := (v_month + interval '1 month')::date;
    v_suffix := to_char(v_month, 'YYYY_MM');
    
    FOREACH v_table IN ARRAY v_tables LOOP
      v_part_name := v_table || '_' || v_suffix;
      
      -- Skip if partition already exists
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_part_name AND relnamespace = 'public'::regnamespace) THEN
        -- Determine partition column
        IF v_table = 'endpoint_event_buffer_partitioned' THEN
          v_part_col := 'received_at';
        ELSE
          v_part_col := 'created_at';
        END IF;
        
        EXECUTE format(
          'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_part_name, v_table, v_month, v_next
        );
        
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_part_name);
        
        -- Add RLS policies
        EXECUTE format(
          'CREATE POLICY "authenticated_select_tenant" ON public.%I FOR SELECT TO authenticated USING (tenant_id::text = (get_active_tenant_id())::text)',
          v_part_name
        );
        EXECUTE format(
          'CREATE POLICY "service_role_full_access" ON public.%I TO service_role USING (true) WITH CHECK (true)',
          v_part_name
        );
        
        RAISE NOTICE 'Created partition: %', v_part_name;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Create partitions for Jul-Dec 2026
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'endpoint_event_buffer_partitioned',
    'endpoint_process_events_partitioned',
    'endpoint_network_events_partitioned'
  ];
  v_table text;
  v_part_name text;
  v_month date;
  v_next date;
BEGIN
  FOR m IN 7..12 LOOP
    v_month := ('2026-' || lpad(m::text, 2, '0') || '-01')::date;
    v_next := (v_month + interval '1 month')::date;
    
    FOREACH v_table IN ARRAY v_tables LOOP
      v_part_name := v_table || '_2026_' || lpad(m::text, 2, '0');
      
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_part_name AND relnamespace = 'public'::regnamespace) THEN
        EXECUTE format(
          'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_part_name, v_table, v_month, v_next
        );
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_part_name);
        EXECUTE format(
          'CREATE POLICY "authenticated_select_tenant" ON public.%I FOR SELECT TO authenticated USING (tenant_id::text = (get_active_tenant_id())::text)',
          v_part_name
        );
        EXECUTE format(
          'CREATE POLICY "service_role_full_access" ON public.%I TO service_role USING (true) WITH CHECK (true)',
          v_part_name
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 3. RETENTION FUNCTION: Drop partitions older than N days
CREATE OR REPLACE FUNCTION public.drop_old_telemetry_partitions(p_retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff date;
  v_partition record;
  v_dropped integer := 0;
  v_bound_text text;
  v_from_val timestamptz;
BEGIN
  v_cutoff := (NOW() - (p_retention_days || ' days')::interval)::date;
  
  -- Find partitions whose upper bound is before the cutoff
  FOR v_partition IN
    SELECT c.relname as part_name, 
           parent.relname as parent_name,
           pg_get_expr(c.relpartbound, c.oid) as bounds
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class parent ON parent.oid = i.inhparent
    WHERE parent.relname IN (
      'endpoint_event_buffer_partitioned',
      'endpoint_process_events_partitioned',
      'endpoint_network_events_partitioned'
    )
    AND c.relkind = 'r'
  LOOP
    -- Extract the TO value from bounds like "FOR VALUES FROM ('2026-01-01') TO ('2026-02-01')"
    v_bound_text := v_partition.bounds;
    -- Parse the upper bound (TO value)
    v_from_val := (regexp_match(v_bound_text, 'TO \(''([^'']+)''\)'))[1]::timestamptz;
    
    IF v_from_val IS NOT NULL AND v_from_val::date <= v_cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS public.%I', v_partition.part_name);
      v_dropped := v_dropped + 1;
      RAISE NOTICE 'Dropped old partition: % (upper bound: % < cutoff: %)', v_partition.part_name, v_from_val, v_cutoff;
    END IF;
  END LOOP;
  
  RETURN v_dropped;
END;
$$;

-- 4. BATCH DATA MIGRATION FUNCTION
CREATE OR REPLACE FUNCTION public.migrate_telemetry_batch(
  p_table_name text,
  p_batch_size integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated integer := 0;
BEGIN
  IF p_table_name = 'endpoint_event_buffer' THEN
    WITH batch AS (
      SELECT id FROM public.endpoint_event_buffer
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    ),
    moved AS (
      INSERT INTO public.endpoint_event_buffer_partitioned 
        (id, tenant_id, agent_id, event_category, payload, received_at, processed_at, batch_id)
      SELECT e.id, e.tenant_id, e.agent_id, e.event_category, e.payload, e.received_at, e.processed_at, e.batch_id
      FROM public.endpoint_event_buffer e
      JOIN batch b ON b.id = e.id
      ON CONFLICT (id, received_at) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_migrated FROM moved;
    
    DELETE FROM public.endpoint_event_buffer 
    WHERE id IN (SELECT id FROM public.endpoint_event_buffer LIMIT p_batch_size);
    
  ELSIF p_table_name = 'endpoint_process_events' THEN
    WITH batch AS (
      SELECT id FROM public.endpoint_process_events
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    ),
    moved AS (
      INSERT INTO public.endpoint_process_events_partitioned
        (id, tenant_id, agent_id, event_type, pid, parent_pid, process_name, command_line,
         executable_path, user_name, sha256_hash, parent_process_name, parent_command_line,
         mitre_technique_id, mitre_tactic, is_suspicious, detection_tags, event_time, created_at)
      SELECT e.id, e.tenant_id, e.agent_id, e.event_type, e.pid, e.parent_pid, e.process_name, e.command_line,
             e.executable_path, e.user_name, e.sha256_hash, e.parent_process_name, e.parent_command_line,
             e.mitre_technique_id, e.mitre_tactic, e.is_suspicious, e.detection_tags, e.event_time, e.created_at
      FROM public.endpoint_process_events e
      JOIN batch b ON b.id = e.id
      ON CONFLICT (id, created_at) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_migrated FROM moved;
    
    DELETE FROM public.endpoint_process_events
    WHERE id IN (SELECT id FROM public.endpoint_process_events LIMIT p_batch_size);
    
  ELSIF p_table_name = 'endpoint_network_events' THEN
    WITH batch AS (
      SELECT id FROM public.endpoint_network_events
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    ),
    moved AS (
      INSERT INTO public.endpoint_network_events_partitioned
        (id, tenant_id, agent_id, event_type, process_name, pid,
         remote_address, remote_port, local_address, local_port,
         protocol, direction, connection_state, is_suspicious,
         detection_tags, event_time, created_at)
      SELECT e.id, e.tenant_id, e.agent_id, e.event_type, e.process_name, e.pid,
             e.remote_address, e.remote_port, e.local_address, e.local_port,
             e.protocol, e.direction, e.connection_state, e.is_suspicious,
             e.detection_tags, e.event_time, e.created_at
      FROM public.endpoint_network_events e
      JOIN batch b ON b.id = e.id
      ON CONFLICT (id, created_at) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_migrated FROM moved;
    
    DELETE FROM public.endpoint_network_events
    WHERE id IN (SELECT id FROM public.endpoint_network_events LIMIT p_batch_size);
  ELSE
    RAISE EXCEPTION 'Unknown table: %', p_table_name;
  END IF;
  
  RETURN v_migrated;
END;
$$;