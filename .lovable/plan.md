# Plano: Registrar e Deployar Novas Versões dos Agentes

## ✅ Fase 1: Linux/macOS v4.4.0 - CONCLUÍDO ✅

- `agent_versions` atualizada: Linux e macOS agora mostram v4.4.0 como `is_latest`
- Scripts públicos atualizados com comentários corretos (v4.4.0)
- Correções incluídas: SHUTDOWN hard block, update lock (flock), observabilidade

## ✅ Fase 2: Windows v4.4.0 - EM PROGRESSO

| Arquivo | Versão | Status |
|---------|--------|--------|
| `public/agent-scripts/cybershield-agent-windows-v4.ps1` | v4.4.0 | **Pronto (5852 linhas)** |
| `agent_versions` | v4.4.0 | ✅ Registrado |
| `agent_releases` | pending | ⏳ Aguardando sync do script content |

### Correções no Windows v4.4.0:
1. **SHUTDOWN Hard Block** - Estado terminal sem saídas
2. **FailurePolicy** - Hard stop após 10 falhas consecutivas
3. **Write-LogDedup** - Evita logs duplicados
4. **Write-HealthSnapshot** - 1 snapshot por ciclo
5. **Write-IncidentSummary** - Resumo de incidente ao entrar em SAFE_MODE
6. **Test-StateInvariants** - Bloqueia ENFORCING com componentes falhados
7. **CorrelationId** - Rastreabilidade forense

## 🔄 Fase 3: Force Update (15 agentes Windows) - PENDENTE

Agentes a atualizar:
- 14 agentes em v4.2.2
- 1 agente em v4.1.9

```sql
UPDATE agents 
SET 
  force_update_version = 'v4.4.0',
  force_update_reason = 'FSM Enterprise v2.0 - Correções críticas de estabilidade',
  force_update_at = NOW()
WHERE 
  status = 'active' 
  AND os_type = 'windows'
  AND agent_version != 'v4.4.0'
  AND last_heartbeat > NOW() - INTERVAL '10 minutes';
```

## Próximo Passo

1. **Sincronizar script Windows** - Executar `node scripts/sync-all-agents.js --windows` localmente
2. **Registrar release via UI** - Usar /admin/agent-releases para registrar com script completo
3. **Executar force update** - Disparar SQL acima para forçar atualização

## Resultado Atual

| Plataforma | Versão Latest | Agentes Ativos | Status |
|------------|---------------|----------------|--------|
| Windows | v4.2.2 → v4.4.0 | 15 | ⏳ Aguardando sync |
| Linux | v4.4.0 ✅ | 0 | ✅ Pronto |
| macOS | v4.4.0 ✅ | 0 | ✅ Pronto |
