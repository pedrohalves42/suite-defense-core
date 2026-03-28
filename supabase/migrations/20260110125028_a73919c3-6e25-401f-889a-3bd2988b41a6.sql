-- =============================================================================
-- ADR-034 FINALIZACAO: Ativar modelo hibrido dirty flag
-- =============================================================================

-- 1. Criar trigger leve para marcar fingerprints como dirty
CREATE OR REPLACE FUNCTION mark_fingerprint_slo_dirty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE failure_fingerprints
     SET slo_dirty = true
   WHERE id = NEW.fingerprint_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_mark_slo_dirty ON failure_occurrences;

CREATE TRIGGER tr_mark_slo_dirty
AFTER INSERT ON failure_occurrences
FOR EACH ROW
EXECUTE FUNCTION mark_fingerprint_slo_dirty();

-- 2. Atualizar funcao de refresh para usar dirty flag (modo hibrido)
CREATE OR REPLACE FUNCTION refresh_all_incident_slos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fp_id uuid;
  v_count integer := 0;
BEGIN
  -- Modo hibrido: so processa fingerprints marcados como dirty
  FOR v_fp_id IN 
    SELECT id FROM failure_fingerprints 
    WHERE slo_dirty = true
  LOOP
    PERFORM calculate_incident_burn_rate(v_fp_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 3. Marcar todos os fingerprints ativos como dirty para primeira execucao
UPDATE failure_fingerprints 
SET slo_dirty = true 
WHERE is_active = true;