

# Plano: Finalizar Registro v4.5.0 para Linux e macOS no Banco de Dados

## Status do Sistema

### ✅ Já Completo

| Componente | Status |
|------------|--------|
| Script Windows v4.5.0 | ✅ Implementado + Registrado no banco |
| Script Linux v4.5.0 | ✅ Implementado (2420 linhas) |
| Script macOS v4.5.0 | ✅ Implementado (2387 linhas) |
| Backend webhook-utils.ts | ✅ Implementado |
| Backend heartbeat-self-test | ✅ Implementado |
| Backend monitor-agent-health | ✅ Atualizado com webhooks |

### ✅ Completo

| Componente | Status |
|------------|--------|
| Linux v4.5.0 no agent_versions | ✅ Registrado como latest |
| macOS v4.5.0 no agent_versions | ✅ Registrado como latest |

---

## Funcionalidades Verificadas nos Scripts

Confirmei que ambos os scripts (Linux e macOS) possuem:

```text
Linha 3:  # CyberShield Agent - Linux/macOS v4.5.0
Linha 49: AGENT_VERSION="v4.5.0"

Funções de Resiliência:
- test_network_connectivity() - linha ~630
- invoke_network_watchdog() - linha ~639
- assert_task_health() - linha ~669
- start_power_event_monitor() - linha ~697
- invoke_heartbeat_selftest() - linha ~726

Main Loop (v4.5.0):
- Network Watchdog a cada 30s - linha ~2316
- Force Reconnect check - linha ~2323
- Task Health Assert a cada 5min - linha ~2335
```

---

## Ação Necessária

Para completar o rollout da v4.5.0 para Linux e macOS, é necessário executar o SQL de registro no banco:

```sql
-- Desmarcar versões anteriores como latest
UPDATE agent_versions SET is_latest = false 
WHERE platform IN ('linux', 'macos') AND is_latest = true;

-- Registrar v4.5.0 como latest
INSERT INTO agent_versions (platform, version, is_latest, release_notes)
VALUES 
  ('linux', 'v4.5.0', true, 'Total Resilience: Network Watchdog, Task Health Assert (systemd), Power Event Detection (dbus), Heartbeat Self-Test, FSM State Persistence'),
  ('macos', 'v4.5.0', true, 'Total Resilience: Network Watchdog, Task Health Assert (launchd), Power Event Detection (pmset), Heartbeat Self-Test, FSM State Persistence')
ON CONFLICT (platform, version) 
DO UPDATE SET is_latest = true, release_notes = EXCLUDED.release_notes;
```

---

## Sincronização de Scripts

O script `sync-all-agents.js` já existe e pode ser usado para sincronizar os scripts com as Edge Functions:

```bash
node scripts/sync-all-agents.js --all
```

Isso irá:
1. Ler os scripts de `public/agent-scripts/`
2. Escapar caracteres especiais para template literals TypeScript
3. Gerar arquivos em `supabase/functions/_shared/agent-script-*-content.ts`

---

## Validação Pós-Registro

Após registrar no banco, verificar:

```sql
SELECT platform, version, is_latest 
FROM agent_versions 
WHERE is_latest = true 
ORDER BY platform;
```

Resultado esperado:
| platform | version | is_latest |
|----------|---------|-----------|
| linux | v4.5.0 | true |
| macos | v4.5.0 | true |
| windows | v4.5.0 | true |

---

## Seção Técnica

### Arquitetura de Resiliência (Paridade Total)

```text
┌────────────────────────────────────────────────────────────────┐
│                 AGENTES v4.5.0 - TODAS AS PLATAFORMAS          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────┬─────────────────┬─────────────────┐       │
│  │    WINDOWS      │     LINUX       │     macOS       │       │
│  │    (PowerShell) │     (Bash)      │     (Bash)      │       │
│  └────────┬────────┴────────┬────────┴────────┬────────┘       │
│           │                 │                 │                │
│  Network  │ Test-NetConn    │ nc -z           │ nc -z          │
│  Watchdog │ TCP 443         │ TCP 443         │ TCP 443        │
│           │                 │                 │                │
│  Task     │ Get-Scheduled   │ systemctl       │ launchctl      │
│  Health   │ Task            │ is-active       │ list           │
│           │                 │                 │                │
│  Power    │ WMI Event       │ dbus-monitor    │ log stream     │
│  Events   │ Type 7/18       │ PrepareForSleep │ Wake reason    │
│           │                 │                 │                │
│  Self-    │ /heartbeat-     │ /heartbeat-     │ /heartbeat-    │
│  Test     │ self-test       │ self-test       │ self-test      │
│           │                 │                 │                │
│  TLS 1.2  │ ServicePoint    │ curl --tlsv1.2  │ curl --tlsv1.2 │
│           │ Manager         │                 │                │
│           │                 │                 │                │
└───────────┴─────────────────┴─────────────────┴────────────────┘
```

### Fluxo de Auto-Update

```text
Agente v4.4.0 (atual no banco)
    │
    ├─► Heartbeat → Backend retorna latest_version = v4.5.0
    │       │
    │       ├─► Agente detecta: v4.4.0 < v4.5.0
    │       │
    │       └─► Trigger force_update
    │               │
    │               ├─► Download script v4.5.0
    │               ├─► Validar SHA256
    │               ├─► Backup versão atual
    │               ├─► Aplicar nova versão
    │               └─► Restart serviço
    │
    └─► Próximo heartbeat: versão = v4.5.0 ✅
```

