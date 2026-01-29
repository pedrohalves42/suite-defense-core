
# Plano: Solucionar Findings de Segurança

## Análise Completa

### Findings que são FALSOS POSITIVOS (ignorar permanentemente)

| Finding | Razão para Ignorar |
|---------|-------------------|
| **profiles_public exposed** | View tem `security_invoker=on` + filtro `get_active_tenant_id()` - retorna 0 linhas para usuários não autenticados |
| **agents_public exposed** | View tem `security_invoker=on` + filtro `tenant_id = get_active_tenant_id()` - isolamento total |
| **agent_releases_public exposed** | View tem `security_invoker=true` + filtro `auth.uid()` - requer autenticação |
| **audit_logs_safe exposed** | View tem `security_invoker=on` + filtro `tenant_id = get_active_tenant_id()` - isolamento total |
| **enrollment_keys_safe exposed** | View tem `security_invoker=on` + filtro `tenant_id = get_active_tenant_id()` - isolamento total |
| **xlsx vulnerability** | Projeto usa **exceljs** (linha 80 do package.json), xlsx está listado mas **nunca importado** no código |

**Justificativa técnica:** Quando `security_invoker=on`, a view executa com as permissões do chamador. Como `get_active_tenant_id()` retorna `NULL` para usuários não autenticados, todas as queries retornam 0 linhas.

### Finding que PRECISA de correção

| Finding | Problema Real | Ação |
|---------|---------------|------|
| **hmac_agent_secrets sem RLS** | Tabela existe com `rls_enabled=false` e armazena segredos HMAC | Habilitar RLS com política apenas para `service_role` |

### Finding de dependência

| Finding | Ação |
|---------|------|
| **electron-builder vulnerability** | Dependência de desenvolvimento apenas - aceitar risco ou atualizar |

---

## Implementação

### Fase 1: Corrigir hmac_agent_secrets (Crítico)

```sql
-- Habilitar RLS na tabela de segredos
ALTER TABLE hmac_agent_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE hmac_agent_secrets FORCE ROW LEVEL SECURITY;

-- Nenhuma política para public/authenticated - apenas service_role pode acessar
-- (service_role ignora RLS automaticamente)
```

### Fase 2: Remover xlsx do package.json

O projeto usa `exceljs` para exportação Excel, mas `xlsx` está listado como dependência não utilizada e tem vulnerabilidades conhecidas.

```json
// Remover linha 104 do package.json:
"xlsx": "^0.18.5"
```

### Fase 3: Ignorar Falsos Positivos

Usar a ferramenta de security findings para marcar como ignorados:

1. `profiles_public` - View segura com security_invoker + tenant isolation
2. `agents_public` - View segura com security_invoker + tenant isolation  
3. `agent_releases_public` - View segura com security_invoker + auth.uid() check
4. `audit_logs_safe` - View segura com security_invoker + tenant isolation
5. `enrollment_keys_safe` - View segura com security_invoker + tenant isolation
6. `RLS Policy Always True` - Já ignorado previamente

---

## Validação Pós-Implementação

1. **hmac_agent_secrets:** Query `SELECT relrowsecurity FROM pg_class WHERE relname = 'hmac_agent_secrets'` deve retornar `true`
2. **xlsx removido:** `npm ls xlsx` não deve encontrar a dependência
3. **Scan limpo:** Todos os 6 errors devem estar resolvidos ou ignorados

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| Banco: `hmac_agent_secrets` | ALTER TABLE para habilitar RLS |
| `package.json` | Remover dependência xlsx |

---

## Resultado Esperado

- 0 Errors no security scan
- hmac_agent_secrets protegido por RLS
- Dependência vulnerável xlsx removida
- Views falsamente flagueadas documentadas como seguras
