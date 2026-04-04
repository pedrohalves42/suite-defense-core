
-- RPC: get_mitre_coverage_by_tactic(tenant_uuid UUID)
-- Returns coverage metrics per MITRE tactic
CREATE OR REPLACE FUNCTION public.get_mitre_coverage_by_tactic(tenant_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  WITH reference_techniques AS (
    SELECT technique_id, tactic, technique_name, platforms
    FROM mitre_attack_techniques
  ),
  covered_techniques AS (
    SELECT DISTINCT mitre_technique_id, mitre_tactic
    FROM detection_rules
    WHERE is_enabled = true
      AND mitre_technique_id IS NOT NULL
      AND (tenant_id IS NULL OR tenant_id = tenant_uuid)
  ),
  tactic_coverage AS (
    SELECT
      rt.tactic,
      COUNT(DISTINCT rt.technique_id) AS total_techniques,
      COUNT(DISTINCT ct.mitre_technique_id) AS covered_techniques,
      ROUND(
        (COUNT(DISTINCT ct.mitre_technique_id)::numeric /
         NULLIF(COUNT(DISTINCT rt.technique_id), 0)) * 100, 1
      ) AS coverage_pct,
      ARRAY_AGG(DISTINCT rt.technique_id)
        FILTER (WHERE ct.mitre_technique_id IS NULL) AS uncovered_ids
    FROM reference_techniques rt
    LEFT JOIN covered_techniques ct
      ON rt.technique_id = ct.mitre_technique_id
      AND rt.tactic = ct.mitre_tactic
    GROUP BY rt.tactic
    ORDER BY coverage_pct DESC
  ),
  -- Also count detection_rules techniques NOT in reference table
  extra_covered AS (
    SELECT COUNT(DISTINCT mitre_technique_id) AS extra_count
    FROM detection_rules
    WHERE is_enabled = true
      AND mitre_technique_id IS NOT NULL
      AND (tenant_id IS NULL OR tenant_id = tenant_uuid)
      AND mitre_technique_id NOT IN (SELECT technique_id FROM mitre_attack_techniques)
  ),
  summary AS (
    SELECT
      SUM(total_techniques) AS ref_total,
      SUM(covered_techniques) AS ref_covered,
      ROUND(
        (SUM(covered_techniques)::numeric / NULLIF(SUM(total_techniques), 0)) * 100, 1
      ) AS overall_pct,
      (SELECT COUNT(DISTINCT mitre_technique_id) FROM detection_rules
       WHERE is_enabled = true AND mitre_technique_id IS NOT NULL
       AND (tenant_id IS NULL OR tenant_id = tenant_uuid)) AS total_active_rules_techniques,
      (SELECT COUNT(*) FROM detection_rules
       WHERE is_enabled = true AND (tenant_id IS NULL OR tenant_id = tenant_uuid)) AS total_active_rules,
      (SELECT extra_count FROM extra_covered) AS extra_techniques
  )
  SELECT json_build_object(
    'timestamp', now(),
    'summary', (SELECT row_to_json(s) FROM summary s),
    'tactics', (SELECT json_agg(row_to_json(t)) FROM tactic_coverage t)
  ) INTO result;

  RETURN result;
END;
$$;

-- RPC: snapshot_mitre_coverage(tenant_uuid UUID)
-- Saves current coverage into mitre_coverage_snapshot for historical tracking
CREATE OR REPLACE FUNCTION public.snapshot_mitre_coverage(tenant_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT := 0;
  snap_date DATE := CURRENT_DATE;
BEGIN
  -- Delete existing snapshot for today to allow re-run
  DELETE FROM mitre_coverage_snapshot
  WHERE tenant_id = tenant_uuid AND snapshot_date = snap_date;

  -- Insert coverage data
  WITH covered AS (
    SELECT
      mitre_technique_id AS technique_id,
      COUNT(*) AS detection_count,
      MAX(updated_at) AS last_detected_at
    FROM detection_rules
    WHERE is_enabled = true
      AND mitre_technique_id IS NOT NULL
      AND (tenant_id IS NULL OR tenant_id = tenant_uuid)
    GROUP BY mitre_technique_id
  )
  INSERT INTO mitre_coverage_snapshot (tenant_id, technique_id, detection_count, last_detected_at, coverage_status, snapshot_date)
  SELECT
    tenant_uuid,
    mat.technique_id,
    COALESCE(c.detection_count, 0),
    c.last_detected_at,
    CASE
      WHEN c.detection_count >= 3 THEN 'high'
      WHEN c.detection_count >= 1 THEN 'partial'
      ELSE 'none'
    END,
    snap_date
  FROM mitre_attack_techniques mat
  LEFT JOIN covered c ON mat.technique_id = c.technique_id;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN json_build_object('snapshot_date', snap_date, 'rows_inserted', inserted_count);
END;
$$;
