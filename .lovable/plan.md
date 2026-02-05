

## Plano: Atualizar Script de Reinstalação com Credenciais Automáticas para v5.0.2

### Resumo da Análise

Após validação completa do script `cybershield-agent-windows-v5.ps1` (v5.0.2, 2133 linhas), identifiquei:

**Problemas encontrados:**

1. **Comentários em português restantes** (5 ocorrências) que devem ser traduzidos para inglês para garantir compatibilidade ASCII total:
   - Linha 111: `VARIAVEIS GLOBAIS` → `GLOBAL VARIABLES`
   - Linha 298: `Classificar erro como transiente ou permanente` → `Classify error as transient or permanent`
   - Linha 365: `Persistir estado` → `Persist state`
   - Linha 794: `Calcular hash do output` → `Calculate output hash`
   - Linha 840: `Assinar resultado` → `Sign result`
   - Linha 1491: `Registrar evento` → `Register event`
   - Linha 1403: `LIMPEZA DE DISCO` → `DISK CLEANUP`
   - Linha 1753: `BASELINE DE PROCESSOS` → `PROCESS BASELINE`
   - Linha 2082: `AUTO-REPARO A CADA CICLO` → `AUTO-REPAIR EACH CYCLE`
   - Linha 2102: `HEARTBEAT A CADA INTERVALO` → `HEARTBEAT EACH INTERVAL`

2. **Script de reinstalação desatualizado** (`reinstall-preserve-script-content.ts`):
   - Referencia `v5.0.1` como versão padrão (linha 231)
   - Deve ser atualizado para `v5.0.2`

**Validações confirmadas como OK:**

- Sintaxe PowerShell 5.1: ✅ Todas funções fechadas corretamente
- TLS 1.2: ✅ Forçado na linha 84
- Global trap: ✅ Implementado corretamente (linhas 91-108)
- FSM: ✅ 6 estados validados com transições corretas
- ECDSA P-256: ✅ Geração e registro de chaves
- HMAC-SHA256: ✅ Assinatura de requisições
- Invoke-SecureRequest: ✅ Backoff exponencial (1s → 60s)
- Job handlers: ✅ kill_process, stop_service, disable_service, restart_service
- Protected processes/services lists: ✅ Defense-in-depth implementado
- Write-Log: ✅ Bug da linha 192 corrigido (v5.0.1 tinha erro de sintaxe)

---

### Ações Planejadas

#### 1. Corrigir comentários em português no script v5.0.2

Traduzir todos os comentários restantes para inglês:

| Linha | Antes | Depois |
|-------|-------|--------|
| 111 | `VARIAVEIS GLOBAIS` | `GLOBAL VARIABLES` |
| 298 | `Classificar erro como transiente ou permanente` | `Classify error as transient or permanent` |
| 365 | `Persistir estado` | `Persist state` |
| 794 | `Calcular hash do output` | `Calculate output hash` |
| 840 | `Assinar resultado` | `Sign result` |
| 1403 | `LIMPEZA DE DISCO` | `DISK CLEANUP` |
| 1491 | `Registrar evento` | `Register event` |
| 1533-1542 | Vários comentários PT | Traduzir para EN |
| 1753 | `BASELINE DE PROCESSOS` | `PROCESS BASELINE` |
| 2082 | `AUTO-REPARO A CADA CICLO` | `AUTO-REPAIR EACH CYCLE` |
| 2102 | `HEARTBEAT A CADA INTERVALO` | `HEARTBEAT EACH INTERVAL` |

#### 2. Atualizar script de reinstalação

Modificar `supabase/functions/_shared/reinstall-preserve-script-content.ts`:
- Linha 231: Mudar `$newVersion = "v5.0.1"` para `$newVersion = "v5.0.2"`

#### 3. Sincronizar script embarcado

Atualizar `supabase/functions/_shared/agent-script-windows-content.ts` com a versão corrigida do v5.0.2 (se existir) para garantir que o endpoint `serve-agent-update` entregue a versão correta.

---

### Seção Técnica

**Estrutura do script v5.0.2 validada:**

```text
┌─────────────────────────────────────────────────────┐
│ HEADER (Linhas 1-81)                                │
│  - Documentação, param(), TLS 1.2                   │
├─────────────────────────────────────────────────────┤
│ GLOBAL TRAP (Linhas 88-108)                         │
│  - Captura erros fatais, persiste em log            │
├─────────────────────────────────────────────────────┤
│ GLOBAL VARIABLES (Linhas 110-173)                   │
│  - ServerUrl, AgentToken, HmacSecret, FSM states    │
├─────────────────────────────────────────────────────┤
│ LOGGING (Linhas 175-219)                            │
│  - Write-Log com rotação e cores                    │
├─────────────────────────────────────────────────────┤
│ NETWORK (Linhas 222-325)                            │
│  - Invoke-SecureRequest com backoff exponencial     │
├─────────────────────────────────────────────────────┤
│ FSM (Linhas 328-386)                                │
│  - Set-AgentState, Get-SavedAgentState              │
├─────────────────────────────────────────────────────┤
│ ECDSA (Linhas 388-587)                              │
│  - Initialize-AgentKeys, Register-AgentKey          │
│  - Invoke-SignResult                                │
├─────────────────────────────────────────────────────┤
│ ED25519 (Linhas 589-638)                            │
│  - Verify-JobSignature                              │
├─────────────────────────────────────────────────────┤
│ HASH CHAIN (Linhas 640-679)                         │
│  - Get-ExecutionHash                                │
├─────────────────────────────────────────────────────┤
│ JOBS (Linhas 681-884)                               │
│  - Poll-Jobs, Execute-Job, Submit-JobResult         │
├─────────────────────────────────────────────────────┤
│ DNS FILTER (Linhas 886-946)                         │
│  - Sync-DnsBlocklist, Test-DnsBlock                 │
├─────────────────────────────────────────────────────┤
│ NETWORK WATCHDOG (Linhas 948-974)                   │
│  - Test-NetworkConnectivity                         │
├─────────────────────────────────────────────────────┤
│ JOB HANDLERS (Linhas 976-1400)                      │
│  - Software, AV, Network, Firewall, Web Activity    │
│  - kill_process, stop_service, disable_service      │
│  - restart_service                                  │
├─────────────────────────────────────────────────────┤
│ AUTO-REPAIR (Linhas 1402-1627)                      │
│  - Invoke-DiskCleanup, Invoke-HighCpuProcessCheck   │
├─────────────────────────────────────────────────────┤
│ ADVANCED COLLECTION (Linhas 1629-1853)              │
│  - Get-TopProcesses, Get-UnauthorizedSoftware       │
│  - Initialize-ProcessBaseline                       │
├─────────────────────────────────────────────────────┤
│ TELEMETRY (Linhas 1855-1889)                        │
│  - Send-AutoRepairTelemetry                         │
├─────────────────────────────────────────────────────┤
│ HEARTBEAT (Linhas 1916-1967)                        │
│  - Send-Heartbeat com métricas completas            │
├─────────────────────────────────────────────────────┤
│ MAIN LOOP (Linhas 1969-2133)                        │
│  - Inicialização FSM, loop infinito com watchdogs   │
└─────────────────────────────────────────────────────┘
```

**Comando de teste após implementação:**

```powershell
# Reinstalar agente com credenciais automáticas preservadas
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
```

---

### Arquivos a serem modificados

1. `public/agent-scripts/cybershield-agent-windows-v5.ps1` - Tradução de comentários PT→EN
2. `supabase/functions/_shared/reinstall-preserve-script-content.ts` - Atualizar versão para v5.0.2

