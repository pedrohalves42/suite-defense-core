-- 1. Função de Validação de Integridade de Jobs (Correção F-005)
CREATE OR REPLACE FUNCTION public.check_job_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_record_count INTEGER := 0;
BEGIN
    -- Só validamos quando o status muda para 'completed'
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        
        -- Verificação específica por tipo de job
        CASE NEW.type
            WHEN 'software_inventory' THEN
                SELECT COUNT(*) INTO v_record_count FROM public.software_installed WHERE agent_id = NEW.agent_id;
                IF v_record_count = 0 THEN
                    RAISE EXCEPTION 'JOB_INTEGRITY_VIOLATION: software_inventory requires records in software_installed';
                END IF;
                
            WHEN 'web_activity' THEN
                SELECT COUNT(*) INTO v_record_count FROM public.agent_web_activity WHERE agent_id = NEW.agent_id;
                IF v_record_count = 0 THEN
                    -- Nota: Atividade web pode ser vazia legitimamente se não houver tráfego,
                    -- mas o orquestrador novo submit-job-result insere um aviso no erro_message.
                    -- Para o trigger, vamos apenas garantir que a auditoria saiba disso.
                    NULL;
                END IF;

            WHEN 'scan_vulnerabilities' THEN
                SELECT COUNT(*) INTO v_record_count FROM public.agent_vulnerabilities WHERE agent_id = NEW.agent_id;
                -- Algumas máquinas podem ter 0 vulnerabilidades, então aqui a integridade é via metadados de scan
                -- Se houver tabela de log de scan, verificaríamos aqui.
                NULL;
            
            ELSE
                NULL;
        END CASE;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Gatilho de Integridade
DROP TRIGGER IF EXISTS tr_check_job_integrity ON public.jobs;
CREATE TRIGGER tr_check_job_integrity
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.check_job_integrity();
