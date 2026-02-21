-- agent_releases has no tenant_id, it's global - allow all authenticated to read
ALTER TABLE public.agent_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_releases_select_authenticated"
  ON public.agent_releases FOR SELECT
  USING (true);