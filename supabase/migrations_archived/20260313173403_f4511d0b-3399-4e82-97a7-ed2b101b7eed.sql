
-- Atomic batch claiming function for flush-event-buffer
-- Prevents double-processing by marking rows with a batch_id in one atomic UPDATE
CREATE OR REPLACE FUNCTION public.claim_event_buffer_batch(
  p_batch_id uuid,
  p_limit int DEFAULT 5000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed int;
BEGIN
  WITH claimed AS (
    UPDATE endpoint_event_buffer
    SET batch_id = p_batch_id
    WHERE id IN (
      SELECT id
      FROM endpoint_event_buffer
      WHERE processed_at IS NULL
        AND batch_id IS NULL
      ORDER BY received_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT count(*) INTO v_claimed FROM claimed;
  
  RETURN v_claimed;
END;
$$;
