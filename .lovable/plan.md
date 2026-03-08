

# Plano: Painel Ed25519 + Re-trigger Automatico + Resolver Alerta

## 3 Entregas

### 1. Painel de Status de Assinaturas Ed25519 no Dashboard Admin

Criar um componente `ReleaseSignatureStatusCard` que sera adicionado ao Dashboard principal (`src/pages/admin/Dashboard.tsx`) entre a secao de graficos e a secao de ciclos.

**Componente:** `src/components/admin/ReleaseSignatureStatusCard.tsx`
- Consulta `agent_releases_public` filtrando `is_active = true`
- Para cada release ativo, mostra: plataforma, versao, e badge "Assinado" (verde) ou "Sem Assinatura" (vermelho)
- Icone `ShieldCheck` para assinados, `AlertCircle` para nao assinados
- Card compacto seguindo o padrao visual existente (Card/CardHeader/CardContent)
- Poll a cada 5 minutos (staleTime: 5min)

**Nota:** O campo `signature_base64` nao esta disponivel na view `agent_releases_public`. O componente usara a Edge Function `get-admin-releases` (ja existente) para obter os dados completos, habilitado apenas para super_admin via `useSuperAdmin()`.

**Integracao no Dashboard:** Adicionar entre secao 4 (graficos) e secao 5 (ciclos), com motion animation consistente.

### 2. Re-trigger Automatico de Force Update (72h offline)

Adicionar logica ao `run_maintenance_v2` RPC para re-aplicar `force_update_at` em agentes que:
- Estao offline ha mais de 72h
- Tem `force_update_at IS NULL`
- Tem versao diferente da versao ativa mais recente do release

**Migracao SQL:**
- Criar ou alterar `run_maintenance_v2` para incluir um bloco que faz:
```sql
UPDATE agents SET force_update_at = now(), force_update_reason = 'auto_retrigger_72h_offline'
WHERE force_update_at IS NULL
  AND last_heartbeat < now() - interval '72 hours'
  AND agent_version IS DISTINCT FROM (
    SELECT version FROM agent_releases 
    WHERE is_active = true AND platform = agents.os_type 
    ORDER BY created_at DESC LIMIT 1
  );
```
- Retornar contagem de agentes re-triggered no resultado da RPC

**Atualizacao do use case:** Adicionar `retriggeredAgents` ao `MaintenanceResult` em `run-maintenance.ts`.

### 3. Resolver Alerta Critico Remanescente (stale_cron falso positivo)

Usar o **insert tool** (nao migracao) para executar:
```sql
UPDATE system_alerts 
SET resolved = true, resolved_at = now(), 
    resolved_by = '48829437-3279-4a28-bc32-66515c93924a',
    resolution_notes = 'Falso positivo: maintenance-cron executou com sucesso 1s apos criacao do alerta',
    status = 'resolved'
WHERE resolved = false AND severity = 'critical' AND alert_type = 'stale_cron';
```

## Arquivos Afetados

| Arquivo | Acao |
|---------|------|
| `src/components/admin/ReleaseSignatureStatusCard.tsx` | CRIAR |
| `src/pages/admin/Dashboard.tsx` | EDITAR (importar e adicionar card) |
| `supabase/functions/_shared/hexagonal/use-cases/run-maintenance.ts` | EDITAR (adicionar retriggeredAgents ao result) |
| Migracao SQL (run_maintenance_v2) | CRIAR (adicionar logica de re-trigger) |
| Insert SQL (resolver alerta) | EXECUTAR via insert tool |

