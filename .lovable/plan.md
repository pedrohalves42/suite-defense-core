
# Plano: Corrigir Dessincronização JWT → Dashboard Vazio

## Diagnóstico Completo

### Sintoma
Dashboard mostra "0 computadores" mas banco tem 3 agentes ativos para o tenant "Pedro Alves":
- `pcteste1` (heartbeat: 15:14:29)
- `MIT-SERVIDOR` (heartbeat: 15:14:14)
- `PCteste2` (heartbeat: 14:29:10)

### Causa Raiz

As views `agents_safe` e `agent_snapshots` filtram por `get_active_tenant_id()`:

```text
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO ATUAL (QUEBRADO)                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Frontend chama set-active-tenant → OK (logs confirmam)      │
│  2. refreshSession() atualiza JWT → PARCIALMENTE                │
│  3. Query para agents_safe:                                     │
│     → View filtra: WHERE tenant_id = get_active_tenant_id()     │
│     → JWT sem claim → get_active_tenant_id() = NULL             │
│     → tenant_id = NULL é SEMPRE FALSE                           │
│     → RETORNA 0 LINHAS                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Evidência nos logs do banco:**
```
[get_active_tenant_id] No active_tenant_id claim in JWT (sampled 1%)
```
Isso aparece centenas de vezes, confirmando que muitas queries estão rodando sem o claim.

### Arquivos Afetados

**46 arquivos** usam `agents_safe` diretamente, todos vulneráveis:
- `src/pages/admin/Dashboard.tsx`
- `src/pages/admin/SecurityMonitoring.tsx`
- `src/pages/AgentMonitoring.tsx`
- `src/hooks/useAgentSyncStatus.tsx`
- E mais 42 arquivos...

---

## Solução Proposta

### Abordagem: Query Direta com Filtro Explícito

Modificar as views para **não depender do JWT** e sim usar parâmetros explícitos passados pelo frontend.

### Fase 1: Criar Views Sem Filtro Interno (Banco)

Criar novas versões das views que expõem `tenant_id` mas não filtram:

```sql
-- View base sem filtro - usada apenas por RPCs SECURITY DEFINER
CREATE OR REPLACE VIEW agents_base 
WITH (security_invoker=on) AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version,
  agent_version, agent_version_code, display_name, enrolled_at,
  last_heartbeat, last_block_sync_at, poll_interval_seconds,
  agent_mode, agent_state, agent_state_reason, agent_state_changed_at,
  safe_mode_reason, safe_mode_entered_at, is_throttled, throttled_at,
  throttle_reason, is_isolated, isolated_at, isolation_reason,
  archived_at, archived_reason, force_update_version, force_update_reason,
  force_update_at, force_update_override_safe_mode,
  force_update_override_safe_mode_expires_at, last_forced_update_applied,
  offline_reason, offline_detected_at, ed25519_supported, signature_mode,
  result_public_key, result_key_fingerprint, result_key_registered_at,
  requires_revalidation, revalidation_reason, revalidation_required_at
FROM agents;
-- Exclui: hmac_secret (ADR-026)
```

### Fase 2: Atualizar RPC Para Usar Tabela Direta

A RPC `get_agents_snapshots_list` já é SECURITY DEFINER, mas lê da view que filtra. Modificar para ler da tabela `agents` diretamente:

```sql
CREATE OR REPLACE FUNCTION public.get_agents_snapshots_list(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(row(
    a.id AS agent_id,
    a.tenant_id,
    a.hostname,
    a.os_type,
    a.agent_version AS version,
    a.last_heartbeat,
    a.last_heartbeat > (now() - '00:02:00'::interval) AS online,
    EXTRACT(epoch FROM now() - a.last_heartbeat) * 1000::numeric AS latency_ms,
    a.agent_state,
    COALESCE(a.safe_mode_entered_at IS NOT NULL, false) AS safe_mode,
    a.safe_mode_reason,
    COALESCE(a.is_isolated, false) AS is_isolated,
    COALESCE(a.is_throttled, false) AS is_throttled,
    0::bigint AS active_issues,
    (SELECT count(*) FROM ai_insights ai WHERE ai.agent_id = a.id AND ai.status = 'open') AS unresolved_insights,
    now() AS snapshot_at
  ))
  FROM agents a
  WHERE a.archived_at IS NULL
    AND a.status = 'active'
    AND (
      a.tenant_id = p_tenant_id
      OR (p_tenant_id IS NULL AND a.tenant_id = get_active_tenant_id())
      OR is_current_super_admin()
    );
$function$;
```

### Fase 3: Criar RPC Para Agents List (Novo)

Criar uma RPC `get_agents_list` para substituir queries diretas à view:

```sql
CREATE OR REPLACE FUNCTION public.get_agents_list(
  p_tenant_id uuid,
  p_include_archived boolean DEFAULT false
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(row(
    id, tenant_id, agent_name, hostname, status, os_type, os_version,
    agent_version, agent_version_code, display_name, enrolled_at,
    last_heartbeat, last_block_sync_at, agent_state, is_throttled,
    is_isolated, archived_at
  ))
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND (p_include_archived OR archived_at IS NULL);
$function$;
```

### Fase 4: Atualizar Frontend (Gradual)

Migrar os arquivos mais críticos primeiro:

**Prioridade 1 - Dashboards:**
- `src/pages/admin/Dashboard.tsx` - Usar RPC `get_agents_list`
- `src/pages/AgentMonitoring.tsx` - Usar RPC `get_agents_snapshots_list`

**Prioridade 2 - Hooks:**
- `src/hooks/useAgentSyncStatus.tsx`
- `src/hooks/useAgentSnapshots.ts` (já usa RPC, apenas garantir `tenant?.id`)

### Fase 5: Fallback Alternativo (Temporário)

Enquanto a migração gradual acontece, modificar a view `agents_safe` para aceitar NULL graciosamente:

```sql
CREATE OR REPLACE VIEW agents_safe AS
SELECT ...
FROM agents
WHERE 
  -- Aceita tenant_id do JWT OU fallback para qualquer tenant que o usuário tem acesso
  (tenant_id = get_active_tenant_id()) 
  OR 
  -- Fallback: verifica se usuário tem acesso via user_roles quando JWT está vazio
  (get_active_tenant_id() IS NULL AND EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
      AND ur.tenant_id = agents.tenant_id
  ));
```

---

## Arquivos a Modificar

| Arquivo/Recurso | Ação | Prioridade |
|----------------|------|------------|
| **Banco**: `agents_safe` view | Adicionar fallback para JWT vazio | P0 (Crítico) |
| **Banco**: `agent_snapshots` view | Adicionar fallback para JWT vazio | P0 (Crítico) |
| **Banco**: RPC `get_agents_list` | Criar nova RPC com parâmetro explícito | P1 |
| **Banco**: RPC `get_agents_snapshots_list` | Modificar para ler da tabela direta | P1 |
| `src/pages/admin/Dashboard.tsx` | Usar RPC ao invés de view | P2 |
| `src/pages/AgentMonitoring.tsx` | Usar RPC ao invés de view | P2 |
| +44 outros arquivos | Migração gradual | P3 |

---

## Validação Pós-Implementação

1. **Imediato**: Dashboard deve mostrar 3 agentes para Pedro Alves
2. **Logs do banco**: "No active_tenant_id claim" deve diminuir drasticamente
3. **Consistência**: Mesmos números em Dashboard, Monitoramento e Diagnóstico
4. **Segurança**: Super admin continua vendo todos os tenants

---

## Resultado Esperado

- Dashboards mostram dados corretos mesmo quando JWT não tem `active_tenant_id`
- Filtro explícito `tenant.id` do frontend é respeitado
- Sistema resiliente a race conditions de sincronização JWT
- Sem quebra de segurança (RLS/SECURITY DEFINER mantidos)
