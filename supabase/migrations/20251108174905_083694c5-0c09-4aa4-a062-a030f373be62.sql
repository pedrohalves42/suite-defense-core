-- Step 1: Delete any records with NULL tenant_id as they are orphaned
-- These records cannot be associated with a tenant and should be removed

DELETE FROM public.agents WHERE tenant_id IS NULL;
DELETE FROM public.jobs WHERE tenant_id IS NULL;
DELETE FROM public.reports WHERE tenant_id IS NULL;
DELETE FROM public.virus_scans WHERE tenant_id IS NULL;
DELETE FROM public.enrollment_keys WHERE tenant_id IS NULL;
DELETE FROM public.invites WHERE tenant_id IS NULL;
DELETE FROM public.audit_logs WHERE tenant_id IS NULL;
DELETE FROM public.user_roles WHERE tenant_id IS NULL;
DELETE FROM public.tenant_settings WHERE tenant_id IS NULL;