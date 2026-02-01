
# Diagnóstico: Por que Agentes Estão Ficando Offline

## Resumo Executivo

Identifiquei **3 problemas distintos** causando agentes offline, com evidências empíricas concretas:

| Problema | Agentes Afetados | Status | Evidência |
|----------|------------------|--------|-----------|
| Poll-Jobs não executando | PC-Servidor-Planalto, MIT-SERVIDOR | CRÍTICO | 12 jobs `queued` sem `delivered_at` |
| Sem heartbeat há 24h+ | pcteste1, 14 outros | CRÍTICO | `last_heartbeat` de 30/Jan |
| FSM presa em estado inválido | Agentes v4.4.0 | PROVÁVEL | `Test-CanExecuteJob` bloqueando poll |

---

## Análise Detalhada

### Problema 1: PC-Servidor-Planalto e MIT-SERVIDOR

**Observação Empírica:**
- PC-Servidor-Planalto: Heartbeat ativo (há 0 min), mas 12+ jobs `queued` sem entrega
- MIT-SERVIDOR: Heartbeat há 5 minutos, também sem poll-jobs

**Evidência de HMAC funcionando:**
```text
PC-Servidor-Planalto: 16 signatures desde 13:27 (última às 13:40)
MIT-SERVIDOR: 2 signatures (última às 13:35)
```

**Causa Raiz Identificada:**
O agente v4.4.0 usa uma FSM (Finite State Machine) com a condição:
```powershell
# Linha 5595 do v4.ps1
if (Test-CanExecuteJob) {
    Poll-Jobs
}
```

`Test-CanExecuteJob` só retorna `true` se `$Global:AgentState.Current` estiver em `ENFORCING` ou `DEGRADED`. O problema é que:

1. O estado FSM é **volátil** (variável local que reinicia como `BOOTSTRAP`)
2. Durante bootstrap, o agente tenta `Send-Heartbeat`
3. Se algo falha (ex: constraint violation no evidence_logs), o estado fica em `SYNCING`
4. Heartbeat continua funcionando, mas poll-jobs **nunca é executado**

**Evidência de constraint violation:**
```text
postgres_logs: "new row for relation 'agent_evidence_logs' 
  violates check constraint 'agent_evidence_logs_event_type_check'"
```

O agente v4.4.0 envia event_types como `update_check`, `metrics_sent`, `force_update` que NÃO estão na constraint:
```sql
CHECK ((event_type = ANY (ARRAY[
  'state_change', 'job_execution', 'dns_block', 'policy_sync', 
  'auto_recovery', 'heartbeat', 'update_applied', 'error', 
  'policy_drift', 'security_event'
])))
```

**Tipos faltando:** `update_check`, `metrics_sent`, `force_update`, `security_warning`

### Problema 2: pcteste1 e 14 outros agentes

**Observação Empírica:**
- Último heartbeat: 31/Jan às 13:40 (24h+ atrás)
- 0 HMAC signatures (nunca validou HMAC corretamente)
- Usuário afirma que computador está ligado

**Possíveis Causas:**
1. Scheduled Task desabilitada/corrompida
2. Script travado em loop de erro
3. Problema de rede/firewall
4. Agente não reinstalado após atualização

---

## Plano de Correção

### Correção 1: Adicionar event_types faltantes na constraint (URGENTE)

**Arquivo:** Migration SQL

```sql
-- Atualizar constraint para aceitar novos event_types do agente v4.4.0
ALTER TABLE agent_evidence_logs 
DROP CONSTRAINT IF EXISTS agent_evidence_logs_event_type_check;

ALTER TABLE agent_evidence_logs 
ADD CONSTRAINT agent_evidence_logs_event_type_check 
CHECK ((event_type = ANY (ARRAY[
  'state_change'::text, 
  'job_execution'::text, 
  'dns_block'::text, 
  'policy_sync'::text, 
  'auto_recovery'::text, 
  'heartbeat'::text, 
  'update_applied'::text, 
  'update_check'::text,
  'error'::text, 
  'policy_drift'::text, 
  'security_event'::text,
  'security_warning'::text,
  'metrics_sent'::text,
  'force_update'::text
])));
```

### Correção 2: Forçar reinício dos agentes (IMEDIATO)

**Script PowerShell** (executar em cada computador afetado):

```powershell
# Diagnóstico e reinício do agente CyberShield
Write-Host "=== DIAGNÓSTICO CYBERSHIELD ===" -ForegroundColor Cyan

# 1. Verificar Scheduled Tasks
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | Format-Table TaskName, State, LastRunTime
} else {
    Write-Host "Nenhuma task CyberShield encontrada!" -ForegroundColor Red
}

# 2. Verificar log recente
$logPath = "C:\CyberShield\logs\cybershield-agent-v4.log"
if (Test-Path $logPath) {
    Write-Host "`nÚltimas 20 linhas do log:" -ForegroundColor Yellow
    Get-Content $logPath -Tail 20
} else {
    Write-Host "Log não encontrado" -ForegroundColor Red
}

# 3. Reiniciar task
Write-Host "`nReiniciando agente..." -ForegroundColor Yellow
Get-ScheduledTask -TaskName "CyberShield*" | Stop-ScheduledTask -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Get-ScheduledTask -TaskName "CyberShield*" | Start-ScheduledTask
Write-Host "Reinício concluído!" -ForegroundColor Green
```

### Correção 3: Modificar FSM para ser mais resiliente

**Arquivo:** `public/agent-scripts/cybershield-agent-windows-v4.ps1`

Adicionar SYNCING como estado válido para poll-jobs temporariamente:

```powershell
# Linha 1439 - Adicionar SYNCING temporariamente
$Global:JobExecutionStates = @("ENFORCING", "DEGRADED", "SYNCING")
```

Ou melhor, fazer o bootstrap sempre transicionar para ENFORCING após heartbeat bem-sucedido, mesmo se evidence_logs falhar.

---

## Validações Pós-Correção

```sql
-- 1. Verificar se constraint foi atualizada
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'agent_evidence_logs_event_type_check';

-- 2. Verificar jobs sendo entregues
SELECT COUNT(*) FROM jobs 
WHERE delivered_at > NOW() - INTERVAL '30 minutes';
-- ESPERADO: > 0

-- 3. Verificar agentes online
SELECT agent_name, 
       EXTRACT(EPOCH FROM (NOW() - last_heartbeat))/60 as min_ago
FROM agents 
WHERE last_heartbeat > NOW() - INTERVAL '10 minutes';
-- ESPERADO: PC-Servidor-Planalto, MIT-SERVIDOR + outros
```

---

## Resumo de Ações

| Prioridade | Ação | Impacto |
|------------|------|---------|
| P0 | Atualizar constraint event_type | Permite evidence logs |
| P0 | Reiniciar tasks nos computadores | Força re-bootstrap |
| P1 | Adicionar SYNCING aos estados válidos | Permite poll durante sync |
| P2 | Implementar persistência de estado FSM | Previne recorrência |

