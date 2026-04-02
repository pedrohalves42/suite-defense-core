# Runbook: Diagnóstico e Resolução de Falhas de Agente

> **Versão:** 1.0 | **Última atualização:** 2026-04-02 | **Autor:** Equipe CyberShield

---

## Índice

1. [Objetivo](#objetivo)
2. [Pré-requisitos](#pré-requisitos)
3. [Identificação de Agente Offline](#identificação)
4. [Causas Comuns](#causas-comuns)
5. [Passo a Passo: Diagnóstico](#diagnóstico)
6. [Reativação de Agente](#reativação)
7. [Quarentena e Reabilitação](#quarentena)
8. [Troubleshooting](#troubleshooting)

---

## Objetivo

Guiar a equipe de operações no diagnóstico e resolução de falhas de agentes CyberShield, desde a identificação do problema até a reativação completa.

## Pré-requisitos

- Acesso ao banco de dados (leitura em `agents`, `agent_evidence_logs`)
- Acesso ao dashboard CyberShield
- Acesso SSH/RDP ao endpoint do agente (quando necessário)
- Conhecimento dos runbooks do Agente Windows e Linux/macOS

## Identificação de Agente Offline {#identificação}

### Via consulta SQL

```sql
-- Agentes offline (sem heartbeat > 15 minutos)
SELECT 
  a.id,
  a.hostname,
  a.os_type,
  a.agent_version,
  a.last_seen_at,
  a.status,
  now() - a.last_seen_at AS tempo_offline
FROM agents a
WHERE a.tenant_id = 'SEU_TENANT_ID'
  AND a.status = 'active'
  AND a.last_seen_at < now() - interval '15 minutes'
ORDER BY a.last_seen_at ASC;
```

### Agentes offline por mais de 2 horas (bloqueio de jobs)

```sql
-- Estes agentes NÃO receberão novos jobs (ADR-042)
SELECT 
  a.id,
  a.hostname,
  now() - a.last_seen_at AS tempo_offline
FROM agents a
WHERE a.tenant_id = 'SEU_TENANT_ID'
  AND a.last_seen_at < now() - interval '2 hours'
  AND a.status = 'active';
```

### Via view `v_problematic_agents`

```sql
SELECT * FROM v_problematic_agents
WHERE tenant_id = 'SEU_TENANT_ID';
```

## Causas Comuns

| Causa | Frequência | Indicadores |
|-------|------------|-------------|
| **Rede/Firewall** | Alta | Último heartbeat abrupto, sem logs de erro |
| **Serviço parado** | Alta | Serviço com status "Stopped" |
| **Token expirado** | Média | Erros 401/403 nos logs do agente |
| **Atualização falha** | Média | Versão antiga, erros em `update.log` |
| **Clock desincronizado** | Baixa | Erros de HMAC, nonce rejeitado |
| **Certificado inválido** | Baixa | Erros SSL/TLS nos logs |
| **Endpoint em quarentena** | Baixa | Status `quarantined` no banco |
| **Conflito de versão** | Rara | Jobs falhando com erro de compatibilidade |

## Passo a Passo: Diagnóstico {#diagnóstico}

### 1. Verificar status no banco de dados

```sql
SELECT 
  id, hostname, os_type, status, agent_version,
  last_seen_at, ip_address, 
  now() - last_seen_at AS offline_ha
FROM agents
WHERE id = 'ID_DO_AGENTE';
```

### 2. Verificar logs de evidência

```sql
SELECT 
  event_type, severity, event_data, created_at
FROM agent_evidence_logs
WHERE agent_id = 'ID_DO_AGENTE'
ORDER BY created_at DESC
LIMIT 20;
```

### 3. Conectar ao endpoint e verificar serviço

**Windows:**
```powershell
Get-Service -Name "CyberShieldAgent"
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Tail 30
Test-NetConnection -ComputerName "backend.supabase.co" -Port 443
```

**Linux:**
```bash
sudo systemctl status cybershield-agent
tail -30 /var/log/cybershield/agent.log
curl -sS -o /dev/null -w "%{http_code}\n" https://backend.supabase.co/functions/v1/health
```

**macOS:**
```bash
sudo launchctl list | grep cybershield
tail -30 /var/log/cybershield/agent.log
curl -sS -o /dev/null -w "%{http_code}\n" https://backend.supabase.co/functions/v1/health
```

### 4. Verificar firewall

**Windows:**
```powershell
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*CyberShield*" }
Test-NetConnection -ComputerName "backend.supabase.co" -Port 443
```

**Linux:**
```bash
sudo iptables -L -n | grep -i 443
sudo ss -tlnp | grep cybershield
```

### 5. Verificar sincronização de hora

**Windows:**
```powershell
w32tm /query /status
```

**Linux/macOS:**
```bash
timedatectl status  # Linux
sntp -d time.apple.com  # macOS
```

### 6. Verificação de Sucesso

Após resolver, confirme:

```sql
-- Agente deve ter heartbeat recente
SELECT hostname, last_seen_at, status
FROM agents 
WHERE id = 'ID_DO_AGENTE';
-- last_seen_at deve ser < 5 minutos atrás
```

## Reativação de Agente

### Reiniciar serviço

```bash
# Linux
sudo systemctl restart cybershield-agent

# macOS
sudo launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist
```

```powershell
# Windows
Restart-Service -Name "CyberShieldAgent"
```

### Forçar atualização via API

```bash
curl -X POST "https://backend/functions/v1/force-update" \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "ID_DO_AGENTE"}'
```

### Substituir token expirado

Consulte os runbooks específicos:
- **Windows:** [RUNBOOK-AGENTE-WINDOWS.md](./RUNBOOK-AGENTE-WINDOWS.md#substituir-token-expirado)
- **Linux/macOS:** [RUNBOOK-AGENTE-LINUX-MACOS.md](./RUNBOOK-AGENTE-LINUX-MACOS.md)

## Quarentena e Reabilitação

### Verificar agentes em quarentena

```sql
SELECT 
  a.id, a.hostname, a.status,
  q.reason, q.quarantined_at, q.quarantined_by
FROM agents a
JOIN agent_quarantine q ON q.agent_id = a.id
WHERE a.tenant_id = 'SEU_TENANT_ID'
  AND a.status = 'quarantined';
```

### Reabilitar agente da quarentena

> ⚠️ **Requer privilégios administrativos e justificativa documentada**

```sql
-- Via API administrativa (recomendado)
-- POST /functions/v1/admin/unquarantine-agent
-- Body: { "agent_id": "ID", "reason": "Investigação concluída, falso positivo" }
```

### Causas de quarentena

| Motivo | Descrição | Ação |
|--------|-----------|------|
| Anomalia comportamental | Desvio do baseline comportamental | Investigar `agent_behavioral_baseline` |
| Integridade comprometida | Hash de arquivo alterado | Verificar `agent_file_integrity` |
| Vulnerabilidade crítica | CVE crítica não corrigida | Aplicar patch antes de reabilitar |
| Atividade suspeita | Padrão de rede anômalo | Análise forense |

## Troubleshooting

| Sintoma | Causa | Ação |
|---------|-------|------|
| Agente online mas sem dados | Telemetria falhando | Verificar logs de coleta |
| Heartbeat OK mas jobs falham | Despachante com erro | Verificar whitelist de comandos |
| Agente reconecta e desconecta | Instabilidade de rede | Verificar latência e packet loss |
| Múltiplos agentes para mesmo host | Re-enrollment sem cleanup | Arquivar agente duplicado |
| Agente não aparece após instalar | Enrollment falhou | Verificar `enrollment.json/.conf` |

---

**Referências:**
- `v_problematic_agents` — View de agentes problemáticos
- `agent_evidence_logs` — Logs de evidência
- `agent_behavioral_baseline` — Baselines comportamentais
- ADR-042 — Bloqueio de jobs para agentes offline >2h
