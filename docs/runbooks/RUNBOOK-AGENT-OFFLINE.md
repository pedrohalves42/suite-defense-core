# Runbook: Agente Offline / Heartbeat Ausente

**Severidade**: Alta
**Meta MTTR**: < 30 minutos
**Escalacao**: Apos 3x o intervalo de heartbeat sem resposta

---

## Sintomas

- Agente sem heartbeat ha mais de 3 minutos (3x o intervalo canonico de 60s)
- Status do agente como `offline` no dashboard
- Alerta `system_alerts.alert_type = 'agent_short_offline'` (severity medium)
- Escalacao para `alert_type = 'agent_long_offline'` (severity high) apos 48h
- Jobs pendentes acumulando para o agente

---

## Thresholds Canonicos (P0-02)

| Constante                       | Valor | Fonte                                                                                      |
|---------------------------------|-------|--------------------------------------------------------------------------------------------|
| `HEARTBEAT_INTERVAL_SECONDS`    | 60    | `supabase/functions/_shared/agent-lifecycle/heartbeat-thresholds.ts`                       |
| `OFFLINE_THRESHOLD_SECONDS`     | 180   | `auto_mark_agents_inactive()` (cron `auto-mark-inactive-1m`)                               |
| `ALERT_SHORT_THRESHOLD_SECONDS` | 180   | `alert_short_offline_agents()` (cron `alert-short-offline-1m`, severity medium)            |
| `ALERT_LONG_THRESHOLD_HOURS`    | 48    | `alert_long_offline_agents()` (severity high, escalacao)                                   |

Regra: `alert_short_threshold = 3 * heartbeat_interval`. Qualquer divergencia entre codigo e este runbook deve ser tratada como defeito.

---

## Diagnostico Rapido

### 1. Verificar Status do Agente

```sql
SELECT id, hostname, status, last_heartbeat_at,
       NOW() - last_heartbeat_at AS tempo_offline,
       agent_version, os_type
FROM agents
WHERE id = '<agent_id>'
  AND tenant_id = '<tenant_id>';
```

### 2. Verificar Ultimos Heartbeats

```sql
SELECT created_at, ip_address, cpu_usage, memory_usage, status
FROM agent_telemetry
WHERE agent_id = '<agent_id>'
ORDER BY created_at DESC
LIMIT 10;
```

### 3. Verificar Jobs Pendentes

```sql
SELECT id, job_type, status, created_at
FROM jobs
WHERE agent_id = '<agent_id>'
  AND status IN ('pending', 'queued', 'in_progress')
ORDER BY created_at DESC;
```

---

## Causas Comuns

| Causa | Frequencia | Verificacao |
|-------|-----------|-------------|
| Maquina desligada/reiniciando | Alta | Verificar ultimo evento de heartbeat |
| Rede bloqueada/proxy | Alta | Verificar IP de saida, regras de firewall |
| Servico do agente parado | Media | Verificar status do servico no endpoint |
| Agente em update | Media | Verificar `agent_builds` e logs de update |
| Certificado SSL expirado | Baixa | Verificar `agent_certificates` |
| DNS nao resolvendo | Baixa | Verificar configuracao de rede |
| Agente corrompido | Baixa | Verificar integridade via hash |

---

## Procedimento de Resolucao

### Nivel 1 — Verificacao Remota

1. **Verificar se o agente esta em processo de update**
   ```sql
   SELECT * FROM agent_builds
   WHERE agent_id = '<agent_id>'
   ORDER BY created_at DESC LIMIT 1;
   ```

2. **Verificar se ha job de diagnostico disponivel**
   - Enviar job `diagnose-agent` se o agente voltar
   - Verificar fila de jobs pendentes

3. **Verificar padrao**: se multiplos agentes do mesmo tenant estao offline simultaneamente, indica problema de rede/infra do cliente

### Nivel 2 — Intervencao

1. **Se agente unico offline**:
   - Contatar administrador do tenant
   - Fornecer script de diagnostico local
   - Verificar status do servico: `Get-Service CyberShieldAgent` (Windows) ou `systemctl status cybershield-agent` (Linux)

2. **Se multiplos agentes offline**:
   - Verificar saude da Edge Function `heartbeat`
   - Verificar rate limits
   - Verificar status do banco de dados
   - Escalar para L2

### Nivel 3 — Recuperacao

1. **Reinstalacao remota** (se agente intermitente):
   ```sql
   INSERT INTO jobs (agent_id, tenant_id, job_type, payload, status)
   VALUES ('<agent_id>', '<tenant_id>', 'reinstall', '{}', 'pending');
   ```

2. **Arquivamento** (se agente permanentemente offline >30 dias):
   - Avaliar com admin do tenant
   - Executar processo de arquivamento

---

## Metricas de Acompanhamento

| Metrica | SLO | SLA |
|---------|-----|-----|
| Heartbeat Success Rate | >99.5% | >99% |
| Tempo medio de deteccao offline | <2 min | <5 min |
| Tempo medio de notificacao | <30s | <2 min |
| MTTR agente offline | <30 min | <2h |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Ops | Versao inicial |
