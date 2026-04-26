-- Corrigir digest: tipar explicitamente o algoritmo como text
CREATE OR REPLACE FUNCTION public.generate_telemetry_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.telemetry_hash := encode(
    digest(
      convert_to(
        COALESCE(NEW.agent_id::text, '') ||
        COALESCE(NEW.agent_name, 'unknown') ||
        COALESCE(NEW.event_type, '') ||
        date_trunc('minute', COALESCE(NEW.created_at, now()))::text ||
        COALESCE(NEW.platform, 'unknown'),
        'UTF8'
      ),
      'sha256'::text
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Garantir trigger
DROP TRIGGER IF EXISTS set_telemetry_hash ON public.installation_analytics;
CREATE TRIGGER set_telemetry_hash
BEFORE INSERT ON public.installation_analytics
FOR EACH ROW
EXECUTE FUNCTION public.generate_telemetry_hash();

-- Reprocessar quaisquer linhas sem hash
UPDATE public.installation_analytics ia
SET telemetry_hash = encode(
  digest(
    convert_to(
      COALESCE(ia.agent_id::text, '') ||
      COALESCE(ia.agent_name, 'unknown') ||
      COALESCE(ia.event_type, '') ||
      date_trunc('minute', COALESCE(ia.created_at, now()))::text ||
      COALESCE(ia.platform, 'unknown'),
      'UTF8'
    ),
    'sha256'::text
  ),
  'hex'
)
WHERE ia.telemetry_hash IS NULL;