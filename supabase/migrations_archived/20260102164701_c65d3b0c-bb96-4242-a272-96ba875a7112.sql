
-- Apenas corrigir search_path em cleanup_orphaned_agents existente
ALTER FUNCTION public.cleanup_orphaned_agents() SET search_path = public;
