-- Trigger de imutabilidade para signed_documents
-- Uma vez assinado, documento e IMUTAVEL

-- Funcao que bloqueia modificacao
CREATE OR REPLACE FUNCTION public.prevent_signed_document_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Signed documents cannot be modified or deleted. Document: %', OLD.document_name
    USING ERRCODE = '23514'; -- check_violation
END;
$$;

-- Trigger em UPDATE
CREATE TRIGGER trg_prevent_signed_document_update
  BEFORE UPDATE ON public.signed_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_signed_document_modification();

-- Trigger em DELETE
CREATE TRIGGER trg_prevent_signed_document_delete
  BEFORE DELETE ON public.signed_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_signed_document_modification();