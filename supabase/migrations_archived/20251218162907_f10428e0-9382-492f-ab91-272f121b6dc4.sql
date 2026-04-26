-- ============================================================
-- AJUSTE 1: Telemetria de Decisao de Rollout
-- ============================================================
CREATE TABLE public.agent_update_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  platform text NOT NULL,
  target_version text NOT NULL,
  bucket integer NOT NULL CHECK (bucket BETWEEN 0 AND 99),
  rollout_percentage integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allowed', 'skipped', 'no_policy', 'already_current')),
  current_version text,
  created_at timestamptz DEFAULT now()
);

-- Indices para queries
CREATE INDEX idx_update_decisions_agent ON agent_update_decisions(agent_id, created_at DESC);
CREATE INDEX idx_update_decisions_decision ON agent_update_decisions(decision, created_at DESC);
CREATE INDEX idx_update_decisions_platform ON agent_update_decisions(platform, created_at DESC);

-- RLS
ALTER TABLE agent_update_decisions ENABLE ROW LEVEL SECURITY;

-- Super admin pode ver tudo (telemetria global)
CREATE POLICY "super_admin_view_decisions" ON agent_update_decisions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Cleanup automatico de decisoes antigas (> 30 dias)
CREATE OR REPLACE FUNCTION cleanup_old_update_decisions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM agent_update_decisions
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- ============================================================
-- FASE 2: Assinatura Criptografica Ed25519
-- ============================================================
ALTER TABLE public.agent_releases
ADD COLUMN IF NOT EXISTS signature_base64 text,
ADD COLUMN IF NOT EXISTS signed_at timestamptz,
ADD COLUMN IF NOT EXISTS signed_by text;

-- Comentario explicativo
COMMENT ON COLUMN agent_releases.signature_base64 IS 'Ed25519 signature of script_content in Base64 format';
COMMENT ON COLUMN agent_releases.signed_at IS 'Timestamp when the release was cryptographically signed';
COMMENT ON COLUMN agent_releases.signed_by IS 'Identifier of who signed the release (CI, manual, operator name)';