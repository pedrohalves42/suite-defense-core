# Plano de Modularização — Windows Agent PS1 v5 → v6

## Status Atual
- **Monolito**: `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1` — **7.331 linhas**, **85 funções**
- **Modular v6**: `agents/windows/` — **1.218 linhas**, **43 funções**, **9 módulos** + orquestrador
- **Gap**: **81 funções** do v5 ainda não migradas para módulos v6

## Arquitetura Alvo (v6 Modular)

```
agents/windows/
├── main.ps1                  # Orquestrador (mutex, load modules, main loop)
├── modules/
│   ├── config.ps1            # Configuração, estado persistido, secrets
│   ├── utils.ps1             # Write-Log, Flush-LogBuffer, TraceId, helpers
│   ├── crypto.ps1            # ECDSA/RSA init, sign, verify, hash chain
│   ├── hmac.ps1              # HMAC compute, verify, nonce
│   ├── state.ps1             # ★ NOVO: FSM (Set-AgentState, Get-SavedAgentState, rollback)
│   ├── evidence.ps1          # ★ NOVO: Evidence chain, aggregation buffer
│   ├── network.ps1           # ★ NOVO: Invoke-SecureRequest, TLS pin, connectivity
│   ├── heartbeat.ps1         # ★ NOVO: Send-Heartbeat, Poll-Jobs, Submit-JobResult
│   ├── job-runner.ps1        # Job dispatch (Invoke-AgentJob), typed whitelist
│   ├── telemetry.ps1         # System metrics, system info
│   ├── security.ps1          # AV/Firewall status, USB, process baseline, EDR
│   ├── remediation.ps1       # ★ NOVO: Kill, stop, restart, quarantine, patch, firewall
│   ├── collection.ps1        # ★ NOVO: Software inventory, network info, web activity, DNS
│   ├── update.ps1            # Agent update, forced update
│   ├── self-heal.ps1         # Watchdog, integrity, task health, auto-repair
│   └── notification.ps1      # ★ NOVO: Toast, push alerts, repair telemetry
└── tests/
    ├── *.Tests.ps1           # Testes Pester existentes
    └── (novos testes para módulos novos)
```

**Total: 16 módulos** (9 existentes + 7 novos)

## Mapeamento de Funções por Módulo

### Módulos Existentes (já migrados — revisão apenas)

| Módulo | Funções | Status |
|--------|---------|--------|
| config.ps1 | Initialize-Config, Get-SecretValue, Import-PersistedState, Export-PersistedState | ✅ OK |
| utils.ps1 | New-TraceId, Write-Log, Test-CommandExists, Invoke-SecureApi | ⚠️ Adicionar: Flush-LogBuffer, Write-SafeEventLog, Get-BOMSafeFileHash |
| crypto.ps1 | Initialize-Crypto, Sign-Payload, Get-PayloadHash | ⚠️ Adicionar: Initialize-AgentKeys, Initialize-RSACspKeys, Register-AgentKey, Invoke-SignResult, Test-Ed25519HashSignature, Save-SignedHashCache, Test-RuntimeIntegrity, Get-ExecutionHash, Verify-JobSignature |
| hmac.ps1 | Compute-HMAC, New-HmacNonce, Test-HMAC | ✅ OK |
| job-runner.ps1 | Invoke-AgentJob, Start-HeartbeatLoop, + dispatch wrappers | ⚠️ Mover heartbeat loop para heartbeat.ps1, manter apenas dispatch |
| telemetry.ps1 | Get-SystemTelemetry | ⚠️ Adicionar: Get-SystemMetrics, Get-SystemInfo (do v5) |
| security.ps1 | Get-SecurityEvents, Get-FirewallStatus, Get-AntivirusStatus | ⚠️ Adicionar: Test-AntivirusStatus, Test-FirewallStatus, USB funcs, process baseline, EDR |
| self-heal.ps1 | Get-BOMSafeFileHash, Start-Watchdog, Test-ScriptIntegrity, Invoke-AgentRecovery | ⚠️ Adicionar: Assert-TaskHealth, disk cleanup, high CPU check |
| update.ps1 | Check-ForUpdate, Install-AgentUpdate | ⚠️ Adicionar: Invoke-UpdateAgent, Apply-ForcedUpdate |

### Novos Módulos

| Módulo | Funções do v5 a migrar |
|--------|----------------------|
| **state.ps1** | Set-AgentState, Get-SavedAgentState, Get-RollbackState, Save-RollbackState |
| **evidence.ps1** | Add-EvidenceEntry, Invoke-FlushEvidence, Add-AggregatedEvent, Invoke-FlushAggregatedEntry, Invoke-FlushAggregationBuffer, Update-AggregationConfig |
| **network.ps1** | Invoke-SecureRequest, Test-TlsCertificatePin, Test-NetworkConnectivity, Test-DnsBlock, Sync-DnsBlocklist |
| **heartbeat.ps1** | Send-Heartbeat, Poll-Jobs, Submit-JobResult |
| **remediation.ps1** | Invoke-KillProcess, Invoke-StopService, Invoke-DisableService, Invoke-RestartService, Invoke-FixFirewall, Invoke-QuarantineAgent, Invoke-ApplySecurityPatch, Invoke-ServiceHealthCheck, Invoke-NetworkDiagnostics, Invoke-HighCpuProcessCheck, Invoke-DiskCleanup, Send-AutoRepairTelemetry, Invoke-SyncBlockedWebsites |
| **collection.ps1** | Invoke-CollectSoftwareInventory, Invoke-CollectAntivirusStatus, Invoke-CollectNetworkInfo, Invoke-CollectWebActivity, Invoke-CollectDnsBlocks, Invoke-CollectBackupStatus, Invoke-CollectProcessLineage, Invoke-LightVulnScan, Invoke-ScanJob, Invoke-ReportJob, Get-BrowserHistorySQLite, Extract-DomainFromUrl, ConvertFrom-WebKitTimestamp, ConvertFrom-PRTime, Invoke-EDRTelemetryCollection, Invoke-LocalDetection, Get-TopProcesses, Get-UnauthorizedSoftware |
| **notification.ps1** | Show-SecurityToast, Invoke-PushAlert |

### Funções auxiliares de baseline (→ security.ps1)
- Get-SafeBaselineProp, ConvertTo-SafePSO, ConvertTo-BaselineJson, Import-BaselineSafe, Save-BaselineSafe, Initialize-ProcessBaseline, Test-ProcessInBaseline, Get-ProcessAnomalies, Test-SuspiciousProcesses, Get-UsbWhitelist, Save-UsbWhitelist, Test-UsbWhitelisted, Test-UsbDevices

## Fases de Execução

### Fase 1: Criar 7 novos módulos (Estimativa: 2–3 sessões)
1. Extrair funções do v5 monolito → novos arquivos de módulo
2. Preservar assinaturas de função idênticas (zero breaking changes)
3. Variáveis `$Global:*` e `$script:*` permanecem no escopo correto via dot-sourcing

### Fase 2: Atualizar módulos existentes (1–2 sessões)
1. Mover funções faltantes para os 9 módulos existentes
2. Refatorar `job-runner.ps1` → extrair heartbeat loop para `heartbeat.ps1`
3. Mover `Get-BOMSafeFileHash` de `self-heal.ps1` para `utils.ps1` (usado por múltiplos módulos)

### Fase 3: Atualizar orquestrador main.ps1 (1 sessão)
1. Adicionar `dot-source` dos 7 novos módulos
2. Mover main loop inline do v5 para chamar funções dos módulos
3. Ordem de carregamento: config → utils → crypto → hmac → state → evidence → network → heartbeat → job-runner → telemetry → security → remediation → collection → update → self-heal → notification

### Fase 4: Build script — monolito compilado (1 sessão)
1. Criar `agents/windows/build.ps1` que concatena módulos na ordem correta → gera `cybershield-agent-windows-v6.ps1` (arquivo único para deploy)
2. O agente deployado continua sendo um único .ps1 (exigência de implantação via scheduled task)
3. O arquivo compilado substitui o v5 em `supabase/functions/_shared/agent-scripts/`

### Fase 5: Testes Pester (1–2 sessões)
1. Criar testes para os 7 novos módulos
2. Validar paridade funcional: v5 monolito vs v6 modular compilado
3. Integrar no CI (quality gate)

### Fase 6: Sync e deploy (1 sessão)
1. Atualizar `sync-agent-to-public.sh` para v6
2. Atualizar `promote-agent-v5` → `promote-agent-v6`
3. Compatibilidade retroativa via `poll-jobs` (agentes < v5.0.12 recebem update forçado)

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Variáveis globais perdidas no dot-source | Manter `$Global:` prefix; testar escopo com Pester |
| Ordem de carregamento incorreta | Dependências mapeadas; build script valida existência de funções |
| Hash do script muda → self-heal trigger | Atualizar hash no server antes do deploy gradual |
| Agentes em campo com v5 | Compatibilidade mantida; force-update gradual para v6 |
| Tamanho do arquivo compilado | Estimativa: ~5.500 linhas (remoção de código morto do v5) |

## Métricas de Sucesso
- [ ] 0 funções no monolito — tudo em módulos
- [ ] Cada módulo ≤ 400 linhas
- [ ] 100% das funções do v5 mapeadas no v6
- [ ] Testes Pester passando para todos os módulos
- [ ] Build compilado funcional e deployável
- [ ] Paridade de hash entre `_shared/agent-scripts/` e `public/agent-scripts/`

## Decisão: Executar Agora ou Planejar?
Este é um trabalho de **alto impacto e alto risco** que afeta agentes em produção. Recomendação:
- **Fase 1–3**: Podem ser executadas imediatamente (código-fonte apenas)
- **Fase 4–6**: Requerem coordenação com deploy e testes em ambiente real
