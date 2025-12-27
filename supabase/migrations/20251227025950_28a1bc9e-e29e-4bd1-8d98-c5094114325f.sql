-- Migration 3: Insert 3 new decision rules (fixed column name)
INSERT INTO public.decision_rules (code, description, scope, definition, is_enabled)
VALUES 
(
  'AGENT_THROTTLE_002',
  'Reduce polling frequency for agents consuming excessive resources',
  'agent',
  '{
    "trigger": "resource_abuse",
    "conditions": {
      "requests_per_minute": 60,
      "error_rate_percent": 50,
      "time_window_minutes": 5
    },
    "action": "throttle",
    "parameters": {
      "poll_interval_seconds": 300,
      "duration_minutes": 30
    }
  }'::jsonb,
  true
),
(
  'AGENT_ISOLATE_003',
  'Isolate agents exhibiting malicious behavior patterns',
  'agent',
  '{
    "trigger": "security_threat",
    "conditions": {
      "suspicious_events_count": 5,
      "time_window_minutes": 10,
      "event_types": ["unauthorized_access", "data_exfiltration", "privilege_escalation"]
    },
    "action": "isolate",
    "parameters": {
      "block_all_jobs": true,
      "require_admin_review": true
    }
  }'::jsonb,
  true
),
(
  'UPDATE_BLOCK_004',
  'Block problematic agent versions from being deployed',
  'version',
  '{
    "trigger": "version_issues",
    "conditions": {
      "failure_rate_percent": 30,
      "affected_agents_count": 3,
      "time_window_hours": 24
    },
    "action": "block_version",
    "parameters": {
      "prevent_new_installs": true,
      "notify_admins": true
    }
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  definition = EXCLUDED.definition,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();