# Runbook: Detecção de Schema Drift

**Severidade**: Crítica  
**Meta MTTR**: < 30 minutos  
**Escalação**: Imediata se produção afetada

---

## Sintomas

- Testes de contrato falhando no CI
- Edge Functions retornando 500/503
- Mensagens de erro mencionando colunas/tabelas ausentes
- `SCHEMA_DRIFT` em respostas de health probe

---

## Definição

**Schema Drift** ocorre quando:
- Edge Functions esperam colunas/tabelas que não existem
- Schema do banco é modificado sem atualizar código dependente
- Migrations executam em ordem errada

---

## Diagnóstico Rápido

### 1. Executar Testes de Contrato

```bash
cd contracts
npm install
npx playwright test
```

Testes falhando indicam drift específico:
- `audit_logs.contract.ts` → problemas na tabela audit_logs
- `agents.contract.ts` → problemas na tabela agents

### 2. Verificar RPC describe_table

```sql
SELECT * FROM describe_table('nome_tabela_afetada');
```

Comparar com schema esperado em `contracts/schemas/`.

### 3. Revisar Migrations Recentes

```sql
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
```

---

## Cenários Comuns de Drift

### A. Coluna Ausente

**Sintoma**: `column "X" does not exist`

**Correção**:
```sql
ALTER TABLE nome_tabela 
ADD COLUMN nome_coluna tipo_dado DEFAULT valor_padrao;
```

### B. Tipo de Coluna Incompatível

**Sintoma**: Erros de casting ou nulos inesperados

**Correção**:
```sql
ALTER TABLE nome_tabela 
ALTER COLUMN nome_coluna TYPE novo_tipo USING nome_coluna::novo_tipo;
```

### C. Coluna Proibida Ainda Existe

**Sintoma**: Teste de contrato falha em `forbiddenColumns`

**Correção**:
```sql
-- CUIDADO: Isso exclui dados
ALTER TABLE nome_tabela DROP COLUMN nome_coluna;

-- Mais seguro: Renomear para deprecated
ALTER TABLE nome_tabela RENAME COLUMN nome_coluna TO _deprecated_nome_coluna;
```

### D. Tabela Ausente

**Sintoma**: `relation "X" does not exist`

**Correção**:
1. Revisar migration que deveria criar a tabela
2. Executar migration ausente
3. Verificar com teste de contrato

### E. RPC/Função Ausente

**Sintoma**: `function "X" does not exist`

**Correção**:
1. Verificar `docs/architecture/` para definição da função
2. Executar migration apropriada
3. Verificar se a função existe:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'nome_funcao';
   ```

---

## Procedimento de Recuperação

### Imediato (< 10 min)

1. **Identificar escopo do drift**
   ```bash
   npx playwright test --reporter=list 2>&1 | grep -E "(FAIL|PASS)"
   ```

2. **Avaliar impacto em produção**
   - Verificar logs de Edge Functions
   - Verificar `system_alerts` para falhas recentes

3. **Se crítico, ativar modo de emergência**
   ```sql
   UPDATE system_global_state 
   SET mode = 'restricted', 
       updated_at = NOW(),
       changed_by = 'runbook-schema-drift'
   WHERE id = (SELECT id FROM system_global_state LIMIT 1);
   ```

### Correção (< 20 min)

1. **Criar migration para corrigir drift**
   ```sql
   -- Exemplo: Adicionar coluna ausente
   ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
   ```

2. **Executar migration em transação**
   ```sql
   BEGIN;
   -- SQL da migration aqui
   COMMIT;
   ```

3. **Verificar correção**
   ```bash
   npx playwright test contracts/schemas/afetado.contract.ts
   ```

### Restaurar (< 5 min)

1. **Reimplantar Edge Functions afetadas**
   ```bash
   npx supabase functions deploy nome-funcao
   ```

2. **Desativar modo de emergência se ativado**
   ```sql
   UPDATE system_global_state 
   SET mode = 'normal', 
       updated_at = NOW(),
       changed_by = 'runbook-schema-drift-recovery'
   WHERE id = (SELECT id FROM system_global_state LIMIT 1);
   ```

3. **Verificar recuperação**
   - Verificar respostas de Edge Functions
   - Confirmar que não há erros 503

---

## Prevenção

### 1. Sempre Executar Testes de Contrato no CI

```yaml
- name: Testes de Contrato
  run: |
    cd contracts
    npm ci
    npx playwright test
```

### 2. Usar Ferramenta de Migration para Todas as Mudanças de Schema

Nunca modificar schema diretamente em produção. Sempre usar:
```bash
npx supabase migration new descricao_da_mudanca
```

### 3. Atualizar Contratos Antes das Migrations

1. Adicionar novas colunas obrigatórias ao contrato
2. Executar teste (deve falhar)
3. Criar migration
4. Executar teste (deve passar)
5. Fazer merge do PR

### 4. Documentar Dependências Edge ↔ DB

Ver [ADR-027-edge-contracts.md](../architecture/ADR-027-edge-contracts.md)

---

## Referência de Schema de Contrato

| Arquivo de Contrato | Tabela | Colunas Críticas |
|---------------------|--------|-----------------|
| `audit_logs.contract.ts` | audit_logs | id, event_type, actor_id, tenant_id |
| `system_alerts.contract.ts` | system_alerts | id, alert_type, severity, status |
| `agents.contract.ts` | agents | id, tenant_id, agent_name, status |
| `invites.contract.ts` | invites | id, email, tenant_id, status |

---

## Runbooks Relacionados

- [RUNBOOK-EDGE-500.md](./RUNBOOK-EDGE-500.md)
- [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)
