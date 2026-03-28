
-- Fix SECURITY DEFINER view issue by adding security_invoker=true
-- This ensures the view respects RLS policies of the querying user

DROP VIEW IF EXISTS public.v_action_center;

CREATE VIEW public.v_action_center WITH (security_invoker = true) AS
SELECT pe.id AS item_id,
    'playbook'::text AS source_type,
    pe.tenant_id,
    pe.agent_id,
    a.agent_name,
    a.hostname,
    pb.name AS title,
    pb.description,
    pb.severity,
    pe.risk_score,
    pe.status AS action_status,
        CASE
            WHEN (pe.playbook_snapshot IS NOT NULL) THEN (pe.playbook_snapshot ->> 'execution_mode'::text)
            ELSE 'manual'::text
        END AS execution_mode,
    pe.trigger_context AS context,
    pe.triggered_at AS created_at,
    pb.trigger_type,
    pb.id AS playbook_id,
    ((COALESCE(pe.risk_score, (0)::numeric) * (2)::numeric) + (
        CASE pb.severity
            WHEN 'critical'::text THEN 100
            WHEN 'high'::text THEN 50
            WHEN 'medium'::text THEN 20
            ELSE 5
        END)::numeric) AS priority_score
   FROM ((playbook_executions pe
     JOIN playbooks pb ON ((pb.id = pe.playbook_id)))
     LEFT JOIN agents a ON ((a.id = pe.agent_id)))
  WHERE (pe.status = 'pending'::text)
UNION ALL
 SELECT sa.id AS item_id,
    'alert'::text AS source_type,
    sa.tenant_id,
    sa.agent_id,
    a.agent_name,
    a.hostname,
    sa.title,
    sa.message AS description,
    sa.severity,
    NULL::integer AS risk_score,
    'pending'::text AS action_status,
    NULL::text AS execution_mode,
    sa.details AS context,
    sa.created_at,
    sa.alert_type AS trigger_type,
    NULL::uuid AS playbook_id,
    ((
        CASE sa.severity
            WHEN 'critical'::text THEN 100
            WHEN 'high'::text THEN 50
            WHEN 'medium'::text THEN 20
            ELSE 5
        END)::numeric + (EXTRACT(epoch FROM (now() - sa.created_at)) / (3600)::numeric)) AS priority_score
   FROM (system_alerts sa
     LEFT JOIN agents a ON ((a.id = sa.agent_id)))
  WHERE ((sa.resolved = false) AND (sa.severity = ANY (ARRAY['critical'::text, 'high'::text])))
UNION ALL
 SELECT a.id AS item_id,
    'agent_offline'::text AS source_type,
    a.tenant_id,
    a.id AS agent_id,
    a.agent_name,
    a.hostname,
    'Computador offline de forma inesperada'::text AS title,
        CASE
            WHEN (a.offline_reason ~~ '%crash%'::text) THEN 'Este computador parou de responder de forma inesperada e pode indicar problema grave.'::text
            ELSE 'Este computador esta offline e pode necessitar de atencao.'::text
        END AS description,
        CASE
            WHEN (a.offline_reason ~~ '%crash%'::text) THEN 'high'::text
            WHEN ((EXTRACT(epoch FROM (now() - a.offline_detected_at)) / (3600)::numeric) > (24)::numeric) THEN 'medium'::text
            ELSE 'low'::text
        END AS severity,
    NULL::integer AS risk_score,
    'pending'::text AS action_status,
    NULL::text AS execution_mode,
    jsonb_build_object('offline_reason', a.offline_reason, 'hours_offline', round((EXTRACT(epoch FROM (now() - a.offline_detected_at)) / (3600)::numeric), 1), 'last_heartbeat', a.last_heartbeat) AS context,
    a.offline_detected_at AS created_at,
    'agent_offline'::text AS trigger_type,
    NULL::uuid AS playbook_id,
    ((
        CASE
            WHEN (a.offline_reason ~~ '%crash%'::text) THEN 80
            ELSE 30
        END)::numeric + LEAST((EXTRACT(epoch FROM (now() - a.offline_detected_at)) / (3600)::numeric), (48)::numeric)) AS priority_score
   FROM agents a
  WHERE ((a.status = 'offline'::text) AND (a.offline_detected_at IS NOT NULL) AND (a.offline_detected_at > (now() - '7 days'::interval)));

-- Grant access to authenticated users
GRANT SELECT ON public.v_action_center TO authenticated;
