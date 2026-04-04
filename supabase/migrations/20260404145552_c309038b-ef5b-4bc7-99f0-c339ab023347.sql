
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
      (SELECT SUM(tc.total_techniques) FROM tactic_coverage tc) AS ref_total,
      (SELECT SUM(tc.covered_techniques) FROM tactic_coverage tc) AS ref_covered,
      ROUND(
        ((SELECT SUM(tc.covered_techniques) FROM tactic_coverage tc)::numeric /
         NULLIF((SELECT SUM(tc.total_techniques) FROM tactic_coverage tc), 0)) * 100, 1
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
