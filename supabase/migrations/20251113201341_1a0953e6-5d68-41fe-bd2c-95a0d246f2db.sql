-- FASE 2: Sistema automático de cleanup de builds travados

-- Função para limpar builds que excederam o timeout
CREATE OR REPLACE FUNCTION public.cleanup_stuck_builds()
RETURNS TABLE(
  cleaned_count integer,
  build_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleaned_count integer;
  v_build_ids uuid[];
BEGIN
  -- Atualizar builds travados (mais de 30 minutos em estado 'building')
  WITH updated_builds AS (
    UPDATE public.agent_builds
    SET 
      build_status = 'failed',
      build_completed_at = now(),
      error_message = 'Build timeout - exceeded 30 minutes (auto-cleanup)'
    WHERE 
      build_status = 'building'
      AND created_at < now() - interval '30 minutes'
    RETURNING id
  )
  SELECT 
    count(*)::integer,
    array_agg(id)
  INTO v_cleaned_count, v_build_ids
  FROM updated_builds;
  
  -- Log da operação
  RAISE NOTICE 'Cleanup completed: % builds marked as failed', COALESCE(v_cleaned_count, 0);
  
  RETURN QUERY SELECT 
    COALESCE(v_cleaned_count, 0),
    COALESCE(v_build_ids, ARRAY[]::uuid[]);
END;
$$;

-- Comentário da função
COMMENT ON FUNCTION public.cleanup_stuck_builds() IS 
'Automatically marks builds that have been in "building" state for more than 30 minutes as failed. Returns count of cleaned builds and their IDs.';
