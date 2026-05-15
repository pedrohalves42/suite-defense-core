# Backlog de Remediação Arquitetural - CyberShield

Este documento lista as ações necessárias para sanar as vulnerabilidades e inconsistências identificadas pela auditoria baseline e ciclo 2 do Dr. Viktor Hale.

## Prioridade P0 - Crítico (Correção Imediata)

### 1. Hardening de Segurança de Banco de Dados
- **Ação**: Atualizar todas as funções `SECURITY DEFINER` para incluir `SET search_path = public`.
- **Finding Relacionado**: [F-001](./findings/F-001-security-definer-search-path.md)

### 2. Isolamento de Buckets de Storage
- **Ação**: Reimplementar RLS em `storage.objects` para validar propriedade baseada no `tenant_id` (via folder prefix ou metadata). Revogar acesso `authenticated` global.
- **Finding Relacionado**: [F-004](./findings/F-004-storage-tenant-leak.md)

## Prioridade P1 - Alto (Segurança e Integridade)

### 3. Centralização e Enrijecimento de Validações Zod
- **Ação**: Mover schemas para `_shared`, remover `.passthrough()` dos routers e implementar validação estrita.
- **Finding Relacionado**: [F-002](./findings/F-002-zod-passthrough-bypass.md)

### 4. Fechamento de Loophole de Jobs (Sunset Legado)
- **Ação**: Impedir que jobs críticos sejam finalizados via `ack-job`. Implementar triggers de integridade que exijam side-effects para conclusão.
- **Finding Relacionado**: [F-005](./findings/F-005-job-integrity-bypass.md)

### 5. Sincronização Atômica de Contexto Multi-Tenant
- **Ação**: Refatorar `useActiveTenant` para aguardar `refreshSession` e invalidar cache de forma atômica.

## Prioridade P2 - Médio (Melhoria de Arquitetura)

### 6. Isolamento de Canais Realtime
- **Ação**: Implementar prefixos de tenant em nomes de canais.
- **Finding Relacionado**: [F-003](./findings/F-003-realtime-filter-spoofing.md)

### 7. Auditoria de Handlers de API Externa
- **Ação**: Integrar `createAuditLog` em todos os handlers autenticados via API Key.
- **Finding Relacionado**: [F-006](./findings/F-006-missing-audit-external-api.md)

---
*Assinado: Dr. Viktor Hale, Auditor Sistêmico*
