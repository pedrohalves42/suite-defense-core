-- ========================================
-- FASE 1: Melhoria do Pipeline de Build EXE
-- ========================================

-- 1. Adicionar coluna script_hash para cache key composto
-- (A tabela ja tem tenant_id, usaremos hash do script para criar cache key)
ALTER TABLE agent_builds
ADD COLUMN IF NOT EXISTS script_hash TEXT;

-- 2. Adicionar coluna cache_key computada para lookup rapido
ALTER TABLE agent_builds
ADD COLUMN IF NOT EXISTS cache_key TEXT GENERATED ALWAYS AS (
  md5(tenant_id::text || COALESCE(script_hash, '') || COALESCE(exe_version, 'v3.0.0'))
) STORED;

-- 3. Indice para lookup rapido de builds cacheados
CREATE INDEX IF NOT EXISTS idx_agent_builds_cache_lookup 
ON agent_builds(cache_key, build_status, build_completed_at DESC)
WHERE build_status = 'completed';

-- 4. Indice para buscar builds recentes completados por tenant
CREATE INDEX IF NOT EXISTS idx_agent_builds_tenant_completed 
ON agent_builds(tenant_id, build_status, build_completed_at DESC)
WHERE build_status = 'completed';

-- 5. Habilitar Realtime na tabela agent_builds para notificacoes push
ALTER PUBLICATION supabase_realtime ADD TABLE agent_builds;

-- 6. Comentario de documentacao
COMMENT ON COLUMN agent_builds.cache_key IS 'Cache key computado: md5(tenant_id + script_hash + version). Usado para evitar rebuilds desnecessarios.';
COMMENT ON COLUMN agent_builds.script_hash IS 'SHA256 do script do agente usado no build. Permite cache quando script nao muda.';