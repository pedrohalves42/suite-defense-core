-- 1. Ensure suspension columns exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'suspension_status') THEN
        ALTER TABLE public.tenants ADD COLUMN suspension_status TEXT DEFAULT 'active' CHECK (suspension_status IN ('active', 'suspended'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'suspended_at') THEN
        ALTER TABLE public.tenants ADD COLUMN suspended_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'suspension_reason') THEN
        ALTER TABLE public.tenants ADD COLUMN suspension_reason TEXT;
    END IF;
END $$;

-- 2. Suspend all tenants except Pedro Alves
UPDATE public.tenants 
SET suspension_status = 'suspended', 
    suspended_at = now(), 
    suspension_reason = 'Falta de pagamento' 
WHERE id != '3adc67e6-8908-4d98-b85b-5e93be4673a1';

-- 3. Ensure Pedro Alves is active
UPDATE public.tenants 
SET suspension_status = 'active', 
    suspended_at = NULL, 
    suspension_reason = NULL 
WHERE id = '3adc67e6-8908-4d98-b85b-5e93be4673a1';

-- 4. Create function to check if tenant is suspended
CREATE OR REPLACE FUNCTION public.check_tenant_suspension(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT suspension_status INTO v_status FROM public.tenants WHERE id = p_tenant_id;
    RETURN v_status = 'suspended';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add RLS policy to block suspended tenants if not already restrictive
-- Assuming RLS is already enabled on most tables, we can add a global check if needed,
-- but the prompt suggests a specific check in _assert_caller_tenant or similar.
-- Since we couldn't find _assert_caller_tenant, we'll apply it to the tenants table itself first.

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Block suspended tenants" ON public.tenants;
    CREATE POLICY "Block suspended tenants" ON public.tenants
    FOR SELECT
    USING (
        (id = '3adc67e6-8908-4d98-b85b-5e93be4673a1') OR 
        (suspension_status = 'active') OR
        (auth.jwt() ->> 'is_super_admin')::boolean = true
    );
END $$;
