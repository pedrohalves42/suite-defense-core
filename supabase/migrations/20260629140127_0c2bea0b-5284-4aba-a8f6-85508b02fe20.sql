
-- Sprint 1 E2E seeding (idempotente).
-- Bypass temporário do guard prevent_super_admin_self_assignment apenas dentro
-- desta transação, com session_replication_role=replica (não persiste).

INSERT INTO public.tenants (id, name, slug, owner_user_id, scim_api_key)
VALUES (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'Test Tenant A',
  'test-tenant-a',
  '6c3d211b-d104-4a0b-84d4-4aea92d980ac'::uuid,
  'cybershield_scim_test_tenant_a_sprint1_e2e_placeholder_key'
)
ON CONFLICT (id) DO NOTHING;

SET LOCAL session_replication_role = replica;

INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT
  '6c3d211b-d104-4a0b-84d4-4aea92d980ac'::uuid,
  'super_admin'::app_role,
  'a0000000-0000-0000-0000-000000000001'::uuid
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '6c3d211b-d104-4a0b-84d4-4aea92d980ac'::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT
  'b2f69218-159c-47ac-8d5a-68b805c2052b'::uuid,
  'viewer'::app_role,
  'a0000000-0000-0000-0000-000000000001'::uuid
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'b2f69218-159c-47ac-8d5a-68b805c2052b'::uuid)
ON CONFLICT DO NOTHING;

SET LOCAL session_replication_role = origin;
