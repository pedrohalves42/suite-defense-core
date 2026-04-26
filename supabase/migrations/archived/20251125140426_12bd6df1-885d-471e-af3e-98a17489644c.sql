-- ============================================================
-- P0 SECURITY FIXES - CyberShield
-- Critical vulnerabilities identified by security audit:
-- - Fix SECURITY DEFINER views bypassing RLS
-- - Fix SECURITY DEFINER functions allowing cross-tenant access
-- - Restrict public access to agent_releases
-- - Add audit columns to sales_contacts
-- ============================================================

-- ============================================================
-- 1. FIX VULNERABLE VIEWS
-- ============================================================

-- 1.1 agents_health_view - Add tenant filter and security_invoker
CREATE OR REPLACE VIEW public.agents_health_view
WITH (security_invoker = on)
AS
SELECT 
    a.id,
    a.tenant_id,
    a.agent_name,
    a.status,
    a.enrolled_at,
    a.last_heartbeat,
    a.os_type,
    a.os_version,
    a.hostname,
    EXTRACT(epoch FROM (now() - a.last_heartbeat))::integer / 60 AS minutes_since_heartbeat,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'never_connected'::text
        WHEN a.last_heartbeat < (now() - '00:05:00'::interval) THEN 'offline'::text
        WHEN a.last_heartbeat < (now() - '00:02:00'::interval) THEN 'warning'::text
        ELSE 'online'::text
    END AS health_status,
    (SELECT count(*) FROM jobs WHERE jobs.agent_name = a.agent_name AND jobs.status = 'queued'::text) AS pending_jobs,
    (SELECT count(*) FROM jobs WHERE jobs.agent_name = a.agent_name AND jobs.status = 'completed'::text) AS completed_jobs
FROM agents a
WHERE a.tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid());

-- 1.2 agents_safe - Add tenant filter and security_invoker
CREATE OR REPLACE VIEW public.agents_safe
WITH (security_invoker = on)
AS
SELECT 
    id,
    tenant_id,
    enrolled_at,
    last_heartbeat,
    agent_name,
    status,
    payload_hash,
    os_type,
    os_version,
    hostname,
    agent_version
FROM agents
WHERE tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid());

-- 1.3 enrollment_keys_safe - CRITICAL! Drop and recreate to remove key_full exposure
DROP VIEW IF EXISTS public.enrollment_keys_safe;

CREATE VIEW public.enrollment_keys_safe
WITH (security_invoker = on)
AS
SELECT 
    id,
    tenant_id,
    created_by,
    created_at,
    expires_at,
    used_at,
    is_active,
    max_uses,
    current_uses,
    agent_id,
    installer_size_bytes,
    installer_generated_at,
    expiration_notified_at,
    description,
    used_by_agent,
    installer_sha256,
    CASE
        WHEN key IS NOT NULL THEN (SUBSTRING(key FROM 1 FOR 8) || '...' || SUBSTRING(key FROM length(key) - 3 FOR 4))
        ELSE NULL
    END AS key_masked
FROM enrollment_keys
WHERE tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid());

-- 1.4 agent_installation_metrics - Drop and recreate with tenant filter and security_invoker
DROP VIEW IF EXISTS public.agent_installation_metrics;

CREATE VIEW public.agent_installation_metrics
WITH (security_invoker = on)
AS
SELECT 
    date_trunc('day'::text, ia.created_at) AS date,
    ia.tenant_id,
    ia.platform,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE ia.success = true) AS successful_installs,
    count(*) FILTER (WHERE ia.success = false) AS failed_installs,
    count(*) FILTER (WHERE ia.success IS NULL) AS unknown_status,
    CASE 
        WHEN count(*) = 0 THEN 0::numeric
        ELSE round((count(*) FILTER (WHERE ia.success = true)::numeric / count(*)::numeric) * 100, 1)
    END AS success_rate_pct,
    round(avg(ia.installation_time_seconds), 1) AS avg_install_time_sec,
    min(ia.installation_time_seconds) AS min_install_time_sec,
    max(ia.installation_time_seconds) AS max_install_time_sec,
    count(*) FILTER (WHERE ia.platform = 'windows'::text) AS windows_count,
    count(*) FILTER (WHERE ia.platform = 'linux'::text) AS linux_count,
    count(*) FILTER (WHERE ia.network_connectivity = true) AS network_ok,
    count(*) FILTER (WHERE ia.network_connectivity = false) AS network_failed,
    count(*) FILTER (WHERE ia.network_connectivity IS NULL) AS network_unknown,
    count(*) FILTER (WHERE ia.agent_id IS NOT NULL) AS verified_count,
    count(*) FILTER (WHERE ia.agent_id IS NULL) AS unverified_count,
    count(*) FILTER (WHERE ia.event_type = 'post_installation'::text) AS verified_events,
    count(*) FILTER (WHERE ia.event_type = 'post_installation_unverified'::text) AS unverified_events,
    count(*) FILTER (WHERE ia.platform = 'windows'::text AND ia.installation_method = 'ps1'::text) AS windows_ps1_installs,
    count(*) FILTER (WHERE ia.platform = 'linux'::text AND ia.installation_method = 'bash'::text) AS linux_bash_installs
FROM installation_analytics ia
WHERE ia.event_type = ANY (ARRAY['post_installation'::text, 'post_installation_unverified'::text])
  AND ia.tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
GROUP BY (date_trunc('day'::text, ia.created_at)), ia.tenant_id, ia.platform
ORDER BY (date_trunc('day'::text, ia.created_at)) DESC, ia.tenant_id;

-- ============================================================
-- 2. FIX SECURITY DEFINER FUNCTIONS
-- ============================================================

-- 2.1 get_problematic_agents - Change to SECURITY INVOKER and add tenant validation
CREATE OR REPLACE FUNCTION public.get_problematic_agents(p_tenant_id uuid)
RETURNS TABLE(
    id uuid,
    agent_name text,
    status text,
    created_at timestamp with time zone,
    minutes_since_creation numeric,
    installation_success boolean,
    network_connectivity boolean,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Access denied: user does not belong to tenant %', p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name,
    a.status,
    a.enrolled_at AS created_at,
    EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::numeric / 60 AS minutes_since_creation,
    ia.success AS installation_success,
    ia.network_connectivity,
    ia.metadata
  FROM agents a
  LEFT JOIN LATERAL (
    SELECT success, network_connectivity, metadata
    FROM installation_analytics
    WHERE agent_id = a.id
      AND event_type = 'post_installation'
    ORDER BY created_at DESC
    LIMIT 1
  ) ia ON true
  WHERE a.status = 'pending'
    AND a.last_heartbeat IS NULL
    AND a.enrolled_at < NOW() - INTERVAL '5 minutes'
    AND a.tenant_id = p_tenant_id
  ORDER BY a.enrolled_at DESC;
END;
$$;

-- 2.2 diagnose_agent - Change to SECURITY INVOKER and add tenant validation
CREATE OR REPLACE FUNCTION public.diagnose_agent(p_agent_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_agent RECORD;
  v_token_info RECORD;
  v_jobs_info RECORD;
  v_issues jsonb[] := '{}';
  v_user_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_user_tenant_id 
  FROM user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;
  
  IF v_user_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not authenticated or no tenant assigned'
    );
  END IF;

  SELECT * INTO v_agent
  FROM agents
  WHERE agent_name = p_agent_name
    AND tenant_id = v_user_tenant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not found in your tenant',
      'agent_name', p_agent_name
    );
  END IF;
  
  SELECT 
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
    MAX(created_at) as last_token_created
  INTO v_token_info
  FROM agent_tokens
  WHERE agent_id = v_agent.id;
  
  IF v_token_info.active_tokens = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'no_active_token',
      'severity', 'critical',
      'message', 'No active tokens found for this agent'
    );
  END IF;
  
  IF v_agent.last_heartbeat IS NULL THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'never_connected',
      'severity', 'critical',
      'message', 'Agent never sent a heartbeat',
      'enrolled_at', v_agent.enrolled_at
    );
  ELSIF v_agent.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stale_heartbeat',
      'severity', 'high',
      'message', 'Last heartbeat was more than 10 minutes ago',
      'last_heartbeat', v_agent.last_heartbeat,
      'minutes_ago', EXTRACT(EPOCH FROM (NOW() - v_agent.last_heartbeat)) / 60
    );
  END IF;
  
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
  INTO v_jobs_info
  FROM jobs
  WHERE agent_id = v_agent.id;
  
  IF v_jobs_info.delivered_jobs > 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stuck_jobs',
      'severity', 'medium',
      'message', format('%s jobs stuck in delivered state', v_jobs_info.delivered_jobs)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.agent_name,
      'status', v_agent.status,
      'enrolled_at', v_agent.enrolled_at,
      'last_heartbeat', v_agent.last_heartbeat,
      'os_type', v_agent.os_type
    ),
    'tokens', v_token_info,
    'jobs', v_jobs_info,
    'issues', v_issues,
    'is_healthy', array_length(v_issues, 1) IS NULL
  );
END;
$$;

-- ============================================================
-- 3. RESTRICT ACCESS TO agent_releases
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_releases'
      AND policyname = 'Agents can read active releases'
  ) THEN
    DROP POLICY "Agents can read active releases" ON public.agent_releases;
  END IF;
END
$$;

CREATE POLICY "Authenticated users can read active releases"
ON public.agent_releases
FOR SELECT
TO authenticated
USING (is_active = true);

REVOKE ALL ON public.agent_releases FROM anon;

-- ============================================================
-- 4. ADD AUDIT COLUMNS TO sales_contacts
-- ============================================================

ALTER TABLE public.sales_contacts
ADD COLUMN IF NOT EXISTS client_ip text,
ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS idx_sales_contacts_ip_created 
ON public.sales_contacts(client_ip, created_at DESC);

-- ============================================================
-- 5. REMOVE PERMISSIVE sales_contacts POLICY
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sales_contacts'
      AND policyname = 'Anyone can submit contact form'
  ) THEN
    DROP POLICY "Anyone can submit contact form" ON public.sales_contacts;
  END IF;
END
$$;