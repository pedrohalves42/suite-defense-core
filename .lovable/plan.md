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

## ✅ FASE 3: script_content Registrado + Force Update - CONCLUÍDO

Force update `v4.4.0` disparado via `force_update_version` no banco.

Os agentes Windows online receberão o update no próximo heartbeat (máximo 60s).

## Resultado Final

| Plataforma | Versão Latest | agent_releases | Force Update | Status |
|------------|---------------|----------------|--------------|--------|
| Windows | v4.4.0 ✅ | ✅ Registrado | ✅ Disparado | 🟢 Completo |
| Linux | v4.4.0 ✅ | ✅ Registrado | N/A (0 agentes) | 🟢 Pronto |
| macOS | v4.4.0 ✅ | ✅ Registrado | N/A (0 agentes) | 🟢 Pronto |

## Monitoramento

Acompanhe a atualização em `/admin/computers` - a coluna `agent_version` deve mudar para `v4.4.0` conforme os agentes fazem heartbeat.
