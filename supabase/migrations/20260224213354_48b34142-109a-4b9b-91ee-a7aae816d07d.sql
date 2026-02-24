
-- Allow playbooks to be global templates (tenant_id nullable)
ALTER TABLE soar_playbooks ALTER COLUMN tenant_id DROP NOT NULL;
