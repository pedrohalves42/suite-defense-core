## Fase 1 – Fundação da Automação SOC 2

Vamos implementar a Fase 1 completa, que é a base para tudo que vem depois.

### 1. Migração de Banco de Dados
- Criar tabela `soc2_evidence` com campos: `control_id`, `evidence_type`, `reference`, `description`, `collected_at`, `valid_until`, `hash`, `status`, `tenant_id`
- Criar tabela `soc2_control_status` com campos: `control_id`, `status`, `notes`, `filled_by`, `filled_at`, `tenant_id`
- RLS com isolamento multi-tenant via `get_active_tenant_id()`
- Índices para performance

### 2. Edge Function `soc2-evidence-collector`
- Consulta dados reais do banco (RLS policies, user_roles, audit_logs, compliance_policies, etc.)
- Mapeia evidências para controles CC1.1–CC1.5 (primeiros 5)
- Retorna JSON estruturado com evidências e descrições
- Salva evidências na tabela `soc2_evidence`
- Validação Zod + CORS + autenticação

### 3. Hook Frontend `useSOC2EvidenceCollector`
- Hook React que chama a Edge Function
- Exibe resultado no console e prepara para integração com o assistente

### ⚠️ Fases 2 e 3
Serão implementadas após validação da Fase 1:
- Fase 2: Integração com assistente (auto-preenchimento, indicadores visuais)
- Fase 3: Relatórios PDF, cron jobs, dashboard de saúde

### Observações de Segurança
- Tabelas com `tenant_id` obrigatório e RLS
- Edge Function valida JWT e papel do usuário (admin/compliance_officer)
- Evidências incluem hash SHA256 para integridade
