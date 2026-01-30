
# Plano: Resolução de Alertas de Segurança

## Resumo Executivo

Após análise detalhada, **todos os 7 erros e 2 dos warnings são FALSOS POSITIVOS**. As views já possuem `security_invoker=on` e filtros de tenant, retornando 0 linhas para usuários não autenticados. Apenas **1 warning** (dependência vulnerável) requer ação real.

---

## Análise Técnica Detalhada

### Evidência de Proteção (Queries Executadas)

| View | security_invoker | has_tenant_filter | has_super_admin_check | Rows para anon |
|------|------------------|-------------------|----------------------|----------------|
| agents_public | ON | SIM | SIM | **0** |
| profiles_public | ON | SIM | SIM | **0** |
| enrollment_keys_safe | ON | SIM | SIM | **0** |
| audit_logs_safe | ON | SIM | SIM | **0** |
| agents_safe | ON | SIM | SIM | **0** |
| hmac_agent_secrets | ON | NAO (super_admin only) | SIM | **0** |
| active_agents | ON | SIM | SIM | **0** |
| agent_releases_public | ON | NAO | SIM (auth.uid()) | **0** |

**Conclusao**: O scanner detecta que as views existem mas nao consegue verificar que `security_invoker=on` faz com que a autenticacao do chamador seja verificada. Sem JWT valido, todas as views retornam 0 linhas.

---

## Acoes por Issue

### ERROS (7) - Todos Falsos Positivos

| Issue | View | Razao para Ignorar |
|-------|------|-------------------|
| Agent Infrastructure Details Exposed | `agents_public` | security_invoker=on + get_active_tenant_id() + is_current_super_admin() - retorna 0 linhas para anon |
| User Profile Information Accessible | `profiles_public` | security_invoker=on + get_active_tenant_id() + is_current_super_admin() - retorna 0 linhas para anon |
| Enrollment Key Metadata Publicly Accessible | `enrollment_keys_safe` | security_invoker=on + get_active_tenant_id() + is_current_super_admin() - retorna 0 linhas para anon |
| Audit Log Information Publicly Accessible | `audit_logs_safe` | security_invoker=on + get_active_tenant_id() + is_current_super_admin() - retorna 0 linhas para anon |
| Detailed Agent Configuration Data | `agents_safe` | security_invoker=on + get_active_tenant_id() + is_current_super_admin() + auth.uid() - retorna 0 linhas para anon |
| HMAC Secret References Publicly Accessible | `hmac_agent_secrets` | security_invoker=on + is_current_super_admin() - APENAS super_admin ve dados |
| Active Agent Status Information | `active_agents` | security_invoker=on + get_active_tenant_id() + is_current_super_admin() - retorna 0 linhas para anon |

**Acao**: Marcar todos como "Ignorado" com explicacao tecnica padrao.

### WARNINGS (4)

| Issue | Acao | Razao |
|-------|------|-------|
| Software Release Information Exposed | IGNORAR | security_invoker=on + auth.uid() - apenas usuarios autenticados veem releases |
| RLS Policy Always True | JA IGNORADO | N/A |
| Function Search Path Mutable | JA IGNORADO | N/A |
| High severity vulnerabilities in xlsx | REMOVER DEPENDENCIA | Projeto usa exceljs, nao xlsx |

### INFOS (3) - Sem acao necessaria

Issues informativas nao requerem acao.

---

## Implementacao

### 1. Ignorar Falsos Positivos via Security Scanner API

Usar a ferramenta `security--manage_security_finding` para marcar cada issue como ignorada com a explicacao tecnica apropriada.

### 2. Remover Dependencia Vulneravel (xlsx)

A dependencia `xlsx` esta no package.json mas o projeto usa `exceljs` para exportacao Excel. A dependencia pode ser removida.

**Arquivo**: `package.json` linha 104

```text
Remover: "xlsx": "^0.18.5"
```

O codigo em `src/pages/DataExport.tsx` usa `exceljs` (linha 14), nao `xlsx`.

---

## Explicacao Padrao para Falsos Positivos

```text
FALSO POSITIVO - Auditado e verificado em 2026-01-30.

Esta view possui protecao em multiplas camadas:
1. security_invoker=on: Faz com que a query herde as permissoes do chamador
2. Filtro get_active_tenant_id(): Isola dados por tenant
3. Fallback is_current_super_admin(): Permite acesso administrativo

Teste de validacao executado: SELECT COUNT(*) retorna 0 para usuarios nao autenticados.
Ver: docs/architecture/ADR-023-rls-hardening.md e memory/security/false-positive-public-view-exposure-audit
```

---

## Resumo de Entregaveis

| Prioridade | Acao | Tipo |
|------------|------|------|
| P1 | Ignorar 7 erros como falsos positivos | Security API |
| P1 | Ignorar 1 warning (agent_releases_public) como falso positivo | Security API |
| P2 | Remover xlsx do package.json | Edicao de arquivo |

---

## Secao Tecnica

### Por que o Scanner Reporta Falsos Positivos?

O scanner de seguranca verifica se views publicas existem e se tem grants para `anon` ou `public`. Porem, ele nao consegue avaliar:

1. **security_invoker=on**: Esta opcao de view faz com que a query seja executada com as permissoes do usuario que a chamou, nao do owner da view. Isso significa que mesmo que a view exista, um usuario anon nao consegue ver dados porque o RLS da tabela base bloqueia o acesso.

2. **Funcoes de filtro**: As funcoes `get_active_tenant_id()` e `is_current_super_admin()` retornam NULL ou FALSE para usuarios nao autenticados, fazendo com que a clausula WHERE filtre todos os registros.

### Validacao Automatizada

O projeto possui testes CI que validam estas protecoes:
- `tools/tests/assert_views_have_auth.sql` - Verifica que views tem checks de auth
- `tools/tests/assert_agents_public_no_secrets.sql` - Verifica que views nao expoe secrets
- `tools/tests/assert_rls_hardening.sql` - Verifica hardening de RLS
