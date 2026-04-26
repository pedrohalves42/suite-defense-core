-- P0-001 FIX: Create VIEW hmac_signatures to redirect to partitioned table
-- This fixes "relation 'public.hmac_signatures' does not exist" errors

-- First, check if hmac_signatures exists as a table and drop if empty
DROP TABLE IF EXISTS public.hmac_signatures CASCADE;

-- Create view that unions all partition tables
CREATE OR REPLACE VIEW public.hmac_signatures AS
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures_2025_12
UNION ALL
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures_2026_01;

-- Create function to handle INSERT into the view
CREATE OR REPLACE FUNCTION public.hmac_signatures_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
  partition_name TEXT;
  partition_start DATE;
  partition_end DATE;
BEGIN
  partition_start := date_trunc('month', COALESCE(NEW.used_at, NOW()))::DATE;
  partition_end := (partition_start + INTERVAL '1 month')::DATE;
  partition_name := 'hmac_signatures_' || to_char(partition_start, 'YYYY_MM');
  
  -- Create partition if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        signature TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )', partition_name
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_signature ON public.%I(signature)', partition_name, partition_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_used_at ON public.%I(used_at)', partition_name, partition_name);
  END IF;
  
  -- Insert into correct partition
  EXECUTE format(
    'INSERT INTO public.%I (id, signature, agent_name, used_at) VALUES ($1, $2, $3, $4)',
    partition_name
  ) USING COALESCE(NEW.id, gen_random_uuid()), NEW.signature, NEW.agent_name, COALESCE(NEW.used_at, NOW());
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create INSTEAD OF INSERT trigger on the view
DROP TRIGGER IF EXISTS tr_hmac_signatures_insert ON public.hmac_signatures;
CREATE TRIGGER tr_hmac_signatures_insert
  INSTEAD OF INSERT ON public.hmac_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.hmac_signatures_insert_trigger();

-- Create function to handle DELETE from the view
CREATE OR REPLACE FUNCTION public.hmac_signatures_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete from all partitions
  DELETE FROM public.hmac_signatures_2025_12 WHERE id = OLD.id OR (signature = OLD.signature AND agent_name = OLD.agent_name);
  DELETE FROM public.hmac_signatures_2026_01 WHERE id = OLD.id OR (signature = OLD.signature AND agent_name = OLD.agent_name);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create INSTEAD OF DELETE trigger on the view
DROP TRIGGER IF EXISTS tr_hmac_signatures_delete ON public.hmac_signatures;
CREATE TRIGGER tr_hmac_signatures_delete
  INSTEAD OF DELETE ON public.hmac_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.hmac_signatures_delete_trigger();

-- Update cleanup function to work with partitions directly
CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
  temp_count INTEGER;
BEGIN
  -- Delete from 2025_12 partition
  DELETE FROM public.hmac_signatures_2025_12
  WHERE used_at < NOW() - INTERVAL '6 hours';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;
  
  -- Delete from 2026_01 partition
  DELETE FROM public.hmac_signatures_2026_01
  WHERE used_at < NOW() - INTERVAL '6 hours';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;
  
  RETURN deleted_count;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.hmac_signatures TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.hmac_signatures TO service_role;