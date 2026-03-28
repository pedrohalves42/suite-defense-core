-- Dropar funcao existente com tipo diferente
DROP FUNCTION IF EXISTS public.validate_agent_release_integrity();

-- Recriar funcao de validacao de integridade do agente
CREATE OR REPLACE FUNCTION public.validate_agent_release_integrity()
RETURNS TABLE (
  release_id uuid,
  version text,
  channel text,
  platform text,
  is_valid boolean,
  validation_notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.id AS release_id,
    ar.version,
    ar.channel,
    ar.platform,
    CASE
      WHEN ar.sha256 IS NULL OR LENGTH(ar.sha256) != 64 THEN false
      WHEN ar.script_content IS NULL OR LENGTH(ar.script_content) < 100 THEN false
      ELSE true
    END AS is_valid,
    CASE
      WHEN ar.sha256 IS NULL THEN 'Missing SHA256 hash'::text
      WHEN LENGTH(ar.sha256) != 64 THEN 'Invalid SHA256 length'::text
      WHEN ar.script_content IS NULL THEN 'Missing script content'::text
      WHEN LENGTH(ar.script_content) < 100 THEN 'Script content too small'::text
      ELSE 'OK'::text
    END AS validation_notes
  FROM agent_releases ar
  WHERE ar.is_active = true
  ORDER BY ar.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.validate_agent_release_integrity() IS 'Valida integridade das releases de agentes';