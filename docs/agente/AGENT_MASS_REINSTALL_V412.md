# 🔄 Reinstalação em Massa - Agentes v4.1.2

**Data:** 2025-06-22  
**Versão Alvo:** v4.1.2  
**Motivo:** Agentes v4.0.x não conseguem auto-atualizar devido a bug no handler de update

---

## 📋 Diagnóstico

### Problema Identificado
Os agentes na versão `v4.0.10` e anteriores possuem um bug no handler `update_agent` que:
1. Recebe o job de atualização
2. Reporta conclusão bem-sucedida
3. **Não aplica a atualização**

### Agentes Afetados (Status Atual)

| Agent Name | Versão Atual | Status | Ação Necessária |
|-----------|--------------|--------|-----------------|
| PC-Servidor | v4.0.10 | online | Reinstalar |
| pcteste2 | v4.0.10 | online | Reinstalar |
| Pcteste1 | v4.0.10 | offline | Reinstalar quando online |
| TESTEBMG | v4.0.10 | offline | Reinstalar quando online |
| TESTEMIT | v4.0.10 | offline | Reinstalar quando online |
| teste | v4.0.10 | offline | Reinstalar quando online |
| (outros) | v4.0.x | offline | Reinstalar quando online |

---

## 🎯 Objetivo

Atualizar **todos os agentes** para `v4.1.2` que inclui:

- ✅ **14 job types completos** (vs 9 da v4.0)
- ✅ **Browser history collection** (Chrome, Edge, Firefox)
- ✅ **Ed25519 signature verification** (segurança)
- ✅ **Auto-update funcional** (para futuras versões)
- ✅ **Rollback automático** em caso de falha
- ✅ **Safe mode** após 3 rollbacks consecutivos

---

## 🚀 Procedimento de Reinstalação

### Método 1: Script Automatizado (Recomendado)

#### Passo 1: Gerar Enrollment Key

1. Acesse o **Dashboard CyberShield**
2. Navegue para **Settings** → **Enrollment Keys**
3. Clique em **Generate New Key**
4. Configure:
   - **Description:** `Mass Reinstall v4.1.2 - [DATA]`
   - **Expires in:** 24 hours
   - **Max uses:** (número de agentes a reinstalar)
5. Copie a chave gerada

#### Passo 2: Executar Script de Reinstalação

**Em cada máquina Windows (como Administrador):**

```powershell
# Download e execução do script de reinstalação
$EnrollmentKey = "XXXX-XXXX-XXXX-XXXX"  # Substitua pela sua chave
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"

# Método 1: Download direto do script
irm "$ServerUrl/public/scripts/reinstall-cybershield-agent-v412.ps1" -OutFile "$env:TEMP\reinstall.ps1"
& powershell -ExecutionPolicy Bypass -File "$env:TEMP\reinstall.ps1" -EnrollmentKey $EnrollmentKey -ServerUrl $ServerUrl

# OU Método 2: One-liner (cleanup + fresh install)
Get-ScheduledTask | Where-Object {$_.TaskName -like "CyberShield*"} | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue; Remove-Item "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey" | iex
```

---

### Método 2: One-Liner Rápido

Para reinstalação rápida em máquinas individuais:

```powershell
# Substitua XXXX-XXXX-XXXX-XXXX pela sua enrollment key
$K="XXXX-XXXX-XXXX-XXXX"; $S="https://iavbnmduxpxhwubqrzzn.supabase.co"; Get-ScheduledTask | ? {$_.TaskName -like "CyberShield*"} | Unregister-ScheduledTask -Confirm:$false -EA 0; Remove-Item "C:\CyberShield" -Recurse -Force -EA 0; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm "$S/functions/v1/serve-installer/$K" | iex
```

---

### Método 3: Reinstalação Manual

Se os métodos automatizados falharem:

#### Fase 1: Limpeza Completa

```powershell
# 1. Parar e remover todas as Scheduled Tasks
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" } | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false
}

# 2. Matar processos do agente
Get-Process -Name powershell | Where-Object { $_.CommandLine -like "*cybershield*" } | Stop-Process -Force

# 3. Remover diretório de instalação
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue

# 4. Limpar arquivos temporários
Remove-Item "$env:TEMP\install-windows*" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\cybershield*" -Force -ErrorAction SilentlyContinue

# 5. Validar limpeza
Write-Host "Tasks remaining:" 
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" }
Write-Host "Directory exists: $(Test-Path 'C:\CyberShield')"
```

#### Fase 2: Instalação Fresh

```powershell
# Habilitar TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Executar instalador (substitua ENROLLMENT_KEY)
irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/ENROLLMENT_KEY" | iex
```

#### Fase 3: Verificação

```powershell
# Verificar scheduled task
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" } | Format-Table TaskName, State

# Verificar diretório
Get-ChildItem "C:\CyberShield" -ErrorAction SilentlyContinue

# Verificar logs
Get-Content "C:\CyberShield\logs\agent.log" -Tail 30 -ErrorAction SilentlyContinue
```

---

## ✅ Checklist de Validação

Para cada agente reinstalado:

| # | Verificação | Como Validar | Status |
|---|------------|--------------|--------|
| 1 | Scheduled Task criada | `Get-ScheduledTask -TaskName CyberShield*` | ⬜ |
| 2 | Task em execução | State = "Running" ou "Ready" | ⬜ |
| 3 | Diretório existe | `Test-Path C:\CyberShield` | ⬜ |
| 4 | Script presente | `Get-ChildItem C:\CyberShield\*.ps1` | ⬜ |
| 5 | Logs criados | `Test-Path C:\CyberShield\logs\` | ⬜ |
| 6 | Dashboard: Online | Status verde no dashboard (< 5 min) | ⬜ |
| 7 | Dashboard: Versão | Mostra v4.1.2 | ⬜ |
| 8 | Dashboard: Métricas | CPU/RAM/Disk atualizando | ⬜ |

---

## 🚨 Troubleshooting

### Erro: "Cannot create secure SSL/TLS channel"

```powershell
# Solução: Habilitar TLS 1.2 manualmente
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Reexecutar instalação
irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/KEY" | iex
```

### Erro: "Enrollment key invalid or expired"

1. Verifique se a chave não expirou (validade de 24h)
2. Verifique se ainda há usos disponíveis (max_uses)
3. Gere uma nova chave no dashboard

### Erro: "Access Denied" ou "Execution Policy"

```powershell
# Executar como Administrador:
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
```

### Agente não aparece online

1. Verificar se a task está executando:
   ```powershell
   Start-ScheduledTask -TaskName "CyberShieldAgent"
   ```

2. Verificar logs por erros:
   ```powershell
   Get-Content "C:\CyberShield\logs\agent.log" -Tail 50
   ```

3. Verificar conectividade:
   ```powershell
   Test-NetConnection -ComputerName "iavbnmduxpxhwubqrzzn.supabase.co" -Port 443
   ```

### Logs mostram "401 Unauthorized"

Isso indica token inválido. Execute reinstalação completa:
1. Execute limpeza manual (Fase 1)
2. Gere **nova** enrollment key
3. Execute instalação (Fase 2)

---

## 📊 Progresso da Reinstalação

| Agent | Versão Anterior | Versão Nova | Data | Responsável | Status |
|-------|----------------|-------------|------|-------------|--------|
| PC-Servidor | v4.0.10 | v4.1.2 | | | ⬜ Pendente |
| pcteste2 | v4.0.10 | v4.1.2 | | | ⬜ Pendente |
| Pcteste1 | v4.0.10 | v4.1.2 | | | ⬜ Offline |
| TESTEBMG | v4.0.10 | v4.1.2 | | | ⬜ Offline |
| TESTEMIT | v4.0.10 | v4.1.2 | | | ⬜ Offline |

---

## 🎯 Resultado Esperado

Após completar todas as reinstalações:

- ✅ Todos os agentes na versão **v4.1.2**
- ✅ **Auto-update funcional** para versões futuras
- ✅ **14 job types** operacionais
- ✅ **Browser history** sendo coletado
- ✅ **Ed25519** signature verification ativo
- ✅ **Rollback automático** configurado

---

## 📞 Suporte

Se encontrar problemas durante a reinstalação:

1. **Coletar logs:** `Get-Content C:\CyberShield\logs\agent.log -Tail 100 > $env:TEMP\agent-logs.txt`
2. **Coletar info do sistema:** `Get-ComputerInfo | Out-File $env:TEMP\system-info.txt`
3. **Capturar screenshot** do erro
4. **Enviar** os arquivos para suporte técnico

---

**Documento criado por:** CyberShield Team  
**Última atualização:** 2025-06-22
