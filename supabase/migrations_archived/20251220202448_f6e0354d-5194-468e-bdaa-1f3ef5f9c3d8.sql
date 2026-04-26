-- =====================================================
-- TABELA: signed_documents
-- Armazena metadados de documentos assinados criptograficamente
-- =====================================================

CREATE TABLE IF NOT EXISTS public.signed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name TEXT NOT NULL UNIQUE,
  document_hash TEXT NOT NULL,
  signature_base64 TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'ECDSA-P256-SHA256',
  curve TEXT NOT NULL DEFAULT 'prime256v1',
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_by TEXT NOT NULL,
  invariants_version TEXT,
  audit_level TEXT DEFAULT 'STANDARD',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentario
COMMENT ON TABLE public.signed_documents IS 'Armazena metadados de documentos assinados criptograficamente (Whitepapers, politicas, etc.)';

-- Indices
CREATE INDEX IF NOT EXISTS idx_signed_documents_name ON public.signed_documents(document_name);
CREATE INDEX IF NOT EXISTS idx_signed_documents_signed_at ON public.signed_documents(signed_at DESC);

-- =====================================================
-- RLS: Verificacao publica, gerenciamento por super_admins
-- =====================================================

ALTER TABLE public.signed_documents ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode verificar documentos assinados (publico)
CREATE POLICY "Anyone can verify signed documents"
  ON public.signed_documents
  FOR SELECT
  USING (true);

-- Apenas super_admins podem inserir/atualizar/deletar
CREATE POLICY "Super admins can manage signed documents"
  ON public.signed_documents
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));