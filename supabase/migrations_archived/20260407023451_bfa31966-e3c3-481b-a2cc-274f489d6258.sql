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
        COALESCE(action, '') || '|' || 
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