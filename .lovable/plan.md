
# Plano: Evolução Enterprise do Agente Windows - FSM v2.0

## Resumo Executivo

Com base na análise detalhada fornecida e na exploração do código existente, o agente Windows v4.1.2 **já possui uma base sólida** de FSM com 6 estados, auto-recovery com backoff, rollback seguro e Safe Mode. Porém, há gaps críticos que impedem operação enterprise:

1. **Estados mentirosos**: ENFORCING mantido mesmo com DNS não funcional
2. **Loops infinitos**: 1289+ falhas consecutivas sem escalação
3. **Ruído excessivo**: Logs duplicados dificultam forensics
4. **Sem observabilidade**: Falta correlation_id e incident_summary

Este plano implementa as melhorias em **4 fases incrementais**, mantendo compatibilidade com o backend existente.

---

## Fase 1: Disciplina de Estados (FSM Formal)

### 1.1 Adicionar Estado SHUTDOWN

O estado SHUTDOWN está na especificação mas falta no código atual.

**Arquivo**: `scripts/cybershield-agent-windows-v4.1.2.ps1`

**Mudanças**:
```powershell
# Linha ~765 - Adicionar SHUTDOWN aos estados válidos
$Global:ValidStates = @("BOOTSTRAP", "SYNCING", "ENFORCING", "DEGRADED", "ERROR", "RECOVERY", "SHUTDOWN")

# Linha ~766-773 - Atualizar transições
$Global:StateTransitions = @{
    "BOOTSTRAP" = @("SYNCING", "ERROR")
    "SYNCING" = @("ENFORCING", "DEGRADED", "ERROR")
    "ENFORCING" = @("DEGRADED", "ERROR", "SYNCING")
    "DEGRADED" = @("RECOVERY", "ERROR", "ENFORCING", "SHUTDOWN")
    "RECOVERY" = @("ENFORCING", "DEGRADED", "ERROR", "SHUTDOWN")
    "ERROR" = @("RECOVERY", "SHUTDOWN")
    "SHUTDOWN" = @()  # Terminal - sem saídas
}
```

### 1.2 Função de Validação de Estado Rigorosa

Implementar invariantes que impedem ENFORCING se componentes críticos falharam.

**Nova função** (após linha ~856):
```powershell
function Test-StateInvariants {
    <#
    .SYNOPSIS
        Valida invariantes de estado - ENFORCING só é permitido se tudo OK
    #>
    param([string]$ProposedState)
    
    if ($ProposedState -eq "ENFORCING") {
        $violations = @()
        
        # DNS Filter obrigatório se habilitado
        if ($Global:DNSFilterConfig.Enabled) {
            $dnsStatus = Get-DNSFilterStatus
            if (-not $dnsStatus.running) {
                $violations += "dns_filter_not_running"
            }
        }
        
        # Health check recente obrigatório
        $lastHeartbeat = $Global:AgentState.LastHeartbeat
        if ($lastHeartbeat -and ((Get-Date) - $lastHeartbeat).TotalMinutes > 5) {
            $violations += "heartbeat_stale"
        }
        
        if ($violations.Count -gt 0) {
            Write-Log "[STATE INVARIANT] ENFORCING blocked: $($violations -join ', ')" "WARN"
            return @{ valid = $false; violations = $violations }
        }
    }
    
    return @{ valid = $true; violations = @() }
}
```

### 1.3 Atualizar Set-AgentState para Validar Invariantes

**Modificar função Set-AgentState** (linha ~778):
```powershell
function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("BOOTSTRAP", "SYNCING", "ENFORCING", "DEGRADED", "ERROR", "RECOVERY", "SHUTDOWN")]
        [string]$NewState,
        
        [Parameter(Mandatory = $true)]
        [string]$Reason,
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorDetails = $null,
        
        [Parameter(Mandatory = $false)]
        [string]$CorrelationId = $null
    )
    
    # Gerar correlation_id se não fornecido
    if (-not $CorrelationId) {
        $CorrelationId = [guid]::NewGuid().ToString().Substring(0, 8)
    }
    
    $currentState = $Global:AgentState.Current
    
    # NOVO: Validar invariantes antes de permitir transição
    $invariants = Test-StateInvariants -ProposedState $NewState
    if (-not $invariants.valid) {
        Write-Log "[STATE] INVARIANT VIOLATION: Cannot enter $NewState - $($invariants.violations -join ', ')" "WARN"
        
        # Forçar DEGRADED ao invés de ENFORCING inválido
        if ($NewState -eq "ENFORCING") {
            $NewState = "DEGRADED"
            $Reason = "Invariant violation: $($invariants.violations -join ', ')"
        }
    }
    
    # ... resto da função existente ...
}
```

---

## Fase 2: Regras Duras de Falha

### 2.1 Política de Falha Global

**Nova variável global** (após linha ~182):
```powershell
# Política de falha - configurável via policy.json
$Global:FailurePolicy = @{
    MaxRecoveryAttempts = 5          # Máximo de tentativas antes de SAFE_MODE
    RecoveryWindowSeconds = 300      # Janela para contar tentativas
    CooldownSeconds = 600            # Cooldown após exaurir tentativas
    MaxConsecutiveFailures = 10      # Máximo de falhas consecutivas por componente
    OnExhaust = "SAFE_MODE"          # Estado ao exaurir: SAFE_MODE ou ERROR
}

# Contadores por componente
$Global:FailureCounters = @{
    dns_filter = @{ consecutive = 0; last_failure = $null; cooldown_until = $null }
    heartbeat = @{ consecutive = 0; last_failure = $null; cooldown_until = $null }
    policy_sync = @{ consecutive = 0; last_failure = $null; cooldown_until = $null }
    job_engine = @{ consecutive = 0; last_failure = $null; cooldown_until = $null }
}
```

### 2.2 Função de Contagem de Falhas com Hard Stop

**Nova função** (após FailurePolicy):
```powershell
function Add-ComponentFailure {
    <#
    .SYNOPSIS
        Registra falha de componente com hard stop após limite
    #>
    param(
        [string]$Component,
        [string]$ErrorMessage,
        [string]$CorrelationId
    )
    
    if (-not $Global:FailureCounters.ContainsKey($Component)) {
        $Global:FailureCounters[$Component] = @{ consecutive = 0; last_failure = $null; cooldown_until = $null }
    }
    
    $counter = $Global:FailureCounters[$Component]
    
    # Verificar se está em cooldown
    if ($counter.cooldown_until -and (Get-Date) -lt $counter.cooldown_until) {
        Write-Log "[FAILURE] $Component in cooldown until $($counter.cooldown_until)" "DEBUG"
        return @{ action = "cooldown"; remaining_seconds = ((Get-Date) - $counter.cooldown_until).TotalSeconds }
    }
    
    $counter.consecutive++
    $counter.last_failure = Get-Date
    
    # Hard stop após MaxConsecutiveFailures
    if ($counter.consecutive -ge $Global:FailurePolicy.MaxConsecutiveFailures) {
        Write-Log "[CRITICAL] $Component exceeded max failures ($($counter.consecutive)) - HARD STOP" "ERROR"
        
        # Entrar em cooldown
        $counter.cooldown_until = (Get-Date).AddSeconds($Global:FailurePolicy.CooldownSeconds)
        
        # Log único de exaustão (não múltiplos)
        Add-EvidenceEntry -Type "recovery_exhausted" -Data @{
            component = $Component
            consecutive_failures = $counter.consecutive
            action = $Global:FailurePolicy.OnExhaust
            cooldown_until = $counter.cooldown_until.ToString("o")
            correlation_id = $CorrelationId
        } -Severity "critical"
        
        # Transição para SAFE_MODE ou ERROR
        Set-AgentState -NewState $Global:FailurePolicy.OnExhaust `
            -Reason "Component $Component exhausted after $($counter.consecutive) failures" `
            -CorrelationId $CorrelationId
        
        return @{ action = "exhausted"; state = $Global:FailurePolicy.OnExhaust }
    }
    
    return @{ action = "retry"; attempt = $counter.consecutive }
}

function Reset-ComponentFailure {
    param([string]$Component)
    
    if ($Global:FailureCounters.ContainsKey($Component)) {
        $Global:FailureCounters[$Component].consecutive = 0
        Write-Log "[FAILURE] $Component counter reset" "DEBUG"
    }
}
```

### 2.3 Atualizar Loop Principal com Hard Stop

**Modificar seção DNS Health Check** (linha ~3996-4010):
```powershell
# DNS Health Check a cada 2 minutos (COM HARD STOP)
if ($Global:DNSFilterConfig.Enabled -and (($now - $lastDNSHealthCheck).TotalSeconds) -ge 120) {
    $correlationId = "dns_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    $dnsHealth = Test-DNSFilterHealth
    
    if (-not $dnsHealth.healthy) {
        $failureResult = Add-ComponentFailure -Component "dns_filter" `
            -ErrorMessage $dnsHealth.reason `
            -CorrelationId $correlationId
        
        # Só tenta recovery se não exauriu
        if ($failureResult.action -eq "retry" -and $failureResult.attempt -ge 3) {
            Invoke-AutoRecovery -FailedComponent "dns_filter" -ErrorMessage $dnsHealth.reason
        }
        # Se exauriu, já entrou em SAFE_MODE
        
    } else {
        # Sucesso - resetar contador
        Reset-ComponentFailure -Component "dns_filter"
    }
    
    $lastDNSHealthCheck = Get-Date
}
```

---

## Fase 3: Redução de Ruído (Logging Profissional)

### 3.1 Função de Log Deduplicado

**Nova função** (após Write-Log):
```powershell
# Cache de logs recentes para deduplicação
$Global:LogDeduplicationCache = @{}
$Global:LogDeduplicationTTLSeconds = 30

function Write-LogDedup {
    <#
    .SYNOPSIS
        Log com deduplicação automática
    #>
    param(
        [string]$Message,
        [string]$Level = "INFO",
        [string]$CorrelationId = $null
    )
    
    $cacheKey = "$Level|$Message"
    $now = Get-Date
    
    # Verificar se já logou recentemente
    if ($Global:LogDeduplicationCache.ContainsKey($cacheKey)) {
        $lastLog = $Global:LogDeduplicationCache[$cacheKey]
        $elapsed = ($now - $lastLog).TotalSeconds
        
        if ($elapsed -lt $Global:LogDeduplicationTTLSeconds) {
            # Suprimir log duplicado
            return
        }
    }
    
    # Registrar e logar
    $Global:LogDeduplicationCache[$cacheKey] = $now
    
    # Adicionar correlation_id se presente
    if ($CorrelationId) {
        $Message = "[$CorrelationId] $Message"
    }
    
    Write-Log $Message $Level
}
```

### 3.2 Health Snapshot Único por Ciclo

**Nova função** (substituir múltiplos logs de estado):
```powershell
function Write-HealthSnapshot {
    <#
    .SYNOPSIS
        Snapshot único de saúde por ciclo (1 evento = 1 log)
    #>
    param([string]$CorrelationId)
    
    $dnsStatus = if ($Global:DNSFilterConfig.Enabled) { 
        $s = Get-DNSFilterStatus
        if ($s.running) { "ok" } else { "failed" }
    } else { "disabled" }
    
    $policyStatus = if ($Global:PolicyContract.LastSync) { "ok" } else { "unknown" }
    
    $snapshot = @{
        state = Get-AgentState
        components = @{
            dns_filter = $dnsStatus
            policy_sync = $policyStatus
            heartbeat = "ok"  # Se chegou aqui, heartbeat funcionou
        }
        failure_counters = @{
            dns_filter = $Global:FailureCounters.dns_filter.consecutive
            heartbeat = $Global:FailureCounters.heartbeat.consecutive
        }
        correlation_id = $CorrelationId
    }
    
    Add-EvidenceEntry -Type "health_snapshot" -Data $snapshot -Severity "info"
}
```

---

## Fase 4: Observabilidade Forense

### 4.1 Incident Summary Automático

**Nova função** (chamada ao entrar em SAFE_MODE ou ERROR):
```powershell
function Write-IncidentSummary {
    <#
    .SYNOPSIS
        Gera resumo de incidente ao entrar em estado crítico
    #>
    param(
        [string]$RootCause,
        [string]$CorrelationId
    )
    
    $incidentId = [guid]::NewGuid().ToString()
    
    # Construir timeline dos últimos 10 eventos de estado
    $timeline = $Global:AgentState.History | Select-Object -Last 10 | ForEach-Object {
        "$($_.timestamp.Substring(11, 5)) $($_.from)->$($_.to)"
    }
    
    # Determinar ação recomendada
    $recommendedAction = switch ($RootCause) {
        { $_ -match "dns" } { "reinstall_dns_service" }
        { $_ -match "heartbeat" } { "check_network_connectivity" }
        { $_ -match "rollback" } { "manual_version_downgrade" }
        default { "contact_support" }
    }
    
    $summary = @{
        incident_id = $incidentId
        root_cause = $RootCause
        timeline = $timeline
        recommended_action = $recommendedAction
        failure_counters = $Global:FailureCounters
        agent_version = $Global:AgentVersion
        correlation_id = $CorrelationId
    }
    
    Add-EvidenceEntry -Type "incident_summary" -Data $summary -Severity "critical"
    
    Write-Log "[INCIDENT] Summary generated: $incidentId - $recommendedAction" "ERROR"
    
    return $incidentId
}
```

### 4.2 Atualizar Set-AgentState para Gerar Incident Summary

**Adicionar ao final de Set-AgentState** (antes do return $true):
```powershell
    # Gerar incident summary para estados críticos
    if ($NewState -in @("SAFE_MODE", "ERROR")) {
        Write-IncidentSummary -RootCause $Reason -CorrelationId $CorrelationId
    }
```

### 4.3 Correlation ID em Todos os Eventos

**Atualizar Add-EvidenceEntry** (linha ~871):
```powershell
function Add-EvidenceEntry {
    param(
        # ... parâmetros existentes ...
        
        [Parameter(Mandatory = $false)]
        [string]$CorrelationId = $null
    )
    
    # Na criação do entry (linha ~910)
    $entry = @{
        event_id = [guid]::NewGuid().ToString()  # NOVO: UUID único
        correlation_id = $CorrelationId           # NOVO: Para agrupar eventos
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        # ... resto igual ...
    }
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `scripts/cybershield-agent-windows-v4.1.2.ps1` | FSM completa, hard stops, dedup logs |
| `public/agent-scripts/cybershield-agent-windows-v4.ps1` | Sync com v4.1.2 |
| `supabase/functions/_shared/agent-script-windows-content.ts` | Sync embedded |
| `src/lib/agent-state-machine.ts` | Adicionar SHUTDOWN se necessário |

---

## Compatibilidade com Backend

As mudanças são **100% compatíveis** com o backend existente:

- Tabela `agents` já tem `agent_state`, `agent_mode`, `safe_mode_reason`
- Edge Function `agent-heartbeat` já processa `agent_mode: 'SAFE_MODE'`
- Evidence Journal já envia para `submit-agent-evidence`
- Tipos de evento existentes são reutilizados

---

## Novos Tipos de Evento (Evidence Journal)

| Tipo | Quando | Campos |
|------|--------|--------|
| `health_snapshot` | 1x por ciclo de 5min | state, components, failure_counters |
| `recovery_exhausted` | Ao exaurir tentativas | component, consecutive_failures, cooldown_until |
| `incident_summary` | Ao entrar SAFE_MODE/ERROR | incident_id, root_cause, timeline, recommended_action |

---

## Resultado Esperado

Após implementação:

- **0 loops infinitos**: Hard stop após 10 falhas
- **0 estados mentirosos**: Invariantes bloqueiam ENFORCING inválido
- **Logs reduzidos em ~80%**: Deduplicação + 1 snapshot por ciclo
- **Forensics completa**: correlation_id + incident_summary

---

## Ordem de Implementação

1. **Fase 1** (Disciplina): 30min - Invariantes e SHUTDOWN
2. **Fase 2** (Hard Stops): 45min - FailurePolicy e contadores
3. **Fase 3** (Ruído): 30min - Dedup e snapshots
4. **Fase 4** (Observabilidade): 30min - Incident summary

**Total estimado**: ~2h15min

---

## Validação Pós-Implementação

1. Simular falha de DNS (parar serviço)
   - Esperar: ENFORCING → DEGRADED (imediato, não após 3 falhas)
   
2. Simular 10 falhas consecutivas
   - Esperar: Hard stop + SAFE_MODE + incident_summary
   
3. Verificar logs
   - Esperar: Sem duplicatas, com correlation_id

4. Verificar Evidence Journal
   - Esperar: health_snapshot a cada 5min, não a cada evento
