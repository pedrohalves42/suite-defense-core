-- ADR-034: Burn Rate & SLO por Incident Group
-- ===========================================

-- 1. Tabela principal: incident_slo_state
CREATE TABLE incident_slo_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_id uuid NOT NULL UNIQUE 
    REFERENCES failure_fingerprints(id) ON DELETE CASCADE,
  
  -- SLO Target (inferido da severidade)
  slo_target numeric NOT NULL DEFAULT 99.5,
  error_budget numeric NOT NULL DEFAULT 0.005,
  
  -- Burn Rates em multiplas janelas
  burn_rate_1h numeric NOT NULL DEFAULT 0,
  burn_rate_6h numeric NOT NULL DEFAULT 0,
  burn_rate_24h numeric NOT NULL DEFAULT 0,
  
  -- Orcamento consumido
  budget_consumed numeric NOT NULL DEFAULT 0,
  budget_remaining numeric NOT NULL DEFAULT 100,
  
  -- Metricas de contexto
  occurrences_1h integer NOT NULL DEFAULT 0,
  occurrences_6h integer NOT NULL DEFAULT 0,
  occurrences_24h integer NOT NULL DEFAULT 0,
  expected_rate_1h numeric NOT NULL DEFAULT 0,
  
  -- Estado
  status text NOT NULL DEFAULT 'ok' 
    CHECK (status IN ('ok', 'alert', 'warning', 'high', 'critical')),
  last_task_id uuid,
  
  -- Timestamps
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_incident_slo_fingerprint ON incident_slo_state(fingerprint_id);
CREATE INDEX idx_incident_slo_status ON incident_slo_state(status);
CREATE INDEX idx_incident_slo_burn_rate ON incident_slo_state(burn_rate_1h DESC);

-- 2. RLS Policies
ALTER TABLE incident_slo_state ENABLE ROW LEVEL SECURITY;

-- Leitura global (fingerprints sao cross-tenant para analise)
CREATE POLICY "incident_slo_read" ON incident_slo_state
  FOR SELECT TO authenticated USING (true);

-- Write via funcoes internas (SECURITY DEFINER)
CREATE POLICY "incident_slo_service_write" ON incident_slo_state
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Funcao: get_slo_target_for_severity
CREATE OR REPLACE FUNCTION get_slo_target_for_severity(p_severity text)
RETURNS numeric AS $$
BEGIN
  RETURN CASE p_severity
    WHEN 'critical' THEN 99.9
    WHEN 'high' THEN 99.5
    WHEN 'medium' THEN 99.0
    WHEN 'low' THEN 98.0
    ELSE 99.0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Funcao: calculate_incident_burn_rate
CREATE OR REPLACE FUNCTION calculate_incident_burn_rate(
  p_fingerprint_id uuid
) RETURNS void AS $$
DECLARE
  v_fp RECORD;
  v_occ_1h integer;
  v_occ_6h integer;
  v_occ_24h integer;
  v_expected_1h numeric;
  v_burn_1h numeric;
  v_burn_6h numeric;
  v_burn_24h numeric;
  v_slo_target numeric;
  v_error_budget numeric;
  v_budget_consumed numeric;
  v_status text;
BEGIN
  -- Buscar fingerprint
  SELECT * INTO v_fp FROM failure_fingerprints 
  WHERE id = p_fingerprint_id;
  
  IF NOT FOUND THEN RETURN; END IF;
  
  -- Contar ocorrencias por janela
  SELECT COUNT(*) INTO v_occ_1h
  FROM failure_occurrences
  WHERE fingerprint_id = p_fingerprint_id
    AND occurred_at > now() - interval '1 hour';
    
  SELECT COUNT(*) INTO v_occ_6h
  FROM failure_occurrences
  WHERE fingerprint_id = p_fingerprint_id
    AND occurred_at > now() - interval '6 hours';
    
  SELECT COUNT(*) INTO v_occ_24h
  FROM failure_occurrences
  WHERE fingerprint_id = p_fingerprint_id
    AND occurred_at > now() - interval '24 hours';
  
  -- Calcular SLO e error budget
  v_slo_target := get_slo_target_for_severity(v_fp.severity_hint);
  v_error_budget := (100 - v_slo_target) / 100;
  
  -- Taxa esperada baseada em historico (media por hora desde first_seen)
  v_expected_1h := GREATEST(
    v_fp.total_occurrences::numeric / 
    GREATEST(EXTRACT(EPOCH FROM now() - v_fp.first_seen_at) / 3600, 1),
    0.1
  );
  
  -- Calcular burn rates
  -- Burn rate = (falhas observadas / falhas esperadas no orcamento)
  v_burn_1h := CASE 
    WHEN v_expected_1h * v_error_budget > 0 
    THEN v_occ_1h / (v_expected_1h * v_error_budget)
    ELSE 0 
  END;
  
  v_burn_6h := CASE 
    WHEN v_expected_1h * 6 * v_error_budget > 0 
    THEN v_occ_6h / (v_expected_1h * 6 * v_error_budget)
    ELSE 0 
  END;
  
  v_burn_24h := CASE 
    WHEN v_expected_1h * 24 * v_error_budget > 0 
    THEN v_occ_24h / (v_expected_1h * 24 * v_error_budget)
    ELSE 0 
  END;
  
  -- Budget consumido (ultimas 24h como percentual)
  v_budget_consumed := LEAST(v_burn_24h * 100, 100);
  
  -- Determinar status baseado em burn rate
  v_status := CASE
    WHEN v_burn_1h >= 5 AND v_burn_6h >= 2 THEN 'critical'
    WHEN v_burn_1h >= 4 OR v_burn_6h >= 2 THEN 'high'
    WHEN v_burn_1h >= 2 OR v_burn_6h >= 1.5 THEN 'warning'
    WHEN v_burn_1h >= 1 THEN 'alert'
    ELSE 'ok'
  END;
  
  -- UPSERT estado SLO
  INSERT INTO incident_slo_state (
    fingerprint_id, slo_target, error_budget,
    burn_rate_1h, burn_rate_6h, burn_rate_24h,
    occurrences_1h, occurrences_6h, occurrences_24h,
    expected_rate_1h, budget_consumed, budget_remaining,
    status, last_evaluated_at, updated_at
  ) VALUES (
    p_fingerprint_id, v_slo_target, v_error_budget,
    v_burn_1h, v_burn_6h, v_burn_24h,
    v_occ_1h, v_occ_6h, v_occ_24h,
    v_expected_1h, v_budget_consumed, 100 - v_budget_consumed,
    v_status, now(), now()
  )
  ON CONFLICT (fingerprint_id) DO UPDATE SET
    slo_target = EXCLUDED.slo_target,
    error_budget = EXCLUDED.error_budget,
    burn_rate_1h = EXCLUDED.burn_rate_1h,
    burn_rate_6h = EXCLUDED.burn_rate_6h,
    burn_rate_24h = EXCLUDED.burn_rate_24h,
    occurrences_1h = EXCLUDED.occurrences_1h,
    occurrences_6h = EXCLUDED.occurrences_6h,
    occurrences_24h = EXCLUDED.occurrences_24h,
    expected_rate_1h = EXCLUDED.expected_rate_1h,
    budget_consumed = EXCLUDED.budget_consumed,
    budget_remaining = EXCLUDED.budget_remaining,
    status = EXCLUDED.status,
    last_evaluated_at = EXCLUDED.last_evaluated_at,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 5. Funcao: refresh_all_incident_slos
CREATE OR REPLACE FUNCTION refresh_all_incident_slos()
RETURNS integer AS $$
DECLARE
  v_fp_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_fp_id IN 
    SELECT id FROM failure_fingerprints WHERE is_active = true
  LOOP
    PERFORM calculate_incident_burn_rate(v_fp_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 6. Trigger: Atualizar SLO quando nova ocorrencia
CREATE OR REPLACE FUNCTION trigger_update_incident_slo()
RETURNS trigger AS $$
BEGIN
  -- Recalcular burn rate quando nova ocorrencia
  PERFORM calculate_incident_burn_rate(NEW.fingerprint_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER tr_update_incident_slo
  AFTER INSERT ON failure_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_incident_slo();

-- 7. View: v_incident_groups_with_slo
CREATE OR REPLACE VIEW v_incident_groups_with_slo AS
SELECT
  ig.id,
  ig.fingerprint_hash,
  ig.source_type,
  ig.failure_class,
  ig.normalized_signature,
  ig.severity_hint,
  ig.total_occurrences,
  ig.distinct_tenants,
  ig.distinct_agents,
  ig.first_seen_at,
  ig.last_seen_at,
  ig.is_active,
  ig.is_ongoing,
  -- SLO data
  COALESCE(slo.slo_target, 99.0) as slo_target,
  COALESCE(slo.error_budget, 0.01) as error_budget,
  COALESCE(slo.burn_rate_1h, 0) as burn_rate_1h,
  COALESCE(slo.burn_rate_6h, 0) as burn_rate_6h,
  COALESCE(slo.burn_rate_24h, 0) as burn_rate_24h,
  COALESCE(slo.budget_consumed, 0) as budget_consumed,
  COALESCE(slo.budget_remaining, 100) as budget_remaining,
  COALESCE(slo.status, 'ok') as slo_status,
  COALESCE(slo.occurrences_1h, 0) as occurrences_1h,
  COALESCE(slo.occurrences_6h, 0) as occurrences_6h,
  slo.last_evaluated_at
FROM v_incident_groups ig
LEFT JOIN incident_slo_state slo ON slo.fingerprint_id = ig.id
ORDER BY 
  COALESCE(slo.burn_rate_1h, 0) DESC NULLS LAST,
  ig.severity_hint = 'critical' DESC,
  ig.total_occurrences DESC;