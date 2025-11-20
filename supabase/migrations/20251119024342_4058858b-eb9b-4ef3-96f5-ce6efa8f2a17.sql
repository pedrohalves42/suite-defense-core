-- FASE 3: Migration FK + Limpeza de Jobs Orfaos
-- Objetivo: Adicionar coluna agent_id com FK CASCADE e limpar dados orfaos

-- 1) Deletar jobs orfaos (nao ha agent_name correspondente na tabela agents)
DELETE FROM jobs
WHERE agent_name IS NOT NULL
  AND agent_name NOT IN (
    SELECT agent_name FROM agents WHERE agent_name IS NOT NULL
  );

-- 2) Criar coluna agent_id se nao existir
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS agent_id UUID;

-- 3) Popular agent_id com base em agent_name
UPDATE jobs j
SET agent_id = a.id
FROM agents a
WHERE j.agent_name = a.agent_name
  AND j.agent_id IS NULL;

-- 4) Adicionar FK com CASCADE (deletar jobs quando agente for deletado)
ALTER TABLE jobs
ADD CONSTRAINT jobs_agent_id_fkey
  FOREIGN KEY (agent_id)
  REFERENCES agents(id)
  ON DELETE CASCADE;

-- 5) Criar indice para melhorar performance de queries por agent_id
CREATE INDEX IF NOT EXISTS idx_jobs_agent_id ON jobs(agent_id);

-- Comentario para documentacao
COMMENT ON COLUMN jobs.agent_id IS 
  'FK para agents.id com ON DELETE CASCADE para evitar jobs orfaos quando um agente e deletado.';