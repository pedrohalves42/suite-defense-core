-- Fix generate_telemetry_hash to use extensions.digest() instead of digest()
CREATE OR REPLACE FUNCTION public.generate_telemetry_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.telemetry_hash := encode(
    extensions.digest(
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
$$ LANGUAGE plpgsql SET search_path = public;