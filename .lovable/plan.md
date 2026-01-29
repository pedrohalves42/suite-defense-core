# Plano: Registrar e Deployar Novas Versões dos Agentes

## ✅ Fase 1: Linux/macOS v4.4.0 - CONCLUÍDO

- `agent_versions` atualizada: Linux e macOS agora mostram v4.4.0 como `is_latest`
- Scripts públicos atualizados com comentários corretos (v4.4.0)
- Correções incluídas: SHUTDOWN hard block, update lock (flock), observabilidade

## 🔴 DESCOBERTA: Windows v4.4.0 também disponível!

| Arquivo | Versão | Status |
|---------|--------|--------|
| `public/agent-scripts/cybershield-agent-windows-v4.ps1` | v4.4.0 | **NÃO REGISTRADO** |
| Banco `agent_releases` | v4.2.2 | Atualmente ativo |
| 14 agentes Windows | v4.2.2 | Em produção |

### Correções no Windows v4.4.0 (não deployadas):
1. **SHUTDOWN Hard Block** - Estado terminal sem saídas
2. **FailurePolicy** - Hard stop após 10 falhas consecutivas
3. **Write-LogDedup** - Evita logs duplicados
4. **Write-HealthSnapshot** - 1 snapshot por ciclo
5. **Write-IncidentSummary** - Resumo de incidente ao entrar em SAFE_MODE
6. **Test-StateInvariants** - Bloqueia ENFORCING com componentes falhados
7. **CorrelationId** - Rastreabilidade forense

## Próximos Passos (Aguardando Aprovação)

### Fase 2: Registrar Windows v4.4.0
1. Registrar `cybershield-agent-windows-v4.ps1` em `agent_releases`
2. Atualizar `agent_versions` para is_latest = true

### Fase 3: Force Update (14 agentes)
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

## Resultado Atual

| Plataforma | Versão Latest | Agentes Ativos | Status |
|------------|---------------|----------------|--------|
| Windows | v4.2.2 → v4.4.0 pendente | 14 | ⏳ Aguardando |
| Linux | v4.4.0 ✅ | 0 | ✅ Pronto |
| macOS | v4.4.0 ✅ | 0 | ✅ Pronto |
