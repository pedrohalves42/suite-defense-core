
-- Re-create missing functions and trigger

-- 1.1.1 Add severity_floor_rate function
CREATE OR REPLACE FUNCTION public.severity_floor_rate(p_severity text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_severity
    WHEN 'critical' THEN 1.0
    WHEN 'high' THEN 0.5
    WHEN 'medium' THEN 0.2
    ELSE 0.1
  END::numeric;
$$;

-- 1.1.2 Add slo_dirty flag to failure_fingerprints
ALTER TABLE public.failure_fingerprints 
ADD COLUMN IF NOT EXISTS slo_dirty boolean DEFAULT true;

-- 1.1.3 Create trigger function to mark fingerprint dirty
CREATE OR REPLACE FUNCTION public.mark_fingerprint_slo_dirty()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE failure_fingerprints 
  SET slo_dirty = true 
  WHERE id = NEW.fingerprint_id;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS tr_mark_slo_dirty ON public.failure_occurrences;
CREATE TRIGGER tr_mark_slo_dirty
AFTER INSERT ON public.failure_occurrences
FOR EACH ROW 
WHEN (NEW.fingerprint_id IS NOT NULL)
EXECUTE FUNCTION public.mark_fingerprint_slo_dirty();

-- 1.2 Create check_incident_slo_task function
CREATE OR REPLACE FUNCTION public.check_incident_slo_task()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slo RECORD;
  v_task_id uuid;
  v_count integer := 0;
  v_tenant_id uuid;
  v_title text;
  v_severity text;
BEGIN
  FOR v_slo IN 
    SELECT 
      s.*,
      f.normalized_signature,
      f.severity_hint,
      f.failure_class
    FROM incident_slo_state s
    JOIN failure_fingerprints f ON f.id = s.fingerprint_id
    WHERE s.burn_rate_1h >= 2
      AND s.last_task_id IS NULL
  LOOP
    -- Check idempotency - no open task for this fingerprint
    IF NOT EXISTS (
      SELECT 1 FROM tasks 
      WHERE fingerprint_id = v_slo.fingerprint_id
        AND status IN ('open', 'in_progress')
    ) THEN
      -- Get tenant from recent occurrence
      SELECT tenant_id INTO v_tenant_id
      FROM failure_occurrences
      WHERE fingerprint_id = v_slo.fingerprint_id
      ORDER BY occurred_at DESC 
      LIMIT 1;

      IF v_tenant_id IS NOT NULL THEN
        v_severity := CASE 
          WHEN v_slo.burn_rate_1h >= 5 THEN 'critical'
          WHEN v_slo.burn_rate_1h >= 2 THEN 'high'
          ELSE 'medium' 
        END;

        v_title := 'Burn Rate Alto: ' || COALESCE(v_slo.failure_class, 'Incidente');

        INSERT INTO tasks (
          tenant_id, source_type, fingerprint_id, title, description,
          severity, status, requires_human_review, auto_generated
        ) VALUES (
          v_tenant_id, 'incident_group', v_slo.fingerprint_id, v_title,
          format('Burn Rate 1h: %.1fx | 6h: %.1fx | Budget: %.0f%% consumido',
            v_slo.burn_rate_1h, v_slo.burn_rate_6h, v_slo.budget_consumed),
          v_severity, 'open', true, true
        ) RETURNING id INTO v_task_id;

        UPDATE incident_slo_state 
        SET last_task_id = v_task_id 
        WHERE fingerprint_id = v_slo.fingerprint_id;

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
