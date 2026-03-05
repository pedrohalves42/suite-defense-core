# Procedimento de Reinstalação de Agentes v3

## Problema: Bootstrap Problem

Agentes instalados com versões **v3.10.14 e anteriores** possuem um problema estrutural:
- O handler `update_agent` procura o script em `C:\CyberShield\cybershield-agent-v3.ps1` (path hardcoded)
- O instalador salva scripts como `C:\CyberShield\cybershield-agent-{agent_name}.ps1`
- Resultado: auto-update **sempre falha** com "arquivo não encontrado"

## Solução: Reinstalação Única

A reinstalação manual é necessária **uma única vez**. Após reinstalar com v3.10.25+, todos os auto-updates futuros funcionarão normalmente.

---

## Método 1: Script de Reinstalação (Recomendado)

### Passo 1: Gerar Nova URL de Instalação

1. Acesse o dashboard: `/admin/agent-installer`
2. Clique em "Gerar Enrollment Key"
3. Copie o comando de instalação completo

### Passo 2: Executar Script de Reinstalação

```powershell
# Baixar e executar script de reinstalação
# Substitua NOVA_ENROLLMENT_KEY pela key gerada no passo anterior

$InstallerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?key=NOVA_ENROLLMENT_KEY"

# 1. Parar processos e scheduled tasks
Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
}

# 2. Remover pasta de instalação antiga
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue

# 3. Executar novo instalador
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm $InstallerUrl | iex
```

---

## Método 2: Comandos Manuais (Passo a Passo)

### Passo 1: Cleanup Completo

```powershell
# Executar como Administrador

# 1. Parar processos
Get-WmiObject Win32_Process -Filter "CommandLine LIKE '%cybershield-agent%'" | ForEach-Object { 
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue 
}

# 2. Remover Scheduled Tasks
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

# 3. Remover pasta de instalação
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
```

### Passo 2: Nova Instalação

```powershell
# TLS 1.2 obrigatório
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Executar instalador (substitua pela URL do dashboard)
irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?key=SUA_KEY" | iex
```

---

## Método 3: One-Liner (Cleanup + Instalação)

```powershell
# Substitua SUA_KEY pela enrollment key gerada no dashboard
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Remove-Item "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue; irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?key=SUA_KEY" | iex
```

---

## Método 4: Script Automatizado (Para Múltiplos Agentes)

Salve como `Reinstall-CyberShield.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$InstallerUrl,
    [switch]$DryRun
)

Function Log([string]$msg) {
    $t = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$t] $msg"
}

if ($DryRun) { Log "DRY RUN: Nenhuma alteração será feita." }

# 1. Parar scheduled tasks
Try {
    $tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like '*CyberShield*' }
    foreach ($t in $tasks) {
        Log "Parando Task: $($t.TaskName)"
        if (-not $DryRun) { 
            Stop-ScheduledTask -TaskName $t.TaskName -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $t.TaskName -Confirm:$false -ErrorAction SilentlyContinue
        }
    }
} Catch { Log "Erro ao manipular ScheduledTasks: $_" }

# 2. Remover pasta
$agentPath = 'C:\CyberShield'
if (Test-Path $agentPath) {
    Log "Removendo pasta $agentPath"
    if (-not $DryRun) { Remove-Item -Path $agentPath -Recurse -Force -ErrorAction SilentlyContinue }
}

# 3. Executar instalador
Log "Executando instalador..."
if (-not $DryRun) {
    Try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        iex (Invoke-WebRequest -UseBasicParsing -Uri $InstallerUrl -ErrorAction Stop).Content
        Log "Instalação iniciada com sucesso."
    } Catch { Log "Falha ao executar instalador: $_" }
}

Log "Script finalizado. Verifique o dashboard para confirmar."
```

**Uso:**
```powershell
# Teste (sem alterações)
.\Reinstall-CyberShield.ps1 -InstallerUrl "https://..." -DryRun

# Execução real
.\Reinstall-CyberShield.ps1 -InstallerUrl "https://..."
```

---

## Validação Pós-Instalação

### 1. Verificar Scheduled Task
```powershell
Get-ScheduledTask -TaskName "CyberShield*" | Format-List TaskName, State, LastRunTime
```

### 2. Verificar Versão do Script
```powershell
Select-String -Path "C:\CyberShield\*.ps1" -Pattern "AgentVersion" | Select-Object -First 1
```

### 3. Verificar Log
```powershell
Get-Content "C:\CyberShield\agent.log" -Tail 20
```

### 4. Verificar Heartbeat no Dashboard
- Acesse `/admin/dashboard`
- Confirme que o agente aparece como **online**
- Confirme versão **v3.10.25-BLOCKED-WEBSITES** ou superior

---

## Diagnóstico de Problemas

### Script de Diagnóstico Rápido
```powershell
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-diagnostic-script | iex
```

### Logs Relevantes
```powershell
# Log do agente
Get-Content "C:\CyberShield\agent.log" -Tail 50

# Log do instalador
Get-Content "C:\CyberShield\installer.log" -Tail 50

# Eventos do Windows
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 20 | 
    Where-Object { $_.Message -like "*CyberShield*" }
```

---

## Status dos Agentes (Atualizado)

| Agente | Versão Atual | Status | Ação Necessária |
|--------|--------------|--------|-----------------|
| testepc2 | v3.10.21 | Online | **Reinstalar agora** |
| PC-Servidor | v3.10.21 | Online | **Reinstalar agora** |
| TESTEMIT | v3.10.21 | Offline | Reinstalar quando voltar |
| TESTEBMG | v3.10.21 | Offline | Reinstalar quando voltar |
| teste | v3.10.21 | Offline | Reinstalar quando voltar |
| PC-Thiago | v3.10.21 | Offline | Reinstalar quando voltar |
| teste3 | v3.10.21 | Offline | Reinstalar quando voltar |
| PC-Copia | v3.10.21 | Offline | Reinstalar quando voltar |
| NB-Thiago | v3.10.21 | Offline | Reinstalar quando voltar |
| TESTETESTE123 | v3.10.21 | Offline | Reinstalar quando voltar |
| THIAGO | v3.10.21 | Offline | Reinstalar quando voltar |
| DESKTOP-NN3I5L5 | v3.10.21 | Offline | Reinstalar quando voltar |

---

## Importante: Jobs `reinstall_agent`

**NÃO use jobs `reinstall_agent` para agentes v3.10.21 ou anteriores!**

Agentes nessas versões não possuem o handler `reinstall_agent` e retornarão erro:
```
Tipo de job nao suportado: reinstall_agent
```

A única solução é **reinstalação manual** conforme descrito acima.

Após reinstalação com v3.10.25+, jobs `reinstall_agent` funcionarão normalmente para atualizações futuras.

---

## Prevenção Futura

Após reinstalação com v3.10.25+:
- ✅ Auto-update funcionará normalmente
- ✅ Path dinâmico detecta script automaticamente
- ✅ Fallback múltiplo: PSCommandPath → AgentName → Glob → Create New
- ✅ Scheduled Task recriada com path correto
- ✅ Handler `reinstall_agent` disponível para remediação remota

---

## Suporte

Se problemas persistirem após reinstalação:
1. Execute o script de diagnóstico
2. Colete logs do agente e instalador
3. Verifique conectividade com o servidor
4. Entre em contato com suporte técnico
