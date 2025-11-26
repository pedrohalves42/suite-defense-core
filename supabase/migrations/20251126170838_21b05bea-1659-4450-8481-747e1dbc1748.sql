-- ============================================================================
-- FASE 2: Recriar Job de Software Inventory para testepc1
-- ============================================================================
-- Agent: testepc1
-- Agent ID: b393abc6-c507-4a4c-9c40-4c4593974ebe
-- Tenant ID: 3adc67e6-8908-4d98-b85b-5e93be4673a1

INSERT INTO public.jobs (tenant_id, agent_id, agent_name, type, status, payload, created_at)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1'::uuid,
  'b393abc6-c507-4a4c-9c40-4c4593974ebe'::uuid,
  'testepc1',
  'software_inventory_collect',
  'queued',
  '{}'::jsonb,
  NOW()
);