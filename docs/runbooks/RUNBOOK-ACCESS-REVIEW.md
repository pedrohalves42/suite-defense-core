# Runbook: Revisão Periódica de Acesso

| Campo | Valor |
|-------|-------|
| **Código** | RB-ACCREV-001 |
| **Versão** | 1.0 |
| **Controle SOC 2** | CC6.3 — Logical Access: Periodic Review |

---

## 1. Objetivo

Garantir que todos os acessos de usuários e seus papéis (roles) sejam revisados periodicamente, identificando contas inativas, papéis excessivos e acessos que devem ser revogados.

## 2. Frequência

**Trimestral** (mínimo) ou após incidentes de segurança.

## 3. Execução Automatizada

A revisão é executada via `ops-gateway` com a action `check:access-review`:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-gateway" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "X-Internal-Secret: $INTERNAL_FUNCTION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check:access-review",
    "payload": { "tenant_id": "<TENANT_ID>" }
  }'
```

### Resultado esperado:
- Relatório com lista de usuários, papéis e último login
- Registro automático em `audit_logs` com `action = 'access_review'`

## 4. Verificação de Evidência

```sql
SELECT id, created_at, details->>'total_users' AS total_users,
       details->>'active_users' AS active_users,
       details->>'inactive_users' AS inactive_users,
       details->'role_distribution' AS role_distribution
FROM audit_logs 
WHERE action = 'access_review' 
  AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC;
```

## 5. Ações Pós-Revisão

```
1. Verificar usuários inativos (sem login > 90 dias)
2. Validar se papéis atribuídos seguem o princípio do menor privilégio
3. Revogar acessos de usuários desligados
4. Documentar exceções aprovadas
5. Registrar decisões no sistema de auditoria
```

## 6. Checklist

- [ ] Revisão executada para todos os tenants ativos
- [ ] Contas inativas identificadas e tratadas
- [ ] Papéis excessivos revisados e ajustados
- [ ] Evidência registrada em `audit_logs`
- [ ] Relatório arquivado para auditoria SOC 2

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-04-06 | CyberShield Security | Versão inicial |
