
-- =============================================
-- ENTERPRISE UPGRADES: 5 New Capabilities
-- =============================================

-- ? 1. RULE DEPENDENCY GRAPH (Anti-loop)
-- Prevents Rule A ? Rule B ? Rule A cycles
CREATE TABLE IF NOT EXISTS public.automation_rule_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  rule_id UUID NOT NULL,
  depends_on_rule_id UUID NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'blocks' CHECK (relationship_type IN ('blocks', 'requires', 'conflicts')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT no_self_dependency CHECK (rule_id != depends_on_rule_id),
  CONSTRAINT unique_dependency UNIQUE (rule_id, depends_on_rule_id)
);

ALTER TABLE public.automation_rule_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for rule dependencies"
  ON public.automation_rule_dependencies FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE INDEX idx_rule_deps_rule ON public.automation_rule_dependencies (rule_id);
CREATE INDEX idx_rule_deps_depends ON public.automation_rule_dependencies (depends_on_rule_id);
CREATE INDEX idx_rule_deps_tenant ON public.automation_rule_dependencies (tenant_id);

-- RPC: Detect circular dependencies (loop detection via recursive CTE)
CREATE OR REPLACE FUNCTION public.detect_rule_dependency_loops(p_tenant_id UUID)
RETURNS TABLE(loop_path UUID[], loop_length INT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE dep_chain AS (
    SELECT 
      rule_id,
      depends_on_rule_id,
      ARRAY[rule_id, depends_on_rule_id] AS path,
      1 AS depth,
      (rule_id = depends_on_rule_id) AS is_cycle
    FROM automation_rule_dependencies
    WHERE tenant_id = p_tenant_id
    
    UNION ALL
    
    SELECT
      dc.rule_id,
      d.depends_on_rule_id,
      dc.path || d.depends_on_rule_id,
      dc.depth + 1,
      d.depends_on_rule_id = ANY(dc.path)
    FROM dep_chain dc
    JOIN automation_rule_dependencies d 
      ON dc.depends_on_rule_id = d.rule_id 
      AND d.tenant_id = p_tenant_id
    WHERE NOT dc.is_cycle AND dc.depth < 10
  )
  SELECT path AS loop_path, depth AS loop_length
  FROM dep_chain
  WHERE is_cycle;
$$;

-- RPC: Check if a specific rule is blocked by dependencies
CREATE OR REPLACE FUNCTION public.check_rule_dependencies(
  p_rule_id UUID,
  p_tenant_id UUID
)
RETURNS TABLE(blocked BOOLEAN, blocking_rule_id UUID, blocking_rule_name TEXT, relationship TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 
    TRUE AS blocked,
    d.depends_on_rule_id AS blocking_rule_id,
    r.name AS blocking_rule_name,
    d.relationship_type AS relationship
  FROM automation_rule_dependencies d
  LEFT JOIN automation_rules r ON r.id = d.depends_on_rule_id
  WHERE d.rule_id = p_rule_id
    AND d.tenant_id = p_tenant_id
    AND d.relationship_type IN ('blocks', 'conflicts')
    AND r.is_active = true
    AND EXISTS (
      SELECT 1 FROM automation_execution_log el
      WHERE el.rule_id = d.depends_on_rule_id
        AND el.executed_at > now() - interval '1 hour'
        AND el.success = true
    );
$$;

-- ? 2. ADAPTIVE BLAST RADIUS
-- Adjusts limits based on severity, business hours, and action type
CREATE TABLE IF NOT EXISTS public.adaptive_blast_radius_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  action_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  business_hours_max_percent NUMERIC NOT NULL DEFAULT 25,
  off_hours_max_percent NUMERIC NOT NULL DEFAULT 50,
  business_hours_start TIME NOT NULL DEFAULT '08:00',
  business_hours_end TIME NOT NULL DEFAULT '18:00',
  business_days INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_adaptive_blast UNIQUE (tenant_id, action_type, severity)
);

ALTER TABLE public.adaptive_blast_radius_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for adaptive blast radius"
  ON public.adaptive_blast_radius_config FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- RPC: Get adaptive blast radius limit
CREATE OR REPLACE FUNCTION public.get_adaptive_blast_radius(
  p_tenant_id UUID,
  p_action_type TEXT,
  p_severity TEXT DEFAULT 'medium'
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_config adaptive_blast_radius_config%ROWTYPE;
  v_now TIME;
  v_dow INT;
  v_limit NUMERIC;
BEGIN
  SELECT * INTO v_config
  FROM adaptive_blast_radius_config
  WHERE tenant_id = p_tenant_id
    AND action_type = p_action_type
    AND severity = p_severity;

  IF NOT FOUND THEN
    -- Fallback defaults based on severity
    CASE p_severity
      WHEN 'critical' THEN RETURN 80;
      WHEN 'high'     THEN RETURN 50;
      WHEN 'medium'   THEN RETURN 30;
      ELSE                  RETURN 15;
    END CASE;
  END IF;

  v_now := LOCALTIME;
  v_dow := EXTRACT(ISODOW FROM CURRENT_DATE)::INT;

  IF v_dow = ANY(v_config.business_days)
     AND v_now BETWEEN v_config.business_hours_start AND v_config.business_hours_end
  THEN
    v_limit := v_config.business_hours_max_percent;
  ELSE
    v_limit := v_config.off_hours_max_percent;
  END IF;

  -- Severity multiplier: critical events get 2x headroom
  IF p_severity = 'critical' THEN
    v_limit := LEAST(v_limit * 2, 100);
  END IF;

  RETURN v_limit;
END;
$$;

-- ? 3. TENANT RISK SCORE
-- Dynamic scoring based on blocked rules, open breakers, failure frequency
CREATE TABLE IF NOT EXISTS public.tenant_risk_scores (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id),
  risk_score NUMERIC NOT NULL DEFAULT 0,
  blocked_rules_ratio NUMERIC DEFAULT 0,
  open_circuit_breakers INT DEFAULT 0,
  failure_rate_1h NUMERIC DEFAULT 0,
  total_executions_24h INT DEFAULT 0,
  total_blocked_24h INT DEFAULT 0,
  risk_level TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN risk_score >= 80 THEN 'critical'
      WHEN risk_score >= 60 THEN 'high'
      WHEN risk_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  ) STORED,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for risk scores"
  ON public.tenant_risk_scores FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- RPC: Recalculate tenant risk score
CREATE OR REPLACE FUNCTION public.recalculate_tenant_risk_score(p_tenant_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total_rules INT;
  v_open_breakers INT;
  v_total_exec INT;
  v_total_blocked INT;
  v_failed_1h INT;
  v_total_1h INT;
  v_blocked_ratio NUMERIC;
  v_failure_rate NUMERIC;
  v_score NUMERIC;
BEGIN
  -- Count active rules
  SELECT COUNT(*) INTO v_total_rules
  FROM automation_rules WHERE tenant_id = p_tenant_id AND is_active = true;

  -- Count open circuit breakers
  SELECT COUNT(*) INTO v_open_breakers
  FROM automation_rules WHERE tenant_id = p_tenant_id AND circuit_state = 'open';

  -- 24h execution stats from decision log
  SELECT 
    COUNT(*) FILTER (WHERE executed = true),
    COUNT(*) FILTER (WHERE executed = false)
  INTO v_total_exec, v_total_blocked
  FROM automation_decision_log
  WHERE tenant_id = p_tenant_id
    AND created_at > now() - interval '24 hours';

  -- 1h failure rate from execution log
  SELECT 
    COUNT(*) FILTER (WHERE success = false),
    COUNT(*)
  INTO v_failed_1h, v_total_1h
  FROM automation_execution_log
  WHERE tenant_id = p_tenant_id
    AND executed_at > now() - interval '1 hour';

  v_blocked_ratio := CASE WHEN (v_total_exec + v_total_blocked) > 0
    THEN (v_total_blocked::NUMERIC / (v_total_exec + v_total_blocked)) * 100
    ELSE 0 END;

  v_failure_rate := CASE WHEN v_total_1h > 0
    THEN (v_failed_1h::NUMERIC / v_total_1h) * 100
    ELSE 0 END;

  -- Weighted score: breakers (40%) + failure rate (35%) + blocked ratio (25%)
  v_score := LEAST(100, (
    (LEAST(v_open_breakers, 5)::NUMERIC / 5 * 40) +
    (LEAST(v_failure_rate, 100) / 100 * 35) +
    (LEAST(v_blocked_ratio, 100) / 100 * 25)
  ));

  -- Upsert
  INSERT INTO tenant_risk_scores (
    tenant_id, risk_score, blocked_rules_ratio, open_circuit_breakers,
    failure_rate_1h, total_executions_24h, total_blocked_24h, calculated_at, updated_at
  ) VALUES (
    p_tenant_id, v_score, v_blocked_ratio, v_open_breakers,
    v_failure_rate, v_total_exec, v_total_blocked, now(), now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    blocked_rules_ratio = EXCLUDED.blocked_rules_ratio,
    open_circuit_breakers = EXCLUDED.open_circuit_breakers,
    failure_rate_1h = EXCLUDED.failure_rate_1h,
    total_executions_24h = EXCLUDED.total_executions_24h,
    total_blocked_24h = EXCLUDED.total_blocked_24h,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = EXCLUDED.updated_at;

  RETURN v_score;
END;
$$;

-- ? 4. IDEMPOTENCY KEY for execution deduplication
ALTER TABLE public.automation_execution_log 
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exec_log_idempotency 
  ON public.automation_execution_log (idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- ? 5. DISTRIBUTED LOCKING per rule (advisory locks)
CREATE OR REPLACE FUNCTION public.try_acquire_rule_lock(p_rule_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lock_key BIGINT;
BEGIN
  -- Convert UUID to a stable bigint for pg_advisory lock
  v_lock_key := ('x' || substr(p_rule_id::TEXT, 1, 16))::BIT(64)::BIGINT;
  RETURN pg_try_advisory_xact_lock(v_lock_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_rule_lock(p_rule_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Advisory xact locks are released at transaction end automatically
  -- This function exists for API symmetry
  NULL;
END;
$$;

-- Immutability trigger for decision log (already exists, ensure coverage)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_rule_deps') THEN
    -- Prevent updates/deletes on dependency graph for audit
    CREATE TRIGGER trg_immutable_rule_deps
      BEFORE UPDATE OR DELETE ON public.automation_rule_dependencies
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_audit_modification();
  END IF;
END $$;
