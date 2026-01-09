-- ADR-032: SLOs e Burn Rate de Jobs com Abertura Automatica de Tasks
-- ================================================================

-- 1. Criar tabela job_slo_state para rastrear estado do SLO
CREATE TABLE IF NOT EXISTS job_slo_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  time_window text NOT NULL CHECK (time_window IN ('30m', '1h', '7d')),
  burn_rate numeric NOT NULL DEFAULT 0,
  error_rate numeric NOT NULL DEFAULT 0,
  total_jobs integer NOT NULL DEFAULT 0,
  error_jobs integer NOT NULL DEFAULT 0,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  last_task_id uuid REFERENCES tasks(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, time_window)
);

-- 2. Criar indices para consultas rapidas
CREATE INDEX IF NOT EXISTS idx_job_slo_state_tenant ON job_slo_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_slo_state_evaluated ON job_slo_state(evaluated_at DESC);

-- 3. Habilitar RLS
ALTER TABLE job_slo_state ENABLE ROW LEVEL SECURITY;

-- 4. Politicas de isolamento por tenant (usando padrao do projeto)
CREATE POLICY "job_slo_state_select_active_tenant" ON job_slo_state
  FOR SELECT USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "job_slo_state_insert_active_tenant" ON job_slo_state
  FOR INSERT WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "job_slo_state_update_active_tenant" ON job_slo_state
  FOR UPDATE USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "job_slo_state_delete_active_tenant" ON job_slo_state
  FOR DELETE USING (is_current_super_admin());

-- 5. Criar funcao evaluate_job_slo() para calculo e abertura automatica de tasks
CREATE OR REPLACE FUNCTION evaluate_job_slo()
RETURNS TABLE (
  out_tenant_id uuid,
  out_time_window text,
  out_burn_rate numeric,
  out_error_rate numeric,
  out_severity text,
  out_task_created boolean
) AS $$
DECLARE
  r RECORD;
  calc_burn numeric;
  calc_error_rate numeric;
  calc_severity text;
  new_task_id uuid;
  total_count integer;
  error_count integer;
BEGIN
  -- Avaliar cada tenant
  FOR r IN SELECT DISTINCT t.id AS tid FROM tenants t LOOP
    -- Calcular para janela de 1h
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE status IN ('failed','cancelled','timeout'))
    INTO total_count, error_count
    FROM jobs j
    WHERE j.tenant_id = r.tid
      AND j.created_at > NOW() - INTERVAL '1 hour';

    IF total_count > 0 THEN
      calc_error_rate := error_count::numeric / total_count;
      calc_burn := calc_error_rate / 0.005; -- SLO = 99.5%, erro permitido = 0.5%
    ELSE
      calc_error_rate := 0;
      calc_burn := 0;
    END IF;

    -- Determinar severidade baseado no burn rate
    calc_severity := CASE
      WHEN calc_burn >= 10 THEN 'critical'
      WHEN calc_burn >= 4  THEN 'high'
      WHEN calc_burn >= 2  THEN 'medium'
      WHEN calc_burn >= 1  THEN 'low'
      ELSE NULL
    END;

    -- Atualizar ou inserir estado do SLO
    INSERT INTO job_slo_state (tenant_id, time_window, burn_rate, error_rate, total_jobs, error_jobs)
    VALUES (r.tid, '1h', calc_burn, calc_error_rate, total_count, error_count)
    ON CONFLICT (tenant_id, time_window) DO UPDATE SET
      burn_rate = EXCLUDED.burn_rate,
      error_rate = EXCLUDED.error_rate,
      total_jobs = EXCLUDED.total_jobs,
      error_jobs = EXCLUDED.error_jobs,
      evaluated_at = NOW(),
      updated_at = NOW();

    -- Criar task se burn rate excede limite E nao existe task recente aberta
    new_task_id := NULL;
    IF calc_severity IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM tasks
        WHERE source_type = 'job_slo'
          AND tasks.tenant_id = r.tid
          AND status = 'open'
          AND created_at > NOW() - INTERVAL '1 hour'
      ) THEN
        INSERT INTO tasks (
          tenant_id, source_type, source_id,
          title, description, severity, status,
          requires_human_review, auto_generated
        ) VALUES (
          r.tid, 'job_slo', gen_random_uuid(),
          '[SLO] Burn Rate: ' || round(calc_burn, 2) || 'x - Acao Necessaria',
          'Taxa de erro: ' || round(calc_error_rate * 100, 2) || '% (limite: 0.5%). ' ||
          'Erros: ' || error_count || '/' || total_count || ' jobs na ultima hora. ' ||
          'Burn rate ' || round(calc_burn, 2) || 'x indica consumo acelerado do orcamento de erro.',
          calc_severity, 'open',
          calc_severity IN ('high', 'critical'), true
        ) RETURNING id INTO new_task_id;

        -- Atualizar referencia da ultima task criada
        UPDATE job_slo_state SET last_task_id = new_task_id
        WHERE job_slo_state.tenant_id = r.tid AND time_window = '1h';
      END IF;
    END IF;

    -- Retornar resultado da avaliacao
    out_tenant_id := r.tid;
    out_time_window := '1h';
    out_burn_rate := calc_burn;
    out_error_rate := calc_error_rate;
    out_severity := calc_severity;
    out_task_created := new_task_id IS NOT NULL;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Comentarios de documentacao
COMMENT ON TABLE job_slo_state IS 'ADR-032: Estado do SLO de jobs por tenant e janela temporal';
COMMENT ON FUNCTION evaluate_job_slo() IS 'ADR-032: Avalia burn rate e cria tasks automaticamente quando limites sao excedidos';