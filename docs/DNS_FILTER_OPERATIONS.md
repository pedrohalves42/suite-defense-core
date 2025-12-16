# DNS Filter - Runbook Operacional

## Visão Geral

O CyberShield DNS Filter é um serviço local de filtragem DNS para endpoints Windows que:
- Bloqueia consultas DNS para domínios proibidos
- Registra eventos de bloqueio para auditoria
- Integra-se com o CyberShield Agent para deploy e coleta de evidências

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENDPOINT WINDOWS                         │
│  ┌─────────────────┐      ┌─────────────────────────────────┐   │
│  │   Aplicações    │──DNS─▶│    CyberShield DNS Filter      │   │
│  │  (Chrome, Edge) │      │      (localhost:53)             │   │
│  └─────────────────┘      └───────────────┬─────────────────┘   │
│                                           │                      │
│                    ┌──────────────────────┼──────────────────┐  │
│                    │ Domínio Bloqueado?   │                  │  │
│                    ▼                      ▼                  │  │
│              ┌─────────┐           ┌─────────────┐          │  │
│              │ BLOCK   │           │  FORWARD    │          │  │
│              │ 0.0.0.0 │           │  Upstream   │          │  │
│              └────┬────┘           │  (8.8.8.8)  │          │  │
│                   │                └─────────────┘          │  │
│                   ▼                                         │  │
│          ┌───────────────┐                                  │  │
│          │ blocked.jsonl │──────────────────────────────────┘  │
│          │  (evidência)  │                                     │
│          └───────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (collect_dns_blocks job)
┌─────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              submit-job-result Edge Function             │   │
│  │  • Valida eventos (Zod validation)                       │   │
│  │  • Correlaciona com blocked_websites                     │   │
│  │  • Insere em blocked_access_attempts                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Pré-requisitos

### 1. Habilitar Feature Flag no Tenant

```sql
-- Verificar se já está habilitado
SELECT dns_local_filter_enabled 
FROM tenant_settings 
WHERE tenant_id = '<TENANT_ID>';

-- Habilitar
UPDATE tenant_settings 
SET dns_local_filter_enabled = true 
WHERE tenant_id = '<TENANT_ID>';
```

### 2. Binário no Storage

O binário deve estar em:
- **Path**: `agent-installers/dns-filter/cybershield-dns.exe`
- **SHA256**: `agent-installers/dns-filter/cybershield-dns.exe.sha256`

Verificar via Supabase Storage ou query:
```sql
-- Verificar se bucket existe
SELECT * FROM storage.buckets WHERE id = 'agent-installers';
```

### 3. Agent Compatível

O agent Windows deve estar na versão **v3.10.39+** com handler `setup_dns_filter` implementado.

## Fluxo de Deployment

### Passo 1: Build do Binário (GitHub Actions)

```bash
# Trigger manual do workflow
gh workflow run build-dns-filter.yml -f version=1.0.0

# Ou via push para dns-filter/**
git push origin main
```

O workflow:
1. Compila `cybershield-dns.exe` (Go 1.21)
2. Calcula SHA256
3. Upload para Supabase Storage (path sem versão)
4. Cria artifact para download

### Passo 2: Criar Job de Setup

```sql
-- Criar job para agent específico
INSERT INTO jobs (tenant_id, agent_name, type, status, payload)
SELECT 
  a.tenant_id,
  a.agent_name,
  'setup_dns_filter',
  'queued',
  '{}'::jsonb
FROM agents a
WHERE a.agent_name = 'PC-TARGET'
  AND a.status = 'active';
```

### Passo 3: Agent Executa Setup

O handler do agent:
1. Chama `serve-dns-filter` Edge Function
2. Baixa binário via signed URL
3. Valida SHA256
4. Instala como serviço Windows
5. Configura DNS do sistema para 127.0.0.1

### Passo 4: Sincronizar Políticas

```sql
-- Criar job para sincronizar lista de bloqueio
INSERT INTO jobs (tenant_id, agent_name, type, status, payload)
SELECT 
  a.tenant_id,
  a.agent_name,
  'sync_blocked_websites',
  'queued',
  '{"apply_to_hosts": false}'::jsonb  -- DNS Filter usa própria lista
FROM agents a
WHERE a.status = 'active'
  AND a.tenant_id = '<TENANT_ID>';
```

### Passo 5: Coletar Eventos de Bloqueio

```sql
-- Job periódico para coletar evidências
INSERT INTO jobs (tenant_id, agent_name, type, status, payload)
SELECT 
  a.tenant_id,
  a.agent_name,
  'collect_dns_blocks',
  'queued',
  '{}'::jsonb
FROM agents a
WHERE a.status = 'active';
```

## Troubleshooting

### Erro 404 no serve-dns-filter

**Causa**: Binário não existe no path esperado.

**Verificar**:
```bash
# Via Supabase CLI
supabase storage ls agent-installers/dns-filter/

# Deve mostrar:
# cybershield-dns.exe
# cybershield-dns.exe.sha256
```

**Solução**: Re-executar GitHub Actions workflow.

### Erro "Feature not enabled"

**Causa**: `dns_local_filter_enabled = false` no tenant.

**Solução**:
```sql
UPDATE tenant_settings 
SET dns_local_filter_enabled = true 
WHERE tenant_id = '<TENANT_ID>';
```

### DNS não Funciona Após Setup

**Verificar no endpoint**:
```powershell
# Verificar serviço
Get-Service -Name "CyberShieldDNS"

# Verificar DNS configurado
Get-DnsClientServerAddress -InterfaceAlias "Ethernet"

# Testar resolução
nslookup google.com 127.0.0.1
```

**Logs do DNS Filter**:
```powershell
Get-Content "C:\CyberShield\dns-filter\logs\dns-filter.log" -Tail 50
```

### Eventos Não Aparecem no Dashboard

**Verificar jobs**:
```sql
SELECT id, status, error_message, created_at
FROM jobs
WHERE type = 'collect_dns_blocks'
ORDER BY created_at DESC
LIMIT 10;
```

**Verificar dados coletados**:
```sql
SELECT COUNT(*), agent_name, DATE(attempted_at)
FROM blocked_access_attempts
WHERE source = 'collect_dns_blocks'
GROUP BY agent_name, DATE(attempted_at)
ORDER BY DATE(attempted_at) DESC;
```

## Queries de Monitoramento

### Status dos DNS Filters

```sql
-- Agents com DNS Filter habilitado (baseado em jobs bem-sucedidos)
SELECT 
  a.agent_name,
  a.hostname,
  MAX(j.completed_at) as last_dns_setup,
  COUNT(DISTINCT CASE WHEN j.type = 'collect_dns_blocks' AND j.status = 'completed' THEN j.id END) as dns_collections
FROM agents a
LEFT JOIN jobs j ON j.agent_name = a.agent_name 
  AND j.type IN ('setup_dns_filter', 'collect_dns_blocks')
WHERE a.status = 'active'
GROUP BY a.id, a.agent_name, a.hostname
ORDER BY last_dns_setup DESC NULLS LAST;
```

### Eventos de Bloqueio por Domínio

```sql
SELECT 
  domain,
  COUNT(*) as block_count,
  COUNT(DISTINCT agent_name) as affected_agents,
  MAX(attempted_at) as last_blocked
FROM blocked_access_attempts
WHERE source = 'collect_dns_blocks'
  AND attempted_at > NOW() - INTERVAL '7 days'
GROUP BY domain
ORDER BY block_count DESC
LIMIT 20;
```

### Health Check do Sistema

```sql
-- Jobs de DNS nas últimas 24h
SELECT 
  type,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_sec
FROM jobs
WHERE type IN ('setup_dns_filter', 'collect_dns_blocks', 'sync_blocked_websites')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY type, status
ORDER BY type, status;
```

## Métricas e Alertas

### KPIs Recomendados

| Métrica | Threshold Warning | Threshold Critical |
|---------|------------------|-------------------|
| Taxa de sucesso setup_dns_filter | < 90% | < 70% |
| Eventos coletados/dia/agent | < 10 | 0 |
| Latência serve-dns-filter (p95) | > 500ms | > 2000ms |

### Query para Alerta de Falhas

```sql
-- Alertar se > 20% dos jobs falharam nas últimas 2h
SELECT 
  COUNT(*) FILTER (WHERE status = 'failed') * 100.0 / COUNT(*) as failure_rate
FROM jobs
WHERE type LIKE '%dns%'
  AND created_at > NOW() - INTERVAL '2 hours'
HAVING COUNT(*) FILTER (WHERE status = 'failed') * 100.0 / COUNT(*) > 20;
```

## Rollback

### Desabilitar DNS Filter em Agent

```powershell
# No endpoint Windows (como admin)
Stop-Service -Name "CyberShieldDNS" -Force
sc.exe delete "CyberShieldDNS"

# Restaurar DNS
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses ("8.8.8.8", "8.8.4.4")
```

### Desabilitar Feature no Tenant

```sql
UPDATE tenant_settings 
SET dns_local_filter_enabled = false 
WHERE tenant_id = '<TENANT_ID>';
```

## Versionamento

| Versão | Data | Mudanças |
|--------|------|----------|
| 1.0.0 | 2024-12 | Release inicial |

---

*Última atualização: Dezembro 2024*
