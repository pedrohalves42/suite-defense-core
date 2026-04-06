-- Create hash chain trigger for audit_logs to ensure forensic integrity
CREATE OR REPLACE FUNCTION public.audit_log_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash TEXT;
BEGIN
  -- Get the hash of the most recent existing log entry
  SELECT encode(
    sha256(
      convert_to(
        COALESCE(id::text, '') || '|' || 
        COALESCE(created_at::text, '') || '|' || 
        COALESCE(event_type, '') || '|' || 
        COALESCE(user_id::text, '') || '|' || 
        COALESCE(tenant_id::text, ''),
        'UTF8'
      )
    ),
    'hex'
  )
  INTO v_prev_hash
  FROM public.audit_logs
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  -- Set the previous_log_hash on the new record
  NEW.previous_log_hash := COALESCE(v_prev_hash, 'GENESIS');
  
  RETURN NEW;
END;
$$;

-- Create the trigger (drop if exists to be idempotent)
DROP TRIGGER IF EXISTS trg_audit_log_hash_chain ON public.audit_logs;

CREATE TRIGGER trg_audit_log_hash_chain
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_hash_chain();