-- Fix persist_chain_breaks function with correct syntax
CREATE OR REPLACE FUNCTION public.persist_chain_breaks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash_count INTEGER := 0;
  v_gap_count INTEGER := 0;
BEGIN
  -- Insert hash mismatch breaks (where consecutive executions don't chain properly)
  WITH inserted AS (
    INSERT INTO poe_chain_breaks (agent_id, tenant_id, break_type, context)
    SELECT 
      e1.agent_id,
      a.tenant_id,
      'hash_mismatch',
      jsonb_build_object(
        'execution_1_id', e1.id,
        'execution_1_index', e1.execution_index,
        'execution_1_hash', e1.execution_hash,
        'execution_2_id', e2.id,
        'execution_2_index', e2.execution_index,
        'execution_2_previous_hash', e2.previous_execution_hash
      )
    FROM job_executions e1
    JOIN job_executions e2
      ON e2.agent_id = e1.agent_id
     AND e2.execution_index = e1.execution_index + 1
    JOIN agents a ON a.id = e1.agent_id
    WHERE e2.previous_execution_hash IS NOT NULL
      AND e1.execution_hash IS NOT NULL
      AND e2.previous_execution_hash != e1.execution_hash
      AND NOT EXISTS (
        SELECT 1 FROM poe_chain_breaks pcb
        WHERE pcb.agent_id = e1.agent_id
          AND pcb.break_type = 'hash_mismatch'
          AND pcb.context->>'execution_1_id' = e1.id::text
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_hash_count FROM inserted;
  
  -- Insert index gap breaks (missing execution indices)
  WITH inserted AS (
    INSERT INTO poe_chain_breaks (agent_id, tenant_id, break_type, context)
    SELECT 
      e1.agent_id,
      a.tenant_id,
      'index_gap',
      jsonb_build_object(
        'execution_id', e1.id,
        'current_index', e1.execution_index,
        'expected_next', e1.execution_index + 1,
        'actual_next', (
          SELECT MIN(e2.execution_index) 
          FROM job_executions e2 
          WHERE e2.agent_id = e1.agent_id 
            AND e2.execution_index > e1.execution_index
        )
      )
    FROM job_executions e1
    JOIN agents a ON a.id = e1.agent_id
    WHERE NOT EXISTS (
      SELECT 1 FROM job_executions e2 
      WHERE e2.agent_id = e1.agent_id 
        AND e2.execution_index = e1.execution_index + 1
    )
    AND EXISTS (
      SELECT 1 FROM job_executions e3 
      WHERE e3.agent_id = e1.agent_id 
        AND e3.execution_index > e1.execution_index + 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM poe_chain_breaks pcb
      WHERE pcb.agent_id = e1.agent_id
        AND pcb.break_type = 'index_gap'
        AND pcb.context->>'execution_id' = e1.id::text
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_gap_count FROM inserted;
  
  RETURN v_hash_count + v_gap_count;
END;
$$;