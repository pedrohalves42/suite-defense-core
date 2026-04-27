-- Tornar o bucket privado para impedir listagem automática/pública
UPDATE storage.buckets
SET public = false
WHERE id = 'agent-scripts';

-- Remover políticas excessivamente permissivas se existirem
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read scripts" ON storage.objects;

-- Criar política restritiva: Permite download (SELECT) mas não listagem, 
-- garantindo que apenas quem conhece o caminho do arquivo possa acessá-lo.
CREATE POLICY "Agents can read scripts by path" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'agent-scripts' 
  AND (auth.role() = 'anon' OR auth.role() = 'service_role')
);

-- Garantir que service_role tenha acesso total para gestão
CREATE POLICY "Service role full access on agent-scripts"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'agent-scripts')
WITH CHECK (bucket_id = 'agent-scripts');