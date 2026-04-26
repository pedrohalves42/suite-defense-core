-- Fix missing table grants for agent_tokens and agent_releases
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tokens TO authenticated;
GRANT SELECT ON public.agent_releases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO authenticated;