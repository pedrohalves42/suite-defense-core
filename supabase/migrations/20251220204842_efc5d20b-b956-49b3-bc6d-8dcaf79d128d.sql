-- Add unique constraint on document_hash to prevent duplicate content with different names
CREATE UNIQUE INDEX IF NOT EXISTS signed_documents_unique_hash
ON public.signed_documents (document_hash);