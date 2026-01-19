-- Adicionar range permitindo todos os IPs (para desenvolvimento/produção inicial)
INSERT INTO admin_ip_whitelist (ip_address, description, tenant_id, is_active)
VALUES 
  ('0.0.0.0/0'::inet, 'Permitir todos os IPs IPv4 (produção inicial)', NULL, true),
  ('::/0'::inet, 'Permitir todos os IPs IPv6 (produção inicial)', NULL, true)
ON CONFLICT DO NOTHING;