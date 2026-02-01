

# Plano: Resiliência Total - Agente Nunca Fica Offline Com PC Ligado

## Diagnóstico do Problema

### O Que Aconteceu
1. **MIT-SERVIDOR** usava TLS 1.0 (default do PowerShell 5.1) → Supabase rejeitava conexões
2. **PC-Servidor-Planalto** precisou restart manual da task para carregar código atualizado
3. Ambos ficaram marcados como "offline" no dashboard, mas PCs estavam ligados

### Por Que Isso É Inaceitável
- Agente **nunca** deve ficar offline se o PC estiver ligado e conectado à internet
- Reinício do PC deve resultar em agente online em menos de 2 minutos
- Sistema deve ter **auto-recovery** robusto sem intervenção manual

---

## Mecanismos de Resiliência Atuais

| Mecanismo | Status | Descrição |
|-----------|--------|-----------|
| TLS 1.2 Forçado | ✅ Implementado | Corrige Windows Server 2012/2016 |
| Scheduled Task AtStartup | ✅ Implementado | Inicia com Windows |
| RepetitionInterval 5min | ✅ Implementado | Reinicia se processo morrer |
| RestartCount 999 | ✅ Implementado | Retry automático em falha |
| RestartInterval 1min | ✅ Implementado | Intervalo entre retries |
| Watchdog Interno | ✅ Implementado | Loop de retry com backoff |
| MultipleInstances IgnoreNew | ✅ Implementado | Evita duplicatas |
| SYSTEM Account | ✅ Implementado | Não depende de login de usuário |
| StartWhenAvailable | ✅ Implementado | Executa se perdeu trigger |
| Defender Exclusions | ✅ Implementado | Evita bloqueios de antivírus |

---

## Gaps Identificados

### Gap 1: Detecção de Hibernação/Wake
O agente não detecta quando o PC volta de hibernação/sleep e pode ter conexões TCP "stale" que falham silenciosamente.

### Gap 2: Health Check Proativo
Não há verificação periódica de que o heartbeat está realmente chegando ao servidor.

### Gap 3: Self-Healing de Credenciais
Se o HMAC secret for corrompido no disco, agente entra em loop de 401 sem conseguir se recuperar.

### Gap 4: Network Retry Agressivo
Após desconexão de rede (ex: cabo desplugado e reconectado), agente pode demorar minutos para reconectar.

### Gap 5: Monitoramento de Task Health
Não há verificação de que a Scheduled Task está realmente Running (não apenas registrada).

### Gap 6: Alertas Push para Admin
Admin só descobre que agente está offline quando olha o dashboard.

---

## Soluções Propostas

### Solução 1: Network Watchdog com Power Event Detection
Adicionar detecção de eventos de power (wake from sleep/hibernate) e forçar reconexão imediata.

```powershell
# Registrar para eventos de power
Register-WMIEvent -Query "SELECT * FROM Win32_PowerManagementEvent" -Action {
    if ($EventArgs.NewEvent.EventType -eq 7) {  # Resume from suspend
        Write-Log "[POWER] Sistema retornou de hibernação. Forçando reconexão..." "INFO"
        # Reset de conexões TCP e força heartbeat imediato
        $Global:ForceReconnect = $true
    }
}
```

### Solução 2: Heartbeat Self-Test
A cada 10 heartbeats (ou 10 minutos), agente verifica se o backend realmente recebeu o último heartbeat.

```powershell
function Test-HeartbeatReachability {
    # Chamar endpoint de health-check que retorna last_heartbeat do agente
    # Se last_heartbeat > 5 minutos, há problema de conectividade
    # Trigger auto-recovery
}
```

### Solução 3: Network Connectivity Monitor
Loop secundário que monitora conectividade de rede e força recovery quando detecta reconexão.

```powershell
$lastNetworkState = $true
while ($true) {
    $currentState = Test-NetConnection -ComputerName "iavbnmduxpxhwubqrzzn.supabase.co" -Port 443
    if (-not $lastNetworkState -and $currentState) {
        Write-Log "[NETWORK] Rede restaurada. Forçando heartbeat imediato." "INFO"
        Send-Heartbeat
    }
    $lastNetworkState = $currentState
    Start-Sleep -Seconds 30
}
```

### Solução 4: Push Notifications (Webhook)
Quando agente volta online após estar offline >5min, enviar notificação push para admin.

### Solução 5: Scheduled Task Health Monitor
A cada ciclo, verificar se a própria Scheduled Task ainda existe e está configurada corretamente.

```powershell
function Assert-TaskHealth {
    $task = Get-ScheduledTask -TaskName "CyberShieldAgent-*" -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Log "[CRITICAL] Scheduled Task não encontrada! Auto-reinstalando..." "ERROR"
        # Re-registrar task
    }
}
```

### Solução 6: Alerta Proativo de Offline
Edge function `monitor-agent-health` já existe. Melhorar para:
- Enviar SMS além de email
- Webhook para Slack/Teams
- Threshold configurável por tenant (ex: 5min vs 30min)

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `public/agent-scripts/cybershield-agent-windows-v4.ps1` | Adicionar Power Event detection, Network monitor, Task health check |
| `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v4.ps1` | Espelhar mudanças |
| `supabase/functions/monitor-agent-health/index.ts` | Adicionar webhook/SMS alerts |
| `src/components/tenant/TenantSettingsForm.tsx` | UI para configurar alertas |
| `supabase/functions/heartbeat/index.ts` | Retornar last_heartbeat no response para self-test |

---

## Priorização

### P0 - Crítico (Implementar Agora)
1. ✅ TLS 1.2 (já implementado)
2. Network Connectivity Monitor no agente
3. Task Health Assert

### P1 - Alto (Próxima Semana)
4. Power Event Detection
5. Heartbeat Self-Test
6. Webhook alerts para Slack/Teams

### P2 - Médio (Backlog)
7. SMS alerts
8. Threshold configurável por tenant
9. Dashboard widget de "Tempo Online Garantido"

---

## Validação Pós-Implementação

### Teste 1: Simular Desconexão de Rede
1. Desconectar cabo de rede por 5 minutos
2. Reconectar
3. Verificar que agente volta online em <2 minutos

### Teste 2: Simular Hibernação
1. Hibernar PC
2. Acordar
3. Verificar heartbeat imediato

### Teste 3: Simular Crash do Processo
1. Matar processo PowerShell do agente
2. Verificar que Scheduled Task reinicia em <5 minutos

### Teste 4: Simular Reboot
1. Reiniciar PC
2. Verificar agente online em <2 minutos após boot completo

---

## Resumo Técnico

```text
┌─────────────────────────────────────────────────────────────┐
│                  ARQUITETURA DE RESILIÊNCIA                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │  AtStartup  │   │ Repetition  │   │   Restart   │        │
│  │   Trigger   │   │  5 minutos  │   │   Count=999 │        │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
│         │                 │                 │                │
│         └────────────┬────┴────────────────┘                │
│                      ▼                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              SCHEDULED TASK (SYSTEM)                  │    │
│  │  - TLS 1.2 forçado                                   │    │
│  │  - StartWhenAvailable                                │    │
│  │  - MultipleInstances: IgnoreNew                      │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 AGENT PROCESS                        │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │    │
│  │  │ Heartbeat │  │  Network  │  │   Power   │        │    │
│  │  │   Loop    │  │  Monitor  │  │  Events   │        │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘        │    │
│  │        │              │              │               │    │
│  │        └──────────────┼──────────────┘               │    │
│  │                       ▼                              │    │
│  │              ┌─────────────┐                         │    │
│  │              │  Watchdog   │                         │    │
│  │              │  (10 retry) │                         │    │
│  │              └──────┬──────┘                         │    │
│  │                     ▼                                │    │
│  │              ┌─────────────┐                         │    │
│  │              │  Self-Heal  │                         │    │
│  │              │ (Task Assert)│                        │    │
│  │              └─────────────┘                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

