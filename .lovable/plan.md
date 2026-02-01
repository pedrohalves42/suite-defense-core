# Plano: Resiliência Total - Agente Nunca Fica Offline Com PC Ligado

## Status: ✅ P0 IMPLEMENTADO (v4.5.0)

---

## Implementado ✅

### P0 - Crítico
| Item | Status | Versão |
|------|--------|--------|
| TLS 1.2 Forçado | ✅ | v4.4.0 |
| Network Connectivity Monitor | ✅ | v4.5.0 |
| Task Health Assert | ✅ | v4.5.0 |
| Power Event Detection | ✅ | v4.5.0 |

### Detalhes da Implementação v4.5.0

#### 1. Network Watchdog
- **`Test-NetworkConnectivity`**: Teste TCP rápido na porta 443 com timeout 5s
- **`Invoke-NetworkWatchdog`**: Detecta reconexão de rede e força heartbeat imediato
- Chamado a cada ciclo do main loop (30s)
- Transição offline→online: heartbeat enviado em <5s

#### 2. Task Health Assert  
- **`Assert-TaskHealth`**: Verifica se Scheduled Task existe e está habilitada
- Auto-repair: reabilita task automaticamente se estiver desabilitada
- Chamado a cada 5 minutos
- Logging de problemas detectados

#### 3. Power Event Detection
- **`Register-PowerEventWatcher`**: WMI listener para Win32_PowerManagementEvent
- Detecta EventType 7 (resume from suspend) e 18 (resume automatic)
- Define `ForceReconnect` flag para heartbeat imediato após wake
- Registrado automaticamente no bootstrap

---

## Pendente

### P1 - Alto (Próxima Semana)
| Item | Status |
|------|--------|
| Heartbeat Self-Test | ⏳ |
| Webhook alerts (Slack/Teams) | ⏳ |

### P2 - Médio (Backlog)
| Item | Status |
|------|--------|
| SMS alerts | ⏳ |
| Threshold configurável por tenant | ⏳ |
| Dashboard widget "Tempo Online Garantido" | ⏳ |

---

## Arquitetura de Resiliência v4.5.0

```text
┌─────────────────────────────────────────────────────────────┐
│                  ARQUITETURA DE RESILIÊNCIA v4.5.0          │
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
│  │                 AGENT PROCESS v4.5.0                 │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │    │
│  │  │ Heartbeat │  │  Network  │  │   Power   │        │    │
│  │  │   Loop    │  │  Watchdog │  │  Events   │        │    │
│  │  │  (60s)    │  │   (30s)   │  │   (WMI)   │        │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘        │    │
│  │        │              │              │               │    │
│  │        └──────────────┼──────────────┘               │    │
│  │                       ▼                              │    │
│  │              ┌─────────────┐                         │    │
│  │              │    Task     │                         │    │
│  │              │   Health    │                         │    │
│  │              │  Assert(5m) │                         │    │
│  │              └──────┬──────┘                         │    │
│  │                     ▼                                │    │
│  │              ┌─────────────┐                         │    │
│  │              │  Watchdog   │                         │    │
│  │              │  (10 retry) │                         │    │
│  │              └─────────────┘                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Validação Pós-Implementação

| Teste | Descrição | Mecanismo |
|-------|-----------|-----------|
| Desconexão de Rede | Desconectar cabo 5min, reconectar | Network Watchdog |
| Hibernação | Hibernar PC, acordar | Power Event Detection |
| Crash do Processo | Matar processo PowerShell | Scheduled Task RepetitionInterval |
| Reboot | Reiniciar PC | AtStartup Trigger |

**Expectativa**: Agente online em <2 minutos após qualquer evento.

---

## Changelog

### v4.5.0 (2025-02-01) - TOTAL RESILIENCE
- NEW: `Test-NetworkConnectivity` - teste TCP 443 rápido
- NEW: `Invoke-NetworkWatchdog` - detecta reconexão, força heartbeat
- NEW: `Assert-TaskHealth` - verifica/repara Scheduled Task
- NEW: `Register-PowerEventWatcher` - WMI listener para power events
- NEW: Variáveis globais para resiliência (ForceReconnect, LastNetworkState, etc.)
- IMPROVED: Bootstrap registra power events automaticamente
- IMPROVED: Main loop inclui Network Watchdog e Task Health Assert
- IMPROVED: Features array inclui novos monitores
- IMPROVED: Logging inclui status de power events
