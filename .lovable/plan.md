
# Plano: Correção da Hash Chain de audit_logs

## Diagnóstico Confirmado
- **Causa raiz:** O trigger `calculate_audit_log_hash` usa `ORDER BY created_at DESC LIMIT 1` SEM tiebreaker por `id`. Quando registros compartilham o mesmo timestamp (ex: batch inserts), o trigger seleciona o registro "anterior" de forma não-determinística, quebrando a cadeia.
- **Evidência:** 32/184 registros quebrados no tenant principal, todos em timestamps duplicados.
- **Problema secundário:** A fórmula de hash do trigger (usa `state_before`, `state_after`) difere da fórmula do backfill (usa `user_id`, `success`), tornando re-ancoragem via backfill incompatível.

## Etapa 1: Migração — Corrigir trigger `calculate_audit_log_hash`
- Adicionar `id ASC` como tiebreaker no `ORDER BY created_at DESC, id DESC LIMIT 1`
- Unificar a fórmula de hash entre trigger e backfill para usar os mesmos campos
- Campos canônicos: `previous_hash + id + action + resource_type + resource_id + state_before + state_after + created_at`

## Etapa 2: Re-ancorar cadeia existente
- Usar a RPC `reanchor_audit_log_chain` (já existente) para corrigir os `previous_log_hash` de cada tenant
- Depois, executar um backfill que recalcula `integrity_hash` usando a fórmula canônica unificada
- Custo: operação única, sem impacto em runtime

## Etapa 3: Validação
- Query de verificação da cadeia para confirmar 0 broken links
- Sem custo recorrente — correção é estrutural

## Impacto
- **Custo:** Zero custo recorrente. Operação única de re-seed.
- **Performance:** Nenhuma degradação — o trigger continua O(1) por INSERT.
- **SOC 2:** Desbloqueia CC7.2 (Audit Trail) e PI1 (Processing Integrity).
