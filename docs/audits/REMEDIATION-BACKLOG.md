# Backlog de Remediação Arquitetural - CyberShield

Este documento lista as ações necessárias para sanar as vulnerabilidades e inconsistências identificadas pela auditoria baseline do Dr. Viktor Hale.

## Prioridade P0 - Crítico (Correção Imediata)

### 1. Hardening de Segurança de Banco de Dados
- **Ação**: Atualizar todas as funções `SECURITY DEFINER` para incluir `SET search_path = public`.
- **Risco de Regressão**: Baixo.
- **Dono**: DB Admin / SecOps.
- **Finding Relacionado**: [F-001](./findings/F-001-security-definer-search-path.md)

### 2. Revogação de Acesso Público a Funções de RLS
- **Ação**: Garantir que funções como `get_active_tenant_id()` e `is_current_super_admin()` tenham `REVOKE EXECUTE ON FUNCTION ... FROM public, anon`.
- **Risco de Regressão**: Baixo (já mapeado em algumas migrations, mas inconsistente no ambiente atual).

## Prioridade P1 - Alto (Segurança e Integridade)

### 3. Centralização e Enrijecimento de Validações Zod
- **Ação**: Mover schemas para `_shared`, remover `.passthrough()` dos routers e implementar validação estrita em todos os pontos de entrada das Edge Functions.
- **Risco de Regressão**: Médio (pode quebrar agentes antigos enviando payloads incompletos).
- **Finding Relacionado**: [F-002](./findings/F-002-zod-passthrough-bypass.md)

### 4. Sincronização Atômica de Contexto Multi-Tenant
- **Ação**: Refatorar `useActiveTenant` para garantir que a mudança de estado no frontend aguarde a confirmação de atualização do JWT (`refreshSession`) e invalidar o cache de forma atômica para evitar o estado "split-brain".
- **Risco de Regressão**: Médio (impacta a percepção de performance na troca de tenant).

## Prioridade P2 - Médio (Melhoria de Arquitetura)

### 5. Isolamento de Canais Realtime
- **Ação**: Implementar prefixos de tenant em nomes de canais e validar permissões na assinatura.
- **Risco de Regressão**: Médio (requer atualização simultânea de todos os hooks de realtime).
- **Finding Relacionado**: [F-003](./findings/F-003-realtime-filter-spoofing.md)

### 6. Auditoria de Código Morto e Refatoração de Routers
- **Ação**: Eliminar redundância entre `api-gateway` e `ops-gateway`. Simplificar a arquitetura de roteamento para reduzir a superfície de ataque.
- **Risco de Regressão**: Alto (requer testes de integração completos).

---
*Assinado: Dr. Viktor Hale, Auditor Sistêmico*
