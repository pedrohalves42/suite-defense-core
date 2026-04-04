## Bloco: Observabilidade e Alertas Preventivos

### 1. Edge Function `check-tenant-abuse` (cron 1x/hora)
- **Objetivo**: Detectar tenants com uso anômalo (excesso de jobs, agentes, API calls) para prevenir abuso e custos descontrolados
- **Métricas monitoradas**:
  - Jobs criados/hora por tenant (threshold: >500)
  - Agentes registrados vs limite do plano
  - Falhas de autenticação por tenant (>50/hora = suspicious)
  - Volume de telemetria ingerida (bytes/hora)
- **Ações**: Registrar alertas em `system_alerts` com severidade e notificar via log estruturado
- **Custo**: ~$0.01/hora (1 invocação leve com queries otimizadas via índices existentes)

### 2. Cron job via pg_cron
- Schedule: `0 * * * *` (a cada hora cheia)
- Invoca a Edge Function via `net.http_post`

### 3. Dashboard de Custo por Tenant (Super Admin only)
- **Rota**: `/super-admin/tenant-costs`
- **Proteção**: `SuperAdminLayout` (já existente) + RPC `is_super_admin`
- **Dados exibidos**:
  - Jobs executados (24h/7d/30d) por tenant
  - Agentes ativos vs limite do plano
  - Volume de telemetria (estimativa de custo)
  - Alertas de abuso recentes
- **Componentes**: Tabela com sorting + cards de resumo + gráfico de tendência
- **RPC**: `get_tenant_cost_metrics` (SECURITY DEFINER, validação super_admin)

### Ordem de execução:
1. Migration: criar RPC `get_tenant_cost_metrics`
2. Edge Function `check-tenant-abuse`
3. Cron job (via insert tool)
4. Página do dashboard
5. Registro da rota no router
