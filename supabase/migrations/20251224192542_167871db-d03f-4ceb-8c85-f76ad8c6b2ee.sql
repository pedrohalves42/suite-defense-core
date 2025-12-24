-- =====================================================
-- FIX 1: Playbooks - Require authentication for all access
-- =====================================================

-- Drop and recreate playbooks SELECT policy to require auth
DROP POLICY IF EXISTS "Users can view playbooks in their tenant" ON playbooks;

CREATE POLICY "Users can view playbooks in their tenant" ON playbooks
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    -- System playbooks visible to any authenticated user in any tenant
    (is_system = true AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    )) OR
    -- Tenant-specific playbooks visible to tenant members
    tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
    )
  )
);

-- Drop and recreate playbook_actions SELECT policy to require auth
DROP POLICY IF EXISTS "Users can view playbook actions" ON playbook_actions;

CREATE POLICY "Users can view playbook actions" ON playbook_actions
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  playbook_id IN (
    SELECT p.id FROM playbooks p
    WHERE (
      (p.is_system = true AND EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid()
      )) OR
      p.tenant_id IN (
        SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
      )
    )
  )
);

-- =====================================================
-- FIX 2: Signed Documents - Create verification function and restrict access
-- =====================================================

-- Create a public verification function (security definer)
CREATE OR REPLACE FUNCTION public.verify_document_signature(
  p_document_hash TEXT,
  p_signature TEXT
) 
RETURNS TABLE (
  is_valid BOOLEAN,
  signed_at TIMESTAMP WITH TIME ZONE,
  document_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    true as is_valid,
    sd.signed_at,
    sd.document_name
  FROM signed_documents sd
  WHERE sd.document_hash = p_document_hash
    AND sd.signature_base64 = p_signature
    AND sd.created_at > NOW() - INTERVAL '5 years'
  LIMIT 1;
  
  -- If no matching record found, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false as is_valid, NULL::TIMESTAMP WITH TIME ZONE, NULL::TEXT;
  END IF;
END;
$$;

-- Grant execute to anon and authenticated for public verification
GRANT EXECUTE ON FUNCTION public.verify_document_signature(TEXT, TEXT) TO anon, authenticated;

-- Drop the permissive public policy
DROP POLICY IF EXISTS "Anyone can verify signed documents" ON signed_documents;

-- Create authenticated-only policy for viewing signed documents
-- Since signed_documents is a global table (no tenant_id), restrict to authenticated users only
CREATE POLICY "Authenticated users can view signed documents" ON signed_documents
FOR SELECT USING (
  auth.uid() IS NOT NULL
);