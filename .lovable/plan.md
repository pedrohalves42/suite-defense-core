

# Plano de Correcao

## Estado Atual (Diagnostico)

| Item | Status |
|------|--------|
| 12 alertas criticos | `acknowledged` mas **nao resolvidos** (`resolved=false`) |
| Release Windows Ed25519 | **JA ASSINADO** (signed_at: 2026-03-08 17:47) |
| Cron process-agent-updates | **JA SAUDAVEL** (last_success: 2026-03-08 17:46, status: healthy) |
| Non-ASCII em content.ts | **JA LIMPO** (31 linhas, apenas loader) |
| 2 maquinas que estavam online | SERVIDOR (offline ha ~6h) e DESKTOP-UOABRHB (offline ha ~22h) - possivelmente ficaram offline apos receber o force update |

## Acoes Necessarias

### 1. Resolver os 12 alertas criticos
Marcar todos como `resolved=true` com `resolved_at=now()` e `resolution_notes` indicando resolucao em massa. Os 12 IDs ja foram identificados.

### 2. Investigar agentes que ficaram offline apos force update
As 2 maquinas (SERVIDOR e DESKTOP-UOABRHB) receberam o force update mas cairam offline em seguida. Isso pode indicar que o script atualizado causou um crash ou loop de reinicializacao. Acoes:
- Resetar `force_update_at` para NULL nessas 2 maquinas para quebrar um possivel loop
- Resetar `force_update_delivered_count` e `force_update_delivery_count` para 0
- Isso permite que quando ligarem, o agente inicie normalmente sem tentar aplicar update repetidamente

### 3. Nenhuma acao necessaria para os demais itens
- Release ja assinado com Ed25519
- Cron ja esta saudavel
- Content.ts ja esta limpo

## Detalhes Tecnicos

**SQL para resolver alertas (via insert tool):**
```sql
UPDATE system_alerts 
SET resolved = true, 
    resolved_at = now(), 
    resolution_notes = 'Resolucao em massa: alertas de recursos (CPU/memoria) e cron stale resolvidos apos correcoes de infraestrutura'
WHERE resolved = false AND severity = 'critical';
```

**SQL para resetar force update nas 2 maquinas (via insert tool):**
```sql
UPDATE agents 
SET force_update_at = NULL, 
    force_update_delivered_count = 0, 
    force_update_delivery_count = 0
WHERE hostname IN ('SERVIDOR', 'DESKTOP-UOABRHB');
```

Isso quebra qualquer loop de update e permite que os agentes iniciem normalmente quando as maquinas forem ligadas.

