-- Atualizar constraint para incluir 'macos' como plataforma valida
ALTER TABLE public.agent_versions DROP CONSTRAINT agent_versions_platform_check;
ALTER TABLE public.agent_versions ADD CONSTRAINT agent_versions_platform_check 
  CHECK (platform = ANY (ARRAY['windows'::text, 'linux'::text, 'macos'::text]));