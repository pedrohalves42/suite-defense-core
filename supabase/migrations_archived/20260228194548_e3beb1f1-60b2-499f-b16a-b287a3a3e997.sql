
-- Add skip_firewall_remediation flag to agents table
-- When true, the agent will NOT auto-remediate disabled Windows Firewall profiles
-- Useful for environments with pfSense/external firewalls where Windows Firewall should stay off
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS skip_firewall_remediation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agents.skip_firewall_remediation IS 'When true, agent skips auto-remediation of disabled Windows Firewall profiles (for pfSense/external firewall environments)';
