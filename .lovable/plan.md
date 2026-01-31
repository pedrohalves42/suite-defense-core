
# 🔬 Dr. Isaac K. Vellum — Relatório de Auditoria de Segurança CyberShield

**Data**: 2026-01-31  
**Modo**: DETALHADO  
**Escopo**: Análise completa de todas as camadas (DB, Backend, Frontend)

---

## ⚠️ Sumário Executivo

A auditoria identificou **2 vulnerabilidades CRITICAL**, **3 HIGH**, **2 MEDIUM** e **1 LOW**. O sistema possui uma arquitetura de segurança robusta com RLS bem implementado nas tabelas base, porém **algumas views agregadas expõem dados cross-tenant** sem filtro adequado.

---

## V-601: Views Agregadas Expõem Dados Cross-Tenant

| Campo | Valor |
|-------|-------|
| **Tipo** | Silencioso / Segurança |
| **Severidade** | **CRITICAL** |
| **Local** | Views: `v_dlq_risk_overview`, `v_pipeline_health_metrics`, `v_cron_silence` |
| **Cenário** | Usuário autenticado consulta view agregada e vê métricas de TODOS os tenants |
| **Impacto** | Vazamento de métricas operacionais cross-tenant (total_items, success_rate por tenant) |
| **Detectável** | Sim — `SELECT * FROM v_dlq_risk_overview` retorna 2 tenant_ids distintos |
| **Prova** | Query executada retornou: tenant `3adc67e6...` com 976 items E tenant `2584d2cd...` com 1321 items |
| **Correção** | Recriar views com `security_invoker=on` E filtro `WHERE tenant_id = get_active_tenant_id() OR is_current_super_admin()` |
| **Validação** | Após correção: `SELECT COUNT(DISTINCT tenant_id) FROM v_dlq_risk_overview` deve retornar 1 |
| **Invariante Violada** | **INV-001** (Isolamento absoluto entre tenants) |

**SQL de Correção (P0)**:
```sql
CREATE OR REPLACE VIEW v_dlq_risk_overview 
WITH (security_invoker=on) AS
SELECT tenant_id,
    count(*) AS total_items,
    count(*) FILTER (WHERE status = 'resolved') AS resolved_items,
    count(*) FILTER (WHERE resolved_by IS NOT NULL) AS manually_reviewed,
    count(*) FILTER (WHERE flagged_suspicious) AS suspicious_items,
    count(*) FILTER (WHERE created_at < (now() - '24:00:00'::interval) AND status <> 'resolved') AS overdue_items,
    round(CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / count(*)::numeric) * 100 ELSE 0 END, 2) AS review_rate_pct
FROM failed_jobs_dlq
WHERE created_at > (now() - '30 days'::interval)
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;
```

---

## V-602: 11 Views Sem Filtro de Tenant

| Campo | Valor |
|-------|-------|
| **Tipo** | Segurança / Consistência |
| **Severidade** | **CRITICAL** |
| **Local** | `v_active_risk_debt`, `v_agent_archive_reason_tree`, `v_anomalies_without_runbook`, `v_cron_silence`, `v_dlq_risk_overview`, `v_incident_groups_with_slo`, `v_pipeline_health_metrics`, `v_risk_debt_active`, `v_risk_debt_summary`, `v_system_contracts`, `v_tenant_claim_health` |
| **Cenário** | Views foram criadas sem `security_invoker` e sem filtro `get_active_tenant_id()` |
| **Impacto** | Views retornam dados de todos os tenants quando consultadas |
| **Detectável** | Sim — Query no pg_views mostra `definition NOT LIKE '%get_active_tenant_id%'` |
| **Correção** | Recriar TODAS as 11 views com `security_invoker=on` e filtro de tenant obrigatório |
| **Validação** | Após correção, nenhuma view deve aparecer na query de validação de views sem filtro |
| **Invariante Violada** | **INV-001** |

---

## V-603: Função SECURITY DEFINER sem search_path

| Campo | Valor |
|-------|-------|
| **Tipo** | Segurança |
| **Severidade** | **HIGH** |
| **Local** | `public.create_dlq_decision_event` |
| **Cenário** | Função SECURITY DEFINER sem `SET search_path = 'public'` pode ser explorada via search_path injection |
| **Impacto** | Atacante pode criar objetos maliciosos em schema diferente e fazer a função executar código arbitrário |
| **Detectável** | Sim — Linter do Supabase reporta "Function Search Path Mutable" |
| **Correção** | Adicionar `SET search_path TO 'public'` na definição da função |
| **Validação** | `SELECT proconfig FROM pg_proc WHERE proname = 'create_dlq_decision_event'` deve incluir search_path |
| **Invariante Violada** | **INV-006** (Escalada de privilégio bloqueada) |

**SQL de Correção**:
```sql
CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'  -- ADICIONAR ESTA LINHA
AS $function$
-- resto do código permanece igual
$function$;
```

---

## V-604: 3 Políticas RLS com USING(true) ou WITH CHECK(true)

| Campo | Valor |
|-------|-------|
| **Tipo** | Segurança |
| **Severidade** | **HIGH** |
| **Local** | Tabelas: `agent_builds`, `agent_disk_metrics`, `agent_evidence_logs` (políticas service_role) |
| **Cenário** | Políticas com `USING(true)` para service_role permitem operações sem restrição |
| **Impacto** | Se service_role key for comprometida, atacante tem acesso total às tabelas |
| **Detectável** | Sim — Linter reporta "RLS Policy Always True" |
| **Correção** | Manter para service_role (intencional), mas documentar e monitorar |
| **Validação** | Confirmar que apenas service_role tem essas políticas, não authenticated/anon |
| **Invariante Violada** | Parcial — Risco aceito para operações de backend |

**Status**: ⚠️ RISCO ACEITO — Documentado em `docs/rls-policies-audit.md`

---

## V-605: Views Seguras Sem security_invoker Explícito

| Campo | Valor |
|-------|-------|
| **Tipo** | Consistência |
| **Severidade** | **HIGH** |
| **Local** | 48 views no schema public mostram `MISSING security_invoker` na query de validação |
| **Cenário** | Views como `agents_public`, `agents_safe`, `audit_logs_safe` NÃO têm `security_invoker` explícito no DDL visível |
| **Impacto** | Scanner de segurança reporta falsos positivos; risco de regressão se views forem recriadas |
| **Detectável** | Sim — pg_views.definition não contém "security_invoker" |
| **Correção** | Verificar se views estão usando `security_invoker=on` via `pg_views_info` ou recriar com flag explícito |
| **Validação** | Todas as views sensíveis devem ter `security_invoker=on` no DDL |
| **Invariante Violada** | **INV-001** (Potencial) |

**Nota**: A análise de runtime mostrou que estas views FUNCIONAM corretamente (retornam 0 rows para anon), porém o DDL não mostra explicitamente `security_invoker`. Isso pode indicar que foram criadas com o flag mas o PostgreSQL não exibe no definition. Recomendo recriar com flag explícito para eliminar ambiguidade.

---

## V-606: Fallback Inseguro em enroll-agent

| Campo | Valor |
|-------|-------|
| **Tipo** | Consistência |
| **Severidade** | **MEDIUM** |
| **Local** | `supabase/functions/enroll-agent/index.ts:291-313` |
| **Cenário** | Se RPC `revive_agent_on_reenroll` falhar, código faz UPDATE direto sem validação cross-tenant completa |
| **Impacto** | Em caso de falha de RPC, o fallback pode não ter todas as validações de segurança |
| **Detectável** | Sim — Código mostra fallback path com comentário "Fallback: update direto se RPC falhar" |
| **Correção** | Remover fallback ou adicionar mesma validação cross-tenant do RPC |
| **Validação** | Testar cenário onde RPC falha e verificar se cross-tenant é bloqueado |
| **Invariante Violada** | **INV-001** (Potencial em edge case) |

---

## V-607: Polling Confia em agent_name para Ownership

| Campo | Valor |
|-------|-------|
| **Tipo** | Consistência |
| **Severidade** | **MEDIUM** |
| **Local** | `supabase/functions/poll-jobs/index.ts:175` |
| **Cenário** | Update de heartbeat usa `.eq('agent_name', agent.agent_name)` em vez de `.eq('id', agent.id)` |
| **Impacto** | Se dois tenants tiverem agentes com mesmo nome (improvável mas possível), pode haver conflito |
| **Detectável** | Sim — Código usa agent_name em vez de id para update |
| **Correção** | Usar `.eq('id', token.agent_id)` para update de heartbeat |
| **Validação** | Verificar que update afeta apenas o agente correto |
| **Invariante Violada** | **INV-001** (Edge case) |

---

## V-608: DLQ Cleanup Sem Audit Trail

| Campo | Valor |
|-------|-------|
| **Tipo** | Auditoria |
| **Severidade** | **LOW** |
| **Local** | Operações manuais de UPDATE em `failed_jobs_dlq` |
| **Cenário** | Limpeza de DLQ via SQL direto pode não gerar decision_events se trigger tiver bugs |
| **Impacto** | Trilha de auditoria incompleta para operações de limpeza |
| **Detectável** | Parcial — Verificar se decision_events são criados após cleanup |
| **Correção** | Garantir que trigger `create_dlq_decision_event` funciona corretamente |
| **Validação** | Após UPDATE em DLQ, verificar que decision_events foi criado |
| **Invariante Violada** | **INV-005** (Auditoria imutável) |

---

## 📊 Matriz de Achados

| Severidade | Qtde | IDs |
|------------|------|-----|
| **CRITICAL** | 2 | V-601, V-602 |
| **HIGH** | 3 | V-603, V-604, V-605 |
| **MEDIUM** | 2 | V-606, V-607 |
| **LOW** | 1 | V-608 |

---

## 🔥 Top 5 Riscos Reais (Ordenados por Impacto)

1. **V-601/V-602: Views agregadas expõem métricas de TODOS os tenants** — Violação direta de INV-001. Qualquer usuário autenticado pode ver volume de DLQ, success rates e outros KPIs operacionais de tenants concorrentes.

2. **V-603: Função SECURITY DEFINER vulnerável a search_path injection** — Atacante com acesso ao banco pode escalar privilégios via criação de objetos maliciosos.

3. **V-605: Ambiguidade em security_invoker de 48 views** — Risco de regressão se views forem recriadas sem o flag; scanners reportam falsos positivos gerando ruído.

4. **V-606: Fallback em enroll-agent pode bypassar validação** — Edge case onde RPC falha pode permitir operações sem validação completa.

5. **V-607: Identificação por agent_name pode causar conflitos** — Dois tenants com mesmo agent_name podem ter comportamento inesperado.

---

## ✅ Pontos Positivos Identificados

1. **RLS nas Tabelas Base**: Todas as 14 tabelas críticas (`agents`, `jobs`, `audit_logs`, etc.) têm RLS habilitado com políticas de tenant adequadas.

2. **HMAC Obrigatório**: Todas as Edge Functions críticas (`poll-jobs`, `submit-job-result`, `agent-heartbeat`) validam HMAC obrigatoriamente.

3. **Guards de Loading**: 24+ hooks React usam `enabled: !loading && !!tenant?.id` para prevenir race conditions.

4. **Cross-Tenant Validation**: `submit-job-result` valida `job.tenant_id !== agent.tenant_id` com logging de segurança.

5. **Token Hashing**: Tokens de agente são armazenados como hash, não plaintext.

6. **Funções SECURITY DEFINER com tenant check**: `apply_agent_isolation`, `archive_agent`, etc. validam `get_active_tenant_id()`.

---

## 🟢 Status do Sistema

| Status | Descrição |
|--------|-----------|
| 🟡 **PARCIALMENTE SEGURO** | Correções CRITICAL (V-601, V-602) e HIGH (V-603) necessárias antes de produção enterprise |

---

## 📋 Plano de Remediação Priorizado

### P0 - CRÍTICO (Executar Imediatamente)

1. **Recriar views agregadas com tenant filter**:
   - `v_dlq_risk_overview`
   - `v_pipeline_health_metrics`
   - `v_cron_silence`
   - `v_active_risk_debt`
   - `v_agent_archive_reason_tree`
   - `v_anomalies_without_runbook`
   - `v_incident_groups_with_slo`
   - `v_risk_debt_active`
   - `v_risk_debt_summary`
   - `v_system_contracts`
   - `v_tenant_claim_health`

2. **Adicionar search_path à função `create_dlq_decision_event`**

### P1 - ALTO (Próxima Sprint)

1. Verificar e documentar status de security_invoker em todas as 48 views
2. Remover fallback inseguro em enroll-agent ou adicionar validação
3. Corrigir poll-jobs para usar agent.id em vez de agent_name

### P2 - MÉDIO (Backlog)

1. Adicionar testes automatizados para validar isolamento de views
2. Criar CI gate para detectar views sem tenant filter

---

## 🔬 Metodologia de Validação

Após implementação das correções, executar:

```sql
-- Teste V-601/V-602: Confirmar isolamento de views
SELECT viewname 
FROM pg_views 
WHERE schemaname = 'public'
  AND definition NOT LIKE '%get_active_tenant_id%'
  AND definition NOT LIKE '%is_current_super_admin%'
  AND viewname LIKE 'v_%';
-- Esperado: 0 rows

-- Teste V-603: Confirmar search_path
SELECT proname, proconfig 
FROM pg_proc 
WHERE proname = 'create_dlq_decision_event';
-- Esperado: proconfig contém 'search_path=public'
```

---

*Auditoria realizada por Dr. Isaac K. Vellum*  
*"Todo sistema já está quebrado. A auditoria serve para descobrir onde e como."*
