
-- ============================================================
-- Sprint 30: Event Normalization ? Unified View
-- ============================================================

-- Normalized events view: unions all telemetry into a single queryable format
CREATE OR REPLACE VIEW public.v_normalized_events
WITH (security_invoker = on, security_barrier = true)
AS
  -- Process events
  SELECT
    id,
    tenant_id,
    agent_id,
    event_time,
    'process' AS event_category,
    event_type,
    process_name,
    command_line,
    sha256_hash AS file_hash,
    NULL::TEXT AS file_path,
    NULL::TEXT AS remote_address,
    NULL::INTEGER AS remote_port,
    NULL::TEXT AS domain,
    NULL::TEXT AS key_path,
    user_name,
    pid AS process_pid,
    parent_pid AS parent_process_pid,
    parent_process_name,
    mitre_technique_id,
    mitre_tactic,
    is_suspicious,
    detection_tags,
    NULL::TEXT AS severity,
    NULL::TEXT AS detection_name,
    created_at
  FROM public.endpoint_process_events

  UNION ALL

  -- File events
  SELECT
    id,
    tenant_id,
    agent_id,
    event_time,
    'file' AS event_category,
    event_type,
    process_name,
    NULL AS command_line,
    sha256_hash AS file_hash,
    file_path,
    NULL AS remote_address,
    NULL AS remote_port,
    NULL AS domain,
    NULL AS key_path,
    NULL AS user_name,
    process_pid,
    NULL AS parent_process_pid,
    NULL AS parent_process_name,
    NULL AS mitre_technique_id,
    NULL AS mitre_tactic,
    is_suspicious,
    detection_tags,
    NULL AS severity,
    NULL AS detection_name,
    created_at
  FROM public.endpoint_file_events

  UNION ALL

  -- Network events
  SELECT
    id,
    tenant_id,
    agent_id,
    event_time,
    'network' AS event_category,
    event_type,
    process_name,
    NULL AS command_line,
    NULL AS file_hash,
    NULL AS file_path,
    remote_address,
    remote_port,
    domain,
    NULL AS key_path,
    NULL AS user_name,
    process_pid,
    NULL AS parent_process_pid,
    NULL AS parent_process_name,
    NULL AS mitre_technique_id,
    NULL AS mitre_tactic,
    is_suspicious,
    detection_tags,
    NULL AS severity,
    NULL AS detection_name,
    created_at
  FROM public.endpoint_network_events

  UNION ALL

  -- Registry events
  SELECT
    id,
    tenant_id,
    agent_id,
    event_time,
    'registry' AS event_category,
    event_type,
    process_name,
    NULL AS command_line,
    NULL AS file_hash,
    NULL AS file_path,
    NULL AS remote_address,
    NULL AS remote_port,
    NULL AS domain,
    key_path,
    NULL AS user_name,
    process_pid,
    NULL AS parent_process_pid,
    NULL AS parent_process_name,
    mitre_technique_id,
    NULL AS mitre_tactic,
    is_suspicious,
    detection_tags,
    NULL AS severity,
    NULL AS detection_name,
    created_at
  FROM public.endpoint_registry_events

  UNION ALL

  -- Detection events
  SELECT
    id,
    tenant_id,
    agent_id,
    event_time,
    'detection' AS event_category,
    source_event_type AS event_type,
    process_name,
    command_line,
    NULL AS file_hash,
    file_path,
    remote_address,
    NULL AS remote_port,
    NULL AS domain,
    NULL AS key_path,
    NULL AS user_name,
    process_pid,
    NULL AS parent_process_pid,
    NULL AS parent_process_name,
    mitre_technique_id,
    mitre_tactic,
    true AS is_suspicious,
    ARRAY[]::TEXT[] AS detection_tags,
    severity,
    detection_name,
    created_at
  FROM public.endpoint_detection_events;
