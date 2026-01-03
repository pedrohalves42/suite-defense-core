-- Create institutional allowlist for SECURITY DEFINER views
CREATE TABLE IF NOT EXISTS public.security_definer_allowlist (
  view_name text PRIMARY KEY,
  rationale text NOT NULL,
  adr_reference text,
  approved_by text DEFAULT 'governance_team',
  approved_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_definer_allowlist ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
CREATE POLICY "Allow read for authenticated"
  ON public.security_definer_allowlist FOR SELECT
  TO authenticated
  USING (true);

-- Allow super_admin to manage
CREATE POLICY "Allow super_admin to manage"
  ON public.security_definer_allowlist FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Add comment for documentation
COMMENT ON TABLE public.security_definer_allowlist IS 'Institutional whitelist for approved SECURITY DEFINER views per governance policy';

-- Insert canonical view
INSERT INTO public.security_definer_allowlist (view_name, rationale, adr_reference)
VALUES (
  'active_agents',
  'Canonical operational view enforcing archived_at filtering and RLS separation per DATA-AGENT-001',
  'ADR-007-active-agents-view'
)
ON CONFLICT DO NOTHING;