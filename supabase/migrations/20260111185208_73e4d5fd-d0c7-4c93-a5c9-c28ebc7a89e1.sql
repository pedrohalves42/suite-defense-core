-- ============================================================
-- Job Engine Silent Failure Remediation - Phase 1 & 4
-- ============================================================

-- 1. ATTACH STATE TRANSITION ENFORCEMENT TRIGGER TO JOBS TABLE
-- This was missing: the function exists but no trigger was attached
DROP TRIGGER IF EXISTS tr_enforce_job_state ON public.jobs;
CREATE TRIGGER tr_enforce_job_state
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_job_state_transitions();

-- 2. FLAG ALL OVERDUE TASKS WITH SLA BREACH (Data Backfill)
-- Run the SLA breach check to update 110+ overdue tasks
SELECT public.check_task_sla_breach();

-- 3. CREATE ANOMALY ALERT TRIGGER FOR FAILED JOBS WITHOUT EXECUTION
-- When v_job_health_anomalies shows failed_no_execution > threshold, create alert
CREATE OR REPLACE FUNCTION public.check_job_health_anomalies_and_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anomaly RECORD;
  v_alert_exists BOOLEAN;
BEGIN
  -- Check for critical anomalies in v_job_health_anomalies
  FOR v_anomaly IN 
    SELECT 
      anomaly_type,
      anomaly_count,
      severity,
      description
    FROM v_job_health_anomalies
    WHERE severity = 'critical' AND anomaly_count > 0
  LOOP
    -- Check if alert already exists for this anomaly type in last hour
    SELECT EXISTS(
      SELECT 1 FROM system_alerts
      WHERE alert_type = 'job_health_anomaly_' || v_anomaly.anomaly_type
        AND resolved = false
        AND created_at > NOW() - INTERVAL '1 hour'
    ) INTO v_alert_exists;
    
    IF NOT v_alert_exists THEN
      -- Create system alert for this anomaly
      INSERT INTO system_alerts (
        tenant_id,
        alert_type,
        severity,
        title,
        message,
        metadata,
        resolved
      ) VALUES (
        NULL, -- Global alert
        'job_health_anomaly_' || v_anomaly.anomaly_type,
        'critical',
        'Job Health Anomaly: ' || v_anomaly.anomaly_type,
        v_anomaly.description || ' (Count: ' || v_anomaly.anomaly_count || ')',
        jsonb_build_object(
          'anomaly_type', v_anomaly.anomaly_type,
          'count', v_anomaly.anomaly_count,
          'severity', v_anomaly.severity,
          'detected_at', NOW()
        ),
        false
      );
      
      RAISE NOTICE 'Created alert for job health anomaly: % (count: %)', 
        v_anomaly.anomaly_type, v_anomaly.anomaly_count;
    END IF;
  END LOOP;
END;
$$;

-- 4. CREATE OBSERVABILITY LOG FUNCTION FOR CHECK-TASK-SLA-BREACH
-- This function doesn't exist yet - we need to ensure log_scheduled_job_run handles it
-- First, verify log_scheduled_job_run exists and accepts our parameters
-- (It should already exist from previous migrations)

-- 5. Grant execution permissions
GRANT EXECUTE ON FUNCTION public.check_job_health_anomalies_and_alert() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_job_health_anomalies_and_alert() TO authenticated;