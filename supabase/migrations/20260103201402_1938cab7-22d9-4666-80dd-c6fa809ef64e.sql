-- =============================================================
-- PATCH: Semantic Approval Correction + Enforcement
-- =============================================================

-- 1. BACKFILL: Materializar approved_at nas acoes ja aprovadas
UPDATE ai_actions
SET
  approved_at = created_at,
  approved_by = NULL
WHERE
  review_decision = 'approved'
  AND approved_at IS NULL;

-- 2. ENFORCEMENT TRIGGER: Garantir semantica futura
CREATE OR REPLACE FUNCTION enforce_ai_action_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.review_decision = 'approved' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, NEW.executed_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ai_action_approval ON ai_actions;

CREATE TRIGGER trg_enforce_ai_action_approval
BEFORE INSERT OR UPDATE ON ai_actions
FOR EACH ROW
EXECUTE FUNCTION enforce_ai_action_approval();

-- 3. EXPLAINABILITY: Adicionar coluna para explicacoes
ALTER TABLE ai_actions 
ADD COLUMN IF NOT EXISTS explanation text;

-- 4. CORRIGIR get_audit_raw_metrics: usar apenas approved_at IS NOT NULL
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics();

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_tenant_id uuid;
BEGIN
  -- Se nao passou tenant_id, pega o primeiro tenant ativo
  IF p_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM tenants WHERE status = 'active' LIMIT 1;
  ELSE
    v_tenant_id := p_tenant_id;
  END IF;

  SELECT jsonb_build_object(
    -- Tenant Isolation Metrics
    'tenant_isolation', (
      SELECT jsonb_build_object(
        'tables_with_tenant_id', (
          SELECT COUNT(DISTINCT table_name)
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name = 'tenant_id'
        ),
        'total_data_tables', (
          SELECT COUNT(*)
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND table_name NOT IN ('schema_migrations', 'spatial_ref_sys')
        ),
        'isolation_percentage', (
          SELECT ROUND(
            COUNT(DISTINCT c.table_name) FILTER (WHERE c.column_name = 'tenant_id')::numeric
            / NULLIF(COUNT(DISTINCT t.table_name), 0) * 100, 2
          )
          FROM information_schema.tables t
          LEFT JOIN information_schema.columns c 
            ON t.table_name = c.table_name AND t.table_schema = c.table_schema
          WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            AND t.table_name NOT IN ('schema_migrations', 'spatial_ref_sys')
        )
      )
    ),
    
    -- RBAC Metrics
    'rbac', (
      SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM user_roles WHERE tenant_id = v_tenant_id),
        'users_by_role', (
          SELECT COALESCE(jsonb_object_agg(role, cnt), '{}'::jsonb)
          FROM (
            SELECT role, COUNT(*) as cnt
            FROM user_roles
            WHERE tenant_id = v_tenant_id
            GROUP BY role
          ) r
        ),
        'admin_count', (SELECT COUNT(*) FROM user_roles WHERE tenant_id = v_tenant_id AND role = 'admin'),
        'operator_count', (SELECT COUNT(*) FROM user_roles WHERE tenant_id = v_tenant_id AND role = 'operator'),
        'viewer_count', (SELECT COUNT(*) FROM user_roles WHERE tenant_id = v_tenant_id AND role = 'viewer')
      )
    ),
    
    -- Enforcement Metrics
    'enforcement', (
      SELECT jsonb_build_object(
        'tables_with_rls', (
          SELECT COUNT(*)
          FROM pg_tables t
          JOIN pg_class c ON c.relname = t.tablename
          WHERE t.schemaname = 'public'
            AND c.relrowsecurity = true
        ),
        'total_tables', (
          SELECT COUNT(*)
          FROM pg_tables
          WHERE schemaname = 'public'
        ),
        'rls_coverage_pct', (
          SELECT ROUND(
            COUNT(*) FILTER (WHERE c.relrowsecurity = true)::numeric
            / NULLIF(COUNT(*), 0) * 100, 2
          )
          FROM pg_tables t
          JOIN pg_class c ON c.relname = t.tablename
          WHERE t.schemaname = 'public'
        ),
        'total_policies', (
          SELECT COUNT(*)
          FROM pg_policies
          WHERE schemaname = 'public'
        )
      )
    ),
    
    -- Human Oversight Metrics (CORRIGIDO: apenas approved_at IS NOT NULL)
    'human_oversight', (
      SELECT jsonb_build_object(
        'ai_actions_total', COUNT(*),
        'ai_actions_approved', COUNT(*) FILTER (WHERE approved_at IS NOT NULL),
        'ai_actions_rejected', COUNT(*) FILTER (WHERE review_decision = 'rejected'),
        'ai_actions_pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'ai_actions_approval_rate', ROUND(
          COUNT(*) FILTER (WHERE approved_at IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0) * 100, 2
        ),
        'high_risk_approved', COUNT(*) FILTER (
          WHERE approved_at IS NOT NULL 
          AND risk_level IN ('high', 'critical')
        ),
        'actions_with_explanation', COUNT(*) FILTER (WHERE explanation IS NOT NULL),
        'explanation_rate', ROUND(
          COUNT(*) FILTER (WHERE explanation IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0) * 100, 2
        )
      )
      FROM ai_actions
      WHERE tenant_id = v_tenant_id
    ),
    
    -- Decision Events
    'decision_events', (
      SELECT jsonb_build_object(
        'total_events', COUNT(*),
        'human_decisions', COUNT(*) FILTER (WHERE decision_source = 'human'),
        'system_decisions', COUNT(*) FILTER (WHERE decision_source = 'system'),
        'ai_decisions', COUNT(*) FILTER (WHERE decision_source = 'ai'),
        'human_decision_rate', ROUND(
          COUNT(*) FILTER (WHERE decision_source = 'human')::numeric
          / NULLIF(COUNT(*), 0) * 100, 2
        )
      )
      FROM decision_events
      WHERE tenant_id = v_tenant_id
    ),
    
    -- Audit Logs
    'audit_logs', (
      SELECT jsonb_build_object(
        'total_logs', COUNT(*),
        'sensitive_access_logs', COUNT(*) FILTER (WHERE action_type = 'access' AND severity = 'high'),
        'last_24h_logs', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
      )
      FROM audit_logs
      WHERE tenant_id = v_tenant_id
    ),
    
    -- Agents Health
    'agents', (
      SELECT jsonb_build_object(
        'total_agents', COUNT(*),
        'active_agents', COUNT(*) FILTER (WHERE status = 'active'),
        'inactive_agents', COUNT(*) FILTER (WHERE status != 'active'),
        'agents_last_seen_24h', COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours')
      )
      FROM agents
      WHERE tenant_id = v_tenant_id
    ),
    
    -- AI Explainability
    'ai_explainability', (
      SELECT jsonb_build_object(
        'actions_with_explanation_pct', ROUND(
          COUNT(*) FILTER (WHERE explanation IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0) * 100, 2
        ),
        'total_actions', COUNT(*),
        'explained_actions', COUNT(*) FILTER (WHERE explanation IS NOT NULL)
      )
      FROM ai_actions
      WHERE tenant_id = v_tenant_id
    ),
    
    -- Metadata
    'metadata', jsonb_build_object(
      'collected_at', NOW(),
      'tenant_id', v_tenant_id,
      'version', '2.0.0'
    )
  ) INTO result;

  RETURN result;
END;
$$;