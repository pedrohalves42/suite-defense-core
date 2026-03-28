-- Corrigir trigger para usar uuid corretamente
CREATE OR REPLACE FUNCTION public.sync_task_on_dlq_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND COALESCE(OLD.status, '') != 'resolved' THEN
    UPDATE public.tasks
    SET
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, NOW()),
      closed_by = NEW.resolved_by,
      closure_reason = COALESCE(NEW.resolution_notes, 'DLQ item resolvido'),
      updated_at = NOW()
    WHERE source_type = 'dlq'
      AND source_id = NEW.id  -- Comparacao direta de uuid
      AND status NOT IN ('resolved', 'closed');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;