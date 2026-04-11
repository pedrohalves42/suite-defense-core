-- Function to process buffered EDR events into typed tables
CREATE OR REPLACE FUNCTION public.process_endpoint_event_buffer(batch_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  processed_count int := 0;
  error_count int := 0;
  stats jsonb;
  v_payload jsonb;
BEGIN
  FOR rec IN
    SELECT id, agent_id, tenant_id, event_category, payload
    FROM endpoint_event_buffer
    WHERE processed_at IS NULL
    ORDER BY received_at ASC
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_payload := rec.payload::jsonb;
      
      CASE rec.event_category
        WHEN 'process' THEN
          INSERT INTO endpoint_process_events (
            agent_id, tenant_id, event_type, pid, parent_pid, process_name,
            command_line, executable_path, user_name, sha256_hash,
            parent_process_name, parent_command_line, mitre_technique_id,
            mitre_tactic, is_suspicious, detection_tags, event_time
          ) VALUES (
            rec.agent_id, rec.tenant_id,
            COALESCE(v_payload->>'event_type', 'process_start'),
            COALESCE((v_payload->>'pid')::int, 0),
            (v_payload->>'parent_pid')::int,
            COALESCE(v_payload->>'process_name', 'unknown'),
            v_payload->>'command_line',
            v_payload->>'executable_path',
            v_payload->>'user_name',
            v_payload->>'sha256_hash',
            v_payload->>'parent_process_name',
            v_payload->>'parent_command_line',
            v_payload->>'mitre_technique_id',
            v_payload->>'mitre_tactic',
            COALESCE((v_payload->>'is_suspicious')::boolean, false),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_payload->'detection_tags')), ARRAY[]::text[]),
            COALESCE((v_payload->>'event_time')::timestamptz, now())
          );
          
        WHEN 'file' THEN
          INSERT INTO endpoint_file_events (
            agent_id, tenant_id, event_type, file_path, file_name,
            file_extension, file_size, sha256_hash, old_path,
            process_name, process_pid, is_suspicious, detection_tags, event_time
          ) VALUES (
            rec.agent_id, rec.tenant_id,
            COALESCE(v_payload->>'event_type', 'file_create'),
            COALESCE(v_payload->>'file_path', 'unknown'),
            v_payload->>'file_name',
            v_payload->>'file_extension',
            (v_payload->>'file_size')::bigint,
            v_payload->>'sha256_hash',
            v_payload->>'old_path',
            v_payload->>'process_name',
            (v_payload->>'process_pid')::int,
            COALESCE((v_payload->>'is_suspicious')::boolean, false),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_payload->'detection_tags')), ARRAY[]::text[]),
            COALESCE((v_payload->>'event_time')::timestamptz, now())
          );
          
        WHEN 'network' THEN
          INSERT INTO endpoint_network_events (
            agent_id, tenant_id, event_type, protocol, local_address,
            local_port, remote_address, remote_port, direction,
            process_name, process_pid, bytes_sent, bytes_received,
            domain, dns_query_type, dns_response, is_suspicious,
            detection_tags, geo_country, event_time
          ) VALUES (
            rec.agent_id, rec.tenant_id,
            COALESCE(v_payload->>'event_type', 'connection'),
            v_payload->>'protocol',
            v_payload->>'local_address',
            (v_payload->>'local_port')::int,
            v_payload->>'remote_address',
            (v_payload->>'remote_port')::int,
            v_payload->>'direction',
            v_payload->>'process_name',
            (v_payload->>'process_pid')::int,
            (v_payload->>'bytes_sent')::bigint,
            (v_payload->>'bytes_received')::bigint,
            v_payload->>'domain',
            v_payload->>'dns_query_type',
            v_payload->>'dns_response',
            COALESCE((v_payload->>'is_suspicious')::boolean, false),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_payload->'detection_tags')), ARRAY[]::text[]),
            v_payload->>'geo_country',
            COALESCE((v_payload->>'event_time')::timestamptz, now())
          );
          
        WHEN 'registry' THEN
          INSERT INTO endpoint_registry_events (
            agent_id, tenant_id, event_type, key_path, value_name,
            value_data, value_type, old_value_data, process_name,
            process_pid, is_suspicious, detection_tags, mitre_technique_id, event_time
          ) VALUES (
            rec.agent_id, rec.tenant_id,
            COALESCE(v_payload->>'event_type', 'registry_set'),
            COALESCE(v_payload->>'key_path', 'unknown'),
            v_payload->>'value_name',
            v_payload->>'value_data',
            v_payload->>'value_type',
            v_payload->>'old_value_data',
            v_payload->>'process_name',
            (v_payload->>'process_pid')::int,
            COALESCE((v_payload->>'is_suspicious')::boolean, false),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_payload->'detection_tags')), ARRAY[]::text[]),
            v_payload->>'mitre_technique_id',
            COALESCE((v_payload->>'event_time')::timestamptz, now())
          );
          
        ELSE
          -- Unknown category: skip but mark as processed to avoid infinite loop
          NULL;
      END CASE;
      
      -- Mark as processed
      UPDATE endpoint_event_buffer SET processed_at = now() WHERE id = rec.id;
      processed_count := processed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE WARNING 'Buffer process error for id=%: %', rec.id, SQLERRM;
    END;
  END LOOP;
  
  stats := jsonb_build_object(
    'processed', processed_count,
    'errors', error_count,
    'timestamp', now()
  );
  
  RETURN stats;
END;
$$;

-- Add index for efficient buffer processing queries
CREATE INDEX IF NOT EXISTS idx_endpoint_event_buffer_unprocessed
ON endpoint_event_buffer (received_at ASC)
WHERE processed_at IS NULL;

-- Schedule cron job to process buffer every 5 minutes
SELECT cron.schedule(
  'process-edr-buffer',
  '*/5 * * * *',
  $$SELECT public.process_endpoint_event_buffer(200);$$
);