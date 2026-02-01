
# Plano: Atualizar Agentes Linux e macOS para v4.5.0 - Resiliência Total

## Resumo Executivo

O backend já está completo com webhooks e heartbeat self-test. Falta atualizar os agentes **Linux** e **macOS** de v4.4.0 para v4.5.0 com as mesmas funcionalidades de resiliência total implementadas no Windows.

---

## Estado Atual

### Já Completo
- Windows v4.5.0 com todas as funcionalidades de resiliência
- Backend com webhook alerts (Slack, Teams, genérico)
- Endpoint `/heartbeat-self-test` operacional
- Monitor de saúde com integração de webhooks

### Falta Implementar
- Linux v4.4.0 → v4.5.0
- macOS v4.4.0 → v4.5.0
- Registrar v4.5.0 no banco para Linux/macOS

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `public/agent-scripts/cybershield-agent-linux-v4.sh` | Atualizar para v4.5.0 com resiliência |
| `public/agent-scripts/cybershield-agent-macos-v4.sh` | Atualizar para v4.5.0 com resiliência |
| SQL Migration | Registrar v4.5.0 como latest para Linux/macOS |

---

## Funcionalidades a Adicionar (Bash)

### 1. Network Watchdog
Monitorar conectividade de rede e forçar heartbeat imediato após reconexão.

```bash
# Variáveis globais de resiliência
NETWORK_LAST_STATE=true
NETWORK_CHECK_INTERVAL=30
NETWORK_TEST_HOST="iavbnmduxpxhwubqrzzn.supabase.co"
NETWORK_TEST_PORT=443
FORCE_RECONNECT=false

# Teste de conectividade TCP
test_network_connectivity() {
    if nc -z -w5 "$NETWORK_TEST_HOST" "$NETWORK_TEST_PORT" 2>/dev/null; then
        return 0
    fi
    return 1
}

# Invocar watchdog de rede
invoke_network_watchdog() {
    local current_state
    if test_network_connectivity; then
        current_state=true
    else
        current_state=false
    fi
    
    # Detectar transição offline → online
    if [[ "$NETWORK_LAST_STATE" == "false" && "$current_state" == "true" ]]; then
        log_message "INFO" "[NETWORK] Rede restaurada. Forçando heartbeat imediato."
        send_heartbeat
    fi
    
    NETWORK_LAST_STATE="$current_state"
}
```

### 2. Task Health Assert

**Linux (systemd):**
```bash
assert_task_health() {
    local service_name="cybershield-agent.service"
    
    if ! systemctl is-active --quiet "$service_name" 2>/dev/null; then
        log_message "WARN" "[TASK] Serviço não está ativo. Tentando reiniciar..."
        sudo systemctl restart "$service_name" 2>/dev/null || true
    fi
    
    if ! systemctl is-enabled --quiet "$service_name" 2>/dev/null; then
        log_message "WARN" "[TASK] Serviço não está habilitado. Habilitando..."
        sudo systemctl enable "$service_name" 2>/dev/null || true
    fi
}
```

**macOS (launchd):**
```bash
assert_task_health() {
    local plist_name="com.cybershield.agent"
    
    if ! launchctl list | grep -q "$plist_name" 2>/dev/null; then
        log_message "WARN" "[TASK] Serviço launchd não encontrado. Recarregando..."
        launchctl load "/Library/LaunchDaemons/${plist_name}.plist" 2>/dev/null || true
    fi
}
```

### 3. Power Event Detection

**Linux (systemd-logind via dbus-monitor):**
```bash
start_power_event_monitor() {
    # Monitor em background para eventos de power
    (
        dbus-monitor --system "type='signal',interface='org.freedesktop.login1.Manager'" 2>/dev/null | while read -r line; do
            if echo "$line" | grep -q "PrepareForSleep"; then
                # Próxima linha contém boolean - false = wake
                read -r next_line
                if echo "$next_line" | grep -q "false"; then
                    log_message "INFO" "[POWER] Wake from sleep detectado. Forçando heartbeat."
                    FORCE_RECONNECT=true
                fi
            fi
        done
    ) &
    POWER_MONITOR_PID=$!
}
```

**macOS (pmset log parsing):**
```bash
start_power_event_monitor() {
    # Monitor em background para eventos de power
    (
        log stream --predicate 'eventMessage contains "Wake"' 2>/dev/null | while read -r line; do
            if echo "$line" | grep -q "Wake reason"; then
                log_message "INFO" "[POWER] Wake from sleep detectado. Forçando heartbeat."
                FORCE_RECONNECT=true
            fi
        done
    ) &
    POWER_MONITOR_PID=$!
}
```

### 4. Heartbeat Self-Test Integration

```bash
HEARTBEAT_COUNTER=0
HEARTBEAT_SELFTEST_INTERVAL=10

send_heartbeat() {
    # ... código existente de heartbeat ...
    
    # Self-test a cada 10 heartbeats
    HEARTBEAT_COUNTER=$((HEARTBEAT_COUNTER + 1))
    
    if (( HEARTBEAT_COUNTER % HEARTBEAT_SELFTEST_INTERVAL == 0 )); then
        log_message "DEBUG" "[SELFTEST] Executando self-test (contador: $HEARTBEAT_COUNTER)"
        
        local response
        response=$(curl -s -H "X-Agent-Token: $AGENT_TOKEN" \
                        --tlsv1.2 \
                        "${API_BASE}/heartbeat-self-test" 2>/dev/null)
        
        if [[ -n "$response" ]]; then
            local status
            status=$(echo "$response" | jq -r '.status // "unknown"')
            
            if [[ "$status" == "critical" || "$status" == "stale" ]]; then
                log_message "WARN" "[SELFTEST] Backend reportou status: $status. Forçando reconexão."
                FORCE_RECONNECT=true
            else
                log_message "DEBUG" "[SELFTEST] OK - status: $status"
            fi
        fi
    fi
}
```

---

## Integração no Main Loop

```bash
# Variáveis de controle
LAST_TASK_CHECK=$(date +%s)
TASK_CHECK_INTERVAL=300  # 5 minutos

# No loop principal
main_loop() {
    while true; do
        # Network Watchdog
        invoke_network_watchdog
        
        # Force reconnect se necessário
        if [[ "$FORCE_RECONNECT" == "true" ]]; then
            log_message "INFO" "[RESILIENCE] Force reconnect ativado. Enviando heartbeat."
            send_heartbeat
            FORCE_RECONNECT=false
        fi
        
        # Task Health Assert a cada 5 minutos
        local current_time=$(date +%s)
        if (( current_time - LAST_TASK_CHECK > TASK_CHECK_INTERVAL )); then
            assert_task_health
            LAST_TASK_CHECK=$current_time
        fi
        
        # ... resto do loop ...
        
        sleep "$POLL_INTERVAL"
    done
}
```

---

## SQL Migration - Registrar v4.5.0

```sql
-- Desmarcar versões anteriores
UPDATE agent_versions SET is_latest = false 
WHERE platform IN ('linux', 'macos') AND is_latest = true;

-- Registrar v4.5.0 para Linux
INSERT INTO agent_versions (platform, version, is_latest, release_notes)
VALUES ('linux', 'v4.5.0', true, 
  'Total Resilience: Network Watchdog, Task Health Assert (systemd), Power Event Detection (dbus), Heartbeat Self-Test. Agente nunca fica offline se máquina estiver ligada.')
ON CONFLICT (platform, version) 
DO UPDATE SET is_latest = true, release_notes = EXCLUDED.release_notes;

-- Registrar v4.5.0 para macOS
INSERT INTO agent_versions (platform, version, is_latest, release_notes)
VALUES ('macos', 'v4.5.0', true, 
  'Total Resilience: Network Watchdog, Task Health Assert (launchd), Power Event Detection (pmset), Heartbeat Self-Test. Agente nunca fica offline se máquina estiver ligada.')
ON CONFLICT (platform, version) 
DO UPDATE SET is_latest = true, release_notes = EXCLUDED.release_notes;
```

---

## Validação Pós-Implementação

1. **Verificar versões registradas:**
   ```sql
   SELECT platform, version, is_latest FROM agent_versions WHERE is_latest = true;
   -- Esperado: windows v4.5.0, linux v4.5.0, macos v4.5.0
   ```

2. **Testar Network Watchdog:**
   - Desconectar rede por 1 minuto
   - Reconectar
   - Verificar log: `[NETWORK] Rede restaurada. Forçando heartbeat.`

3. **Testar Task Health Assert:**
   - `systemctl stop cybershield-agent` (Linux)
   - Aguardar 5 minutos
   - Verificar se serviço foi reiniciado automaticamente

4. **Testar Heartbeat Self-Test:**
   - Verificar log a cada ~10 minutos: `[SELFTEST] OK - status: ok`

---

## Seção Técnica

### Arquitetura de Resiliência (Bash)

```text
┌─────────────────────────────────────────────────────────────┐
│                  AGENTE LINUX/MACOS v4.5.0                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  systemd/launchd │  │   TLS 1.2       │                  │
│  │  (auto-restart)  │  │  (curl --tlsv1.2)│                 │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           └────────────────────┤                            │
│                                ▼                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   MAIN LOOP                          │   │
│  │                                                      │   │
│  │  ┌───────────────┐  ┌───────────────┐               │   │
│  │  │   Network     │  │    Power      │               │   │
│  │  │   Watchdog    │  │   Events      │               │   │
│  │  │  (nc -z 443)  │  │ (dbus/pmset)  │               │   │
│  │  └───────┬───────┘  └───────┬───────┘               │   │
│  │          │                  │                        │   │
│  │          └──────────┬───────┘                        │   │
│  │                     ▼                                │   │
│  │          ┌───────────────────┐                       │   │
│  │          │  FORCE_RECONNECT  │                       │   │
│  │          │     = true        │                       │   │
│  │          └─────────┬─────────┘                       │   │
│  │                    ▼                                 │   │
│  │          ┌───────────────────┐                       │   │
│  │          │  send_heartbeat() │                       │   │
│  │          │  + Self-Test      │                       │   │
│  │          └─────────┬─────────┘                       │   │
│  │                    ▼                                 │   │
│  │          ┌───────────────────┐                       │   │
│  │          │ assert_task_health│                       │   │
│  │          │   (cada 5 min)    │                       │   │
│  │          └───────────────────┘                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Diferenças Entre Plataformas

| Feature | Linux | macOS |
|---------|-------|-------|
| Service Manager | systemd | launchd |
| Task Health Check | `systemctl is-active` | `launchctl list` |
| Power Events | dbus-monitor (logind) | `log stream` (pmset) |
| Network Test | `nc -z` | `nc -z` |
| TLS Enforcement | `curl --tlsv1.2` | `curl --tlsv1.2` |

---

## Benefícios Esperados

Após implementação, todas as 3 plataformas terão:

1. **Detecção de reconexão de rede** - Heartbeat imediato após restaurar conectividade
2. **Auto-repair de serviço** - Serviço reiniciado automaticamente se parar
3. **Detecção de wake** - Heartbeat imediato após acordar de hibernação
4. **Validação proativa** - Self-test detecta falhas de comunicação silenciosas
5. **Paridade de versão** - Windows, Linux e macOS todos em v4.5.0

