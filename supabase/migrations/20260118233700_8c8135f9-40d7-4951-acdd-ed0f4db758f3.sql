-- ADR-030: Adicionar security_invoker em 5 views criticas

-- v_dlq_risk_overview
DROP VIEW IF EXISTS public.v_dlq_risk_overview;
CREATE VIEW public.v_dlq_risk_overview WITH (security_invoker=on) AS
SELECT tenant_id,
    count(*) AS total_items,
    count(*) FILTER (WHERE (status = 'resolved')) AS resolved_items,
    count(*) FILTER (WHERE (resolved_by IS NOT NULL)) AS manually_reviewed,
    count(*) FILTER (WHERE flagged_suspicious) AS suspicious_items,
    count(*) FILTER (WHERE ((created_at < (now() - '24:00:00'::interval)) AND (status <> 'resolved'))) AS overdue_items,
    round(CASE WHEN (count(*) > 0) THEN ((count(*) FILTER (WHERE (resolved_by IS NOT NULL)))::numeric / (count(*))::numeric * 100) ELSE 0 END, 2) AS review_rate_pct
FROM failed_jobs_dlq
WHERE (created_at > (now() - '30 days'::interval))
GROUP BY tenant_id;

-- v_active_risk_debt
DROP VIEW IF EXISTS public.v_risk_debt_summary CASCADE;
DROP VIEW IF EXISTS public.v_risk_debt_active CASCADE;
DROP VIEW IF EXISTS public.v_active_risk_debt;
CREATE VIEW public.v_active_risk_debt WITH (security_invoker=on) AS
SELECT id, tenant_id, title, description, severity,
    risk_accepted_by, risk_accepted_at, risk_expiry_at, risk_justification,
    (EXTRACT(epoch FROM (risk_expiry_at - now())) / 86400) AS days_until_expiry,
    CASE WHEN (risk_expiry_at <= (now() + '7 days'::interval)) THEN 'expiring_soon' ELSE 'active' END AS risk_status
FROM tasks t
WHERE status = 'accepted_risk' AND (risk_expiry_at IS NULL OR risk_expiry_at > now());

-- v_risk_debt_active
CREATE VIEW public.v_risk_debt_active WITH (security_invoker=on) AS
SELECT id, tenant_id, title, severity,
    closed_at AS accepted_at,
    (closure_evidence ->> 'expiry_date')::timestamp with time zone AS expires_at,
    closure_reason AS justification,
    closed_by AS accepted_by,
    closure_evidence ->> 'approved_by' AS approved_by
FROM tasks t
WHERE status = 'accepted_risk' 
    AND (closure_evidence ->> 'expiry_date') IS NOT NULL 
    AND (closure_evidence ->> 'expiry_date')::timestamp with time zone > now();

-- v_risk_debt_summary
CREATE VIEW public.v_risk_debt_summary WITH (security_invoker=on) AS
SELECT tenant_id,
    count(*) AS total_active,
    count(*) FILTER (WHERE severity = 'critical') AS critical_count,
    count(*) FILTER (WHERE severity = 'high') AS high_count,
    count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < (now() + '7 days'::interval)) AS expiring_soon
FROM v_risk_debt_active
GROUP BY tenant_id;

-- v_incident_groups_with_slo (depende de v_incident_groups)
DROP VIEW IF EXISTS public.v_incident_groups_with_slo;
CREATE VIEW public.v_incident_groups_with_slo WITH (security_invoker=on) AS
SELECT ig.id, ig.fingerprint_hash, ig.source_type, ig.failure_class,
    ig.normalized_signature, ig.severity_hint, ig.total_occurrences,
    ig.distinct_tenants, ig.distinct_agents, ig.first_seen_at, ig.last_seen_at,
    ig.is_active, ig.is_ongoing,
    COALESCE(slo.slo_target, 99.0) AS slo_target,
    COALESCE(slo.error_budget, 0.01) AS error_budget,
    COALESCE(slo.burn_rate_1h, 0) AS burn_rate_1h,
    COALESCE(slo.burn_rate_6h, 0) AS burn_rate_6h,
    COALESCE(slo.burn_rate_24h, 0) AS burn_rate_24h,
    COALESCE(slo.budget_consumed, 0) AS budget_consumed,
    COALESCE(slo.budget_remaining, 100) AS budget_remaining,
    COALESCE(slo.status, 'ok') AS slo_status,
    COALESCE(slo.occurrences_1h, 0) AS occurrences_1h,
    COALESCE(slo.occurrences_6h, 0) AS occurrences_6h,
    slo.last_evaluated_at
FROM v_incident_groups ig
LEFT JOIN incident_slo_state slo ON slo.fingerprint_id = ig.id
ORDER BY COALESCE(slo.burn_rate_1h, 0) DESC NULLS LAST, 
    ig.severity_hint = 'critical' DESC, ig.total_occurrences DESC;