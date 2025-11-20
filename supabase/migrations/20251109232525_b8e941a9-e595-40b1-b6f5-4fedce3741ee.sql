-- Remove politicas RLS inseguras que permitem acesso publico
-- Estas politicas usam "using: true" o que permite acesso a qualquer um

-- agent_tokens: Remover politica insegura
DROP POLICY IF EXISTS "Service role tem acesso total aos tokens" ON public.agent_tokens;

-- agents: Remover politica insegura  
DROP POLICY IF EXISTS "Service role has full access to agents" ON public.agents;

-- enrollment_keys: Remover politica insegura
DROP POLICY IF EXISTS "Service role has full access to enrollment keys" ON public.enrollment_keys;

-- hmac_signatures: Remover politica insegura
DROP POLICY IF EXISTS "Service role tem acesso total as assinaturas HMAC" ON public.hmac_signatures;

-- rate_limits: Remover politica insegura
DROP POLICY IF EXISTS "Service role tem acesso total aos rate limits" ON public.rate_limits;

-- jobs: Remover politica insegura
DROP POLICY IF EXISTS "Service role has full access to jobs" ON public.jobs;

-- reports: Remover politica insegura se existir
DROP POLICY IF EXISTS "Service role has full access to reports" ON public.reports;

-- virus_scans: Remover politica insegura se existir
DROP POLICY IF EXISTS "Service role has full access to virus scans" ON public.virus_scans;

-- quarantined_files: Remover politica insegura se existir
DROP POLICY IF EXISTS "Service role has full access to quarantined files" ON public.quarantined_files;

-- invites: Remover politica insegura se existir
DROP POLICY IF EXISTS "Service role has full access to invites" ON public.invites;

-- api_keys: Remover politica insegura se existir
DROP POLICY IF EXISTS "Service role has full access to api_keys" ON public.api_keys;

-- api_request_logs: Remover politica insegura se existir
DROP POLICY IF EXISTS "Service role has full access to api_request_logs" ON public.api_request_logs;

-- NOTA: Edge functions que usam SUPABASE_SERVICE_ROLE_KEY automaticamente
-- bypassam RLS, entao nao precisam dessas politicas.
-- Remover essas politicas garante que apenas edge functions com service role
-- podem acessar esses dados, nao usuarios com anon key.