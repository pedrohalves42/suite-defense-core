

# Plano P1: Correções de Segurança HIGH (V-606, V-607)

## Resumo Executivo

Este plano implementa as correções P1 (HIGH) identificadas na auditoria de Dr. Vellum:
- **V-606**: Remover fallback inseguro em `enroll-agent` ou adicionar validação cross-tenant
- **V-607**: Corrigir `poll-jobs` para usar `agent.id` em vez de `agent_name` no heartbeat update

---

## Análise Técnica

### V-606: Fallback Inseguro em enroll-agent

**Arquivo**: `supabase/functions/enroll-agent/index.ts` (linhas 272-314)

**Problema Atual**:
```typescript
if (reviveError) {
  // Fallback: update direto se RPC falhar
  await supabase
    .from('agents')
    .update({ ... })
    .eq('id', existingAgent.id);  // Não valida tenant_id!
}
```

O fallback faz UPDATE sem verificar se `existingAgent.tenant_id === keyData.tenant_id`, permitindo potencial bypass da validação cross-tenant se a RPC falhar.

**Correção**: Adicionar validação cross-tenant antes do fallback ou remover completamente o fallback (fazer RPC obrigatória).

---

### V-607: Polling Usando agent_name

**Arquivo**: `supabase/functions/poll-jobs/index.ts` (linha 175)

**Problema Atual**:
```typescript
await supabase
  .from('agents')
  .update({ last_heartbeat: now.toISOString() })
  .eq('agent_name', agent.agent_name)  // INSEGURO: dois tenants podem ter mesmo nome
```

Se dois tenants criarem agentes com o mesmo nome, o update pode afetar o agente errado.

**Correção**: Usar `.eq('id', token.agent_id)` que é único globalmente.

---

## Implementação

### Correção 1: enroll-agent (V-606)

**Opção Escolhida**: Adicionar validação cross-tenant no fallback

```typescript
// Linhas 272-314 do enroll-agent/index.ts
if (reviveError) {
  logger.warn(`[${requestId}] Failed to revive agent via RPC, falling back with cross-tenant validation`, reviveError);
  
  // V-606 FIX: Validar tenant ANTES do fallback para prevenir cross-tenant attack
  const { data: existingAgentFull, error: fetchError } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', existingAgent.id)
    .single();
  
  if (fetchError || !existingAgentFull) {
    logger.error(`[${requestId}] Failed to fetch agent for fallback validation`);
    return new Response(
      JSON.stringify({ error: 'Agent not found during fallback', code: 'AGENT_NOT_FOUND' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // V-606 FIX: Cross-tenant validation
  if (existingAgentFull.tenant_id !== keyData.tenant_id) {
    logger.error(`[${requestId}] SECURITY: Cross-tenant attack blocked in fallback path!`, {
      agent_id: existingAgent.id,
      agent_tenant: existingAgentFull.tenant_id,
      key_tenant: keyData.tenant_id
    });
    
    await createAuditLog({
      supabase,
      tenantId: keyData.tenant_id,
      action: 'agent_reenroll_cross_tenant_blocked',
      resourceType: 'agent',
      resourceId: existingAgent.id,
      details: { 
        reason: 'cross_tenant_attack_blocked_fallback',
        agent_name: agentName,
        expected_tenant_id: keyData.tenant_id
      },
      request: req,
      success: false,
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Unauthorized: Agent belongs to different tenant' 
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // Audit log for fallback path (now safe)
  await createAuditLog({
    supabase,
    tenantId: keyData.tenant_id,
    action: 'agent_reenroll_rpc_fallback',
    resourceType: 'agent',
    resourceId: agentName,
    details: { 
      reason: 'rpc_revive_failed', 
      error: reviveError.message,
      agent_id: existingAgent.id,
      fallback_method: 'direct_update_validated'
    },
    request: req,
    success: true,
  });
  
  // Fallback seguro: tenant validado acima
  await supabase
    .from('agents')
    .update({ 
      hmac_secret: hmacSecret,
      status: 'active',
      last_heartbeat: null,
      is_throttled: false,
      is_isolated: false,
      safe_mode_entered_at: null,
      offline_detected_at: null,
      offline_reason: null,
      archived_at: null,
      archived_reason: null
    })
    .eq('id', existingAgent.id);
  
  // Deactivate old tokens
  await supabase
    .from('agent_tokens')
    .update({ is_active: false })
    .eq('agent_id', existingAgent.id);
}
```

---

### Correção 2: poll-jobs (V-607)

**Mudança**: Linha 175 de `poll-jobs/index.ts`

```typescript
// ANTES (V-607 inseguro):
.eq('agent_name', agent.agent_name)

// DEPOIS (V-607 corrigido):
.eq('id', token.agent_id)
```

**Código completo das linhas 170-180**:
```typescript
// Atualizar heartbeat e last_used_at do token (usando hash)
await Promise.all([
  supabase
    .from('agents')
    .update({ last_heartbeat: now.toISOString() })
    .eq('id', token.agent_id),  // V-607 FIX: Usar ID único em vez de agent_name
  supabase
    .from('agent_tokens')
    .update({ last_used_at: now.toISOString() })
    .eq('token_hash', tokenHash)
])
```

---

## Validação Pós-Implementação

### Teste V-606 (Fallback Cross-Tenant)
1. Simular falha da RPC `revive_agent_on_reenroll`
2. Tentar reenroll de agente de Tenant A usando chave de Tenant B
3. Verificar que o fallback bloqueia com status 403

### Teste V-607 (ID vs Name)
1. Criar dois agentes com mesmo nome em tenants diferentes
2. Fazer poll-jobs de um deles
3. Verificar que apenas o agente correto teve heartbeat atualizado

```sql
-- Query de validação V-607
SELECT agent_name, tenant_id, last_heartbeat 
FROM agents 
WHERE agent_name = 'nome-duplicado'
ORDER BY last_heartbeat DESC;
-- Apenas um deve ter heartbeat recente
```

---

## Resumo de Entregáveis

| ID | Arquivo | Linha(s) | Correção |
|----|---------|----------|----------|
| V-606 | `supabase/functions/enroll-agent/index.ts` | 272-314 | Adicionar validação cross-tenant no fallback |
| V-607 | `supabase/functions/poll-jobs/index.ts` | 175 | Trocar `.eq('agent_name', ...)` por `.eq('id', token.agent_id)` |

---

## Seção Técnica

### Por que V-606 é HIGH?
O fallback é executado apenas quando a RPC falha (erro de banco, timeout, etc). Porém, um atacante sofisticado poderia explorar condições de race ou sobrecarga para forçar falha da RPC e então usar o fallback sem validação. Mesmo sendo edge case, a probabilidade em produção sob ataque justifica HIGH.

### Por que V-607 é HIGH?
`agent_name` não é globalmente único - apenas único por tenant (poderia até não ser). Dois tenants podem ter agentes com o mesmo nome. Se isso ocorrer, o UPDATE afetaria potencialmente os dois registros (ou o errado primeiro). Usar `id` (UUID) garante unicidade absoluta.

### Impacto em Performance
- V-606: +1 query de SELECT no fallback path (raro, só em falha de RPC)
- V-607: Nenhum impacto - mesma query, apenas filtro diferente

