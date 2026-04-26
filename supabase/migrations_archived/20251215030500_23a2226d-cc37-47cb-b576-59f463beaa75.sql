-- P1: Adicionar campo priority na tabela jobs
-- Prioridade: 1 = critical (heartbeat, enroll), 2 = standard (metrics, inventory), 3 = heavy (vuln_scan, report)

-- Adicionar coluna priority
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS priority smallint DEFAULT 2;

-- Criar indice para ordenacao eficiente
CREATE INDEX IF NOT EXISTS idx_jobs_priority_created ON public.jobs (priority ASC, created_at ASC) 
WHERE status = 'queued';

-- Funcao para definir prioridade automaticamente baseado no tipo de job
CREATE OR REPLACE FUNCTION public.set_job_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Critical jobs (1): enrollment, heartbeat
    IF NEW.type IN ('enroll', 'heartbeat', 'update_agent') THEN
        NEW.priority := 1;
    -- Heavy jobs (3): scans, reports
    ELSIF NEW.type IN ('light_vuln_scan', 'report', 'full_scan') THEN
        NEW.priority := 3;
    -- Standard jobs (2): everything else
    ELSE
        NEW.priority := 2;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger para auto-definir prioridade
DROP TRIGGER IF EXISTS tr_set_job_priority ON public.jobs;
CREATE TRIGGER tr_set_job_priority
    BEFORE INSERT ON public.jobs
    FOR EACH ROW
    WHEN (NEW.priority IS NULL)
    EXECUTE FUNCTION public.set_job_priority();

-- Atualizar jobs existentes sem prioridade
UPDATE public.jobs SET priority = 1 WHERE type IN ('enroll', 'heartbeat', 'update_agent') AND priority IS NULL;
UPDATE public.jobs SET priority = 3 WHERE type IN ('light_vuln_scan', 'report', 'full_scan') AND priority IS NULL;
UPDATE public.jobs SET priority = 2 WHERE priority IS NULL;

-- Comentario para documentacao
COMMENT ON COLUMN public.jobs.priority IS 'Job priority: 1=critical (immediate), 2=standard, 3=heavy (can wait)';