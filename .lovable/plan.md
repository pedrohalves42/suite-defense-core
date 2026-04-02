
## Batch 3B — Sync Restante (12 funções → inline no ops-gateway) ✅ CONCLUÍDO

### Resultado Final
- ✅ 12 handlers inlinados no ops-gateway (sync-jobs.ts + sync-infra.ts)
- ✅ 8 frontend callers migrados para `callGateway()` (7 originais + SyncStorageBucket)
- ✅ 12 diretórios standalone deletados
- ✅ 12 edge functions removidas do deploy
- ✅ `npx tsc --noEmit` — zero errors
- ✅ Zero referências órfãs no frontend

### Impacto
- −12 edge functions (−12 cold starts × ~4.3s = ~51.6s de latência removida)
- `ACTION_TO_FUNCTION` sync section: vazia (todas inlined)
