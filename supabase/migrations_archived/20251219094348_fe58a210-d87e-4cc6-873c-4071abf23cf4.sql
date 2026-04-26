-- Adicionar unique constraint para permitir upsert na tabela agent_update_policies
ALTER TABLE public.agent_update_policies 
ADD CONSTRAINT agent_update_policies_platform_target_version_key 
UNIQUE (platform, target_version);