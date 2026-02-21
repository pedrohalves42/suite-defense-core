# 🔥 Plano de Remediação Zero-Gap — CyberShield v7+

**Status**: Em execução  
**Criado**: 2026-02-21  
**Objetivo**: Eliminar todas as falhas silenciosas, ciclos abertos e afirmações não provadas.

---

## FASE 1 — Correção Crítica (Imediato)

### 1.1 Guards de Tenant nas RPCs SECURITY DEFINER
- [ ] Auditar todas as RPCs `SECURITY DEFINER` que recebem IDs de recursos sem validar tenant
- [ ] Criar função helper `_assert_caller_tenant(p_tenant_id uuid)` que valida `get_active_tenant_id()` ou `is_current_super_admin()`
- [ ] Aplicar guard nas RPCs críticas: `can_hard_delete_agent`, `cleanup_problematic_agent`, `revoke_agent_signing_key`, `create_jobs_for_all_agents`, etc.
- [ ] Logar tentativas cross-tenant em `security_logs`

### 1.2 Imutabilidade do Audit Trail (V-002)
- [ ] Verificar se triggers `tr_prevent_audit_modification` existem em: `audit_logs`, `security_logs`, `agent_evidence_logs`, `poe_chain_breaks`
- [ ] Garantir que `domain_events` e `job_executions` também são imutáveis
- [ ] Revogar UPDATE/DELETE de `authenticated` e `anon` nessas tabelas

### 1.3 Corrigir 4 Crons Fantasma (V-004)
- [ ] `auto-approve-safe-ai-actions-daily` — Verificar se cron schedule existe em `cron.job`; criar se ausente
- [ ] `calculate-compliance-every-6h` — Idem
- [ ] `rollback-test-weekly` — Idem
- [ ] `seed-collection-jobs-every-3h` — Idem
- [ ] Para cada: verificar se Edge Function existe e está deployada
- [ ] Trigger manual de cada um para validar execução

### 1.4 Ativar SOAR Bridge (V-003)
- [ ] Verificar se `evaluate-automation-rules` chama `execute_soar_playbook` quando condições são atendidas
- [ ] Verificar se `process-heartbeat` envia eventos para o engine de automação
- [ ] Criar trigger de teste: inserir processo suspeito → validar que playbook executa
- [ ] Garantir que `soar_executions` recebe registros reais

### 1.5 Error Messages em Automações (V-010)
- [ ] Em `execute_automation_rule` RPC: garantir que `error_message` é populado em caso de falha
- [ ] Auditar `automation_executions` com `success = false AND error_message IS NULL`
- [ ] Corrigir para que toda falha tenha mensagem descritiva

---

## FASE 2 — Blindagem Estrutural

### 2.1 Substituir `.catch(() => {})` por Logging (V-009)
- [ ] `maintenance-cron/index.ts` — `.catch(() => {})` → `.catch(e => console.warn(...))`
- [ ] `security-cleanup-cron/index.ts` — idem
- [ ] Buscar todas as ocorrências em Edge Functions e corrigir

### 2.2 Adicionar FK `tenant_id → tenants` (V-012)
- [ ] Identificar tabelas com coluna `tenant_id` sem FK para `tenants`
- [ ] Criar migration adicionando FKs (com `ON DELETE RESTRICT`)
- [ ] Validar que não há dados órfãos antes de aplicar FK

### 2.3 Filtro de Tenant nas Views de AI Metrics (V-011)
- [ ] `v_ai_function_performance` — adicionar filtro tenant
- [ ] `v_ai_provider_comparison` — idem
- [ ] Aplicar `security_invoker = on` e `security_barrier = true`

### 2.4 Auditar `.single()` → `.maybeSingle()` (V-005)
- [ ] Buscar todos os usos de `.single()` em Edge Functions
- [ ] Migrar os perigosos para `.maybeSingle()` com tratamento de null

### 2.5 Documentar Views SECURITY DEFINER (V-006)
- [ ] Listar views que executam como owner
- [ ] Adicionar `COMMENT ON VIEW` ou aplicar `security_invoker = on`

---

## FASE 3 — Testes de Caos & Idempotência

### 3.1 Teste SOAR End-to-End
- [ ] Inserir processo suspeito → validar playbook executa
- [ ] Verificar registro em `soar_executions`

### 3.2 Teste de Idempotência dos Crons
- [ ] Chamar cada cron 2x → verificar que não duplica dados

### 3.3 Teste de Falha Parcial
- [ ] Simular timeout → verificar que `cron_health` registra falha

---

## FASE 4 — Monitoramento Preventivo

### 4.1 Alerta para Crons que Nunca Executaram
- [ ] Adicionar check no `cron-sentinel` para `last_success_at IS NULL`

### 4.2 Dashboard SOAR Executions
- [ ] Criar view `v_soar_execution_summary`
- [ ] Adicionar componente no dashboard de segurança

### 4.3 Validação Contínua de Invariantes
- [ ] Check periódico de INV-001, INV-002, INV-005

---

## Progresso

| Fase | Status | Itens | Completos |
|------|--------|-------|-----------|
| FASE 1 | 🔴 Pendente | 5 blocos | 0/5 |
| FASE 2 | 🔴 Pendente | 5 blocos | 0/5 |
| FASE 3 | 🔴 Pendente | 3 blocos | 0/3 |
| FASE 4 | 🔴 Pendente | 3 blocos | 0/3 |
