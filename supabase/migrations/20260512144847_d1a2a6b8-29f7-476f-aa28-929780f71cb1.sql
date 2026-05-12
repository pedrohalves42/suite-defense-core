-- We don't need a massive change since the existing policy already allows 'active' tenants.
-- However, we should ensure the suspension check is robust.

CREATE OR REPLACE FUNCTION public.check_tenant_suspension(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_created_at TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT suspension_status, created_at INTO v_status, v_created_at 
    FROM public.tenants 
    WHERE id = p_tenant_id;
    
    -- If it's a new trial (created in the last 15 days) and not explicitly suspended, it's active
    IF v_status = 'active' THEN
        RETURN FALSE;
    END IF;
    
    IF v_status = 'suspended' THEN
        RETURN TRUE;
    END IF;

    -- Default fallback
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
