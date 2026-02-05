

# Plano de Correção: Erros no Drawer de Detalhes do Agente

## Visão Geral do Problema

Foram identificados dois problemas principais no drawer de detalhes do agente "pcteste1":

### Problema 1: Aba "Geral" - "Erro ao carregar estado"
O sistema não consegue determinar o estado do computador porque a consulta ao banco de dados não retorna dados.

### Problema 2: Aba "Diagnóstico" - Issues sem descrição
As issues críticas aparecem apenas com o badge "Crítico", mas sem texto descritivo.

---

## Análise Técnica

### Causa do Problema 1
A view `agents_safe` usa a função `get_active_tenant_id()` que depende do claim JWT. Se o tenant não estiver sincronizado no JWT, a query retorna vazio.

O hook `useAgentCausality` já tem guard de loading mas ainda depende da sincronização JWT:

```text
agents_safe (view)
     │
     └── WHERE tenant_id = get_active_tenant_id()
                               │
                               └── Lê de request.jwt.claims->>'active_tenant_id'
```

**Solução**: Alterar `useAgentCausality` para usar query direta com `tenant_id` explícito (padrão ADR-026) ao invés de depender da view RLS.

### Causa do Problema 2
A função `diagnose_agent_issues` retorna `event_data->>'message'` como descrição, mas os logs não têm campo `message`. Os campos disponíveis são:
- `reason` (mudanças de estado)
- `error_message` (erros de componentes)
- `event` (eventos gerais)

**Solução**: Atualizar a função SQL para gerar descrições amigáveis baseadas no `event_type` e campos disponíveis.

---

## Plano de Implementação

### Etapa 1: Corrigir useAgentCausality (Alta Prioridade)

Modificar o hook para:
1. Usar query direta à tabela `agents` com filtro explícito de `tenant_id`
2. Evitar dependência da view `agents_safe` que requer JWT sincronizado
3. Manter consistência com o padrão de outros hooks (ex: `useWebActivity`)

**Arquivo**: `src/hooks/useAgentCausality.ts`

### Etapa 2: Atualizar diagnose_agent_issues (Alta Prioridade)

Modificar a função SQL para:
1. Gerar mensagens descritivas baseadas em `event_type`
2. Usar campos `reason`, `error_message`, ou construir mensagem a partir dos dados
3. Traduzir tipos de eventos para português amigável

**Migração SQL necessária**

### Etapa 3: Melhorar DiagnosticIssuesList (Média Prioridade)

Adicionar fallback no frontend para quando `description` estiver vazio:
1. Usar `issue_type` traduzido como fallback
2. Mostrar resumo dos detalhes se disponíveis

**Arquivo**: `src/components/agent/DiagnosticIssuesList.tsx`

---

## Detalhes Técnicos

### Mudanças em useAgentCausality.ts

```typescript
// DE: Query via view agents_safe
const { data: agent } = await supabase
  .from('agents_safe')
  .select('*')
  .eq('id', agentId)
  .eq('tenant_id', activeTenant.id)
  .maybeSingle();

// PARA: Query direta à tabela agents
const { data: agent } = await supabase
  .from('agents')
  .select('*')
  .eq('id', agentId)
  .eq('tenant_id', activeTenant.id)
  .is('archived_at', null)
  .maybeSingle();
```

### Migração SQL - diagnose_agent_issues

```sql
-- Lógica para gerar mensagens descritivas
CASE e.event_type
  WHEN 'security_event' THEN 
    COALESCE(
      e.event_data->>'error_message',
      e.event_data->>'reason',
      'Evento de segurança: ' || COALESCE(e.event_data->>'component', 'sistema')
    )
  WHEN 'state_change' THEN
    'Mudança de estado: ' || COALESCE(e.event_data->>'from', '?') 
    || ' → ' || COALESCE(e.event_data->>'to', '?')
  WHEN 'policy_drift' THEN
    'Desvio de política detectado (' || COALESCE(e.event_data->>'drift_count', '0') || ' itens)'
  -- ... outros tipos
END AS message
```

### Fallback no Frontend

```typescript
// DiagnosticIssueItem
const displayDescription = issue.description 
  || translateIssueType(issue.issue_type)
  || 'Problema detectado';
```

---

## Resultado Esperado

Após as correções:

1. **Aba Geral**: Mostrará o estado do agente corretamente ("Saudável", "Offline", etc.)
2. **Aba Diagnóstico**: Issues aparecerão com descrições legíveis como:
   - "Mudança de estado: DEGRADED → ERROR"
   - "Serviço DNS não está executando"
   - "Desvio de política detectado (5 itens)"

---

## Verificação

1. Abrir drawer do agente "pcteste1"
2. Verificar se aba "Geral" mostra estado corretamente
3. Verificar se aba "Diagnóstico" mostra descrições nas issues
4. Testar com outro agente para confirmar consistência

