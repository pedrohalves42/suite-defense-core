-- Create a function to get counts across multiple tenants in a single call
CREATE OR REPLACE FUNCTION public.get_batch_counts(
  p_table TEXT,
  p_tenant_ids UUID[],
  p_filters JSONB
)
RETURNS TABLE (tenant_id UUID, count BIGINT) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT;
  v_where TEXT := 'tenant_id = ANY($1)';
  v_key TEXT;
  v_val TEXT;
BEGIN
  -- Build basic where clause from filters
  -- This is a simplified version, handling common filters used in monitor-thresholds
  
  -- Handle 'gte' filters
  IF p_filters ? 'gte' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_filters->'gte')
    LOOP
      v_where := v_where || format(' AND %I >= %L', v_key, v_val);
    END LOOP;
  END IF;

  -- Handle 'eq' filters (excluding tenant_id which is handled via ANY)
  IF p_filters ? 'eq' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_filters->'eq')
    LOOP
      IF v_key != 'tenant_id' THEN
        v_where := v_where || format(' AND %I = %L', v_key, v_val);
      END IF;
    END LOOP;
  END IF;

  -- Handle 'lt' filters
  IF p_filters ? 'lt' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_filters->'lt')
    LOOP
      v_where := v_where || format(' AND %I < %L', v_key, v_val);
    END LOOP;
  END IF;

  -- Handle 'notNull' filter
  IF p_filters ? 'notNull' THEN
    v_where := v_where || format(' AND %I IS NOT NULL', p_filters->>'notNull');
  END IF;

  -- Construct final query
  v_query := format('SELECT tenant_id, count(*) FROM %I WHERE %s GROUP BY tenant_id', p_table, v_where);
  
  RETURN QUERY EXECUTE v_query USING p_tenant_ids;
END;
$$;