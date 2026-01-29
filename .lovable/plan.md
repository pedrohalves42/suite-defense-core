# Plano: Registrar e Deployar Novas Versões dos Agentes

## ✅ FASE 1: Registrar v4.4.0 - CONCLUÍDO

| Plataforma | `agent_versions` | `is_latest` |
|------------|------------------|-------------|
| Windows | v4.4.0 | ✅ true |
| Linux | v4.4.0 | ✅ true |
| macOS | v4.4.0 | ✅ true |

## ✅ FASE 2: Force Update Disparado - CONCLUÍDO

Force update `v4.4.0` disparado para todos os agentes Windows ativos em v4.2.2 e v4.1.9.

Correções incluídas na v4.4.0:
- **SHUTDOWN Hard Block** - Estado terminal com `exit 1`
- **FailurePolicy** - Hard stop após 10 falhas consecutivas  
- **Write-LogDedup** - Deduplicação de logs em 30s
- **Write-HealthSnapshot** - 1 snapshot por ciclo
- **Test-StateInvariants** - Bloqueia ENFORCING com componentes falhados
- **flock update lock** (Linux/macOS) - Evita race conditions

## 🔴 FASE 3: Sincronizar script_content - BLOQUEIO

**CRÍTICO:** `agent_releases` não tem v4.4.0 registrado com `script_content`.

Os 14 agentes têm `force_update_version = v4.4.0` mas **não receberão** o update no heartbeat até que o script seja registrado.

**Para completar, acesse:**
→ `/admin/agent-releases` e registre Windows v4.4.0 com o script de `public/agent-scripts/cybershield-agent-windows-v4.ps1`

Ou execute localmente:
```bash
node scripts/sync-all-agents.js --windows
```

## Resultado Atual

| Plataforma | Versão Latest | Agentes Ativos | Status |
|------------|---------------|----------------|--------|
| Windows | v4.4.0 ✅ | 15 | ⏳ Aguardando script_content |
| Linux | v4.4.0 ✅ | 0 | ✅ Pronto para deploy |
| macOS | v4.4.0 ✅ | 0 | ✅ Pronto para deploy |
