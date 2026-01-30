
# Plano: Correção de Múltiplos Problemas Operacionais

## Diagnóstico Completo

### Problema 1: Erro no "Investigar anomalia"

**Status**: O erro não está sendo exibido nos logs recentes do `action-center-feed`. O componente `InsightInvestigationDrawer` abre um drawer, mas se o `item.agent_id` estiver ausente (para anomalias de sistema), mostra "Agente não identificado" e bloqueia ações.

**Causa raiz**: Anomalias detectadas automaticamente do tipo `ai_insight` podem não ter `agent_id` associado, causando o erro "Agente não identificado" quando o usuário tenta executar ações.

**Correção**: Modificar `InsightInvestigationDrawer.tsx` para tratar corretamente insights sem `agent_id`, mostrando ações alternativas e mensagens informativas.

---

### Problema 2: Jobs "queued" não sendo processados (CRÍTICO)

**Status**: Erro `ILLEGAL_STATE_TRANSITION` no `poll-jobs` ao tentar fazer transição de status.

**Causa raiz**: O trigger `enforce_job_state_transitions` permite transições:
- `pending` → `queued`, `cancelled`, `failed`
- `queued` → `delivered`, `failed`, `cancelled`

Mas a RPC `claim_jobs_for_agent` filtra por `status IN ('queued', 'pending')` e tenta mudar para `delivered`. O problema é que alguns jobs estão com status `pending` e a RPC tenta ir direto para `delivered`, mas a transição `pending` → `delivered` **não é permitida**.

**Solução**: A RPC precisa primeiro transicionar `pending` → `queued` antes de ir para `delivered`, ou o trigger precisa permitir `pending` → `delivered`.

---

### Problema 3: Navegação - Sem atalho para página inicial após logout

**Status**: Após logout, usuário não consegue voltar à página inicial.

**Causa raiz**: O `AppSidebar.tsx` não tem link direto para `/` (Landing page). Após logout, o usuário fica na página de login sem acesso claro ao site público.

**Correção**: 
1. Adicionar link no header da página de Login para voltar à Landing page
2. O logo no Navbar já linka para `/`, então é questão de visibilidade

---

## Correções Propostas

### Fase A: Corrigir Transição de Estado de Jobs (P0 - CRÍTICO)

**Arquivo**: SQL Migration

Alterar o trigger `enforce_job_state_transitions` para permitir a transição `pending` → `delivered`:

```sql
-- Atualizar as transições válidas
CREATE OR REPLACE FUNCTION enforce_job_state_transitions()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions jsonb := '{
    "pending": ["queued", "delivered", "cancelled", "failed"],
    "queued": ["delivered", "failed", "cancelled"],
    "delivered": ["completed", "failed", "cancelled"],
    "completed": ["archived"],
    "failed": ["archived"],
    "cancelled": ["archived"]
  }'::jsonb;
  v_allowed_states jsonb;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  v_allowed_states := v_valid_transitions->OLD.status;
  
  IF v_allowed_states IS NULL OR NOT v_allowed_states ? NEW.status THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Cannot transition from % to %. Allowed: %',
      OLD.status, NEW.status, COALESCE(v_allowed_states, '[]'::jsonb)
    USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Fase B: Melhorar Tratamento de Insights sem Agent (P1)

**Arquivo**: `src/components/action-center/InsightInvestigationDrawer.tsx`

Modificar o `handleAction` para tratar insights de sistema (sem agent_id):

```typescript
const handleAction = async (action: string) => {
  // Para insights de sistema (sem agente), redirecionar ou mostrar alternativa
  if (!item.agent_id) {
    if (action === 'navigate_agent') {
      toast.info('Este insight é de sistema e não está vinculado a um agente específico');
      return;
    }
    // Permitir ações que não requerem agent_id
    if (['mark_resolved', 'ignore'].includes(action)) {
      handleResolve();
      return;
    }
    toast.info('Ações específicas de agente não disponíveis para insights de sistema');
    return;
  }
  // ... resto do código
};
```

### Fase C: Adicionar Navegação para Landing (P1)

**Arquivo**: `src/pages/Login.tsx`

Adicionar link visível para voltar à página inicial:

```tsx
// No header ou abaixo do form de login
<div className="text-center mt-4">
  <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
    ← Voltar para página inicial
  </Link>
</div>
```

### Fase D: Criar Função para Criar Jobs em Massa (P2)

**Arquivo**: Nova RPC e botão no dashboard

Criar uma RPC `create_jobs_for_all_agents` que cria um job específico para todos os agentes online de um tenant:

```sql
CREATE OR REPLACE FUNCTION create_jobs_for_all_agents(
  p_tenant_id uuid,
  p_job_type text,
  p_payload jsonb DEFAULT '{}'
)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
  v_agent RECORD;
BEGIN
  FOR v_agent IN
    SELECT id, agent_name 
    FROM agents 
    WHERE tenant_id = p_tenant_id 
      AND archived_at IS NULL
      AND status = 'active'
      AND last_heartbeat > NOW() - INTERVAL '5 minutes'
  LOOP
    INSERT INTO jobs (tenant_id, agent_id, agent_name, type, payload, status, approved)
    VALUES (p_tenant_id, v_agent.id, v_agent.agent_name, p_job_type, p_payload, 'queued', true);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Resumo de Entregáveis

| Prioridade | Problema | Solução | Tipo |
|------------|----------|---------|------|
| **P0** | Jobs não processando (ILLEGAL_STATE_TRANSITION) | Alterar trigger para permitir `pending` → `delivered` | SQL Migration |
| **P1** | Erro "Investigar anomalia" sem agent | Tratar insights de sistema no drawer | Frontend |
| **P1** | Sem atalho para Landing após logout | Adicionar link "Voltar" no Login | Frontend |
| **P2** | Criar jobs em massa | Nova RPC + botão no dashboard | SQL + Frontend |

---

## Validação Pós-Correção

1. **Jobs**: Verificar que agentes online estão recebendo e executando jobs:
   - Logs do `poll-jobs` sem erros `ILLEGAL_STATE_TRANSITION`
   - Jobs transitando para `delivered` → `completed`

2. **Investigar anomalia**: Testar clicar em "Investigar anomalia" para insights com e sem agente

3. **Navegação**: Fazer logout e verificar presença do link para Landing

4. **Jobs em massa**: Testar criação de jobs para todos agentes via dashboard
