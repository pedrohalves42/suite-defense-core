# CyberShield Agent - Windows Installation Script (FIXED)
# Auto-generated: {{TIMESTAMP}}
# Version: 2.2.1 - Corrigido para Windows 10/11

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v2.2.1" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar privilégios de administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERRO: Este script requer privilégios de administrador" -ForegroundColor Red
    Write-Host "Clique direito no arquivo e selecione 'Executar como Administrador'" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Verificar versão do PowerShell
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "ERRO: Este script requer PowerShell 5.1 ou superior" -ForegroundColor Red
    Write-Host "Versão atual: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Configuração
$AgentToken = "{{AGENT_TOKEN}}"
$HmacSecret = "{{HMAC_SECRET}}"
$ServerUrl = "{{SERVER_URL}}"
$PollInterval = 60

# Validar parâmetros
if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "{{AGENT_TOKEN}}") {
    Write-Host "ERRO: Token do agente não configurado" -ForegroundColor Red
    Write-Host "Por favor, gere um novo instalador através do dashboard web" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Diretório de instalação
$InstallDir = "C:\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"

try {
    Write-Host "[1/6] Criando diretórios de instalação..." -ForegroundColor Green
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Write-Host "✓ Diretórios criados com sucesso" -ForegroundColor Green

    Write-Host "[2/6] Baixando script do agente..." -ForegroundColor Green
    
    # Conteúdo do script do agente (embedded)
    $AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

    # Salvar script do agente
    Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force
    Write-Host "✓ Script do agente salvo em: $AgentScript" -ForegroundColor Green

    Write-Host "[3/6] Testando conectividade com o servidor..." -ForegroundColor Green
    try {
        # Configurar TLS 1.2 (necessário para Windows Server 2012+)
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        
        $testUrl = "$ServerUrl/functions/v1/heartbeat"
        $response = Invoke-WebRequest -Uri $testUrl -Method OPTIONS -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        Write-Host "✓ Servidor está acessível" -ForegroundColor Green
    } catch {
        Write-Host "⚠ AVISO: Não foi possível conectar ao servidor" -ForegroundColor Yellow
        Write-Host "  Erro: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  O agente tentará reconectar automaticamente após a instalação" -ForegroundColor Yellow
    }

    Write-Host "[4/6] Configurando regra de firewall..." -ForegroundColor Green
    try {
        # Remover regras antigas se existirem
        $existingRule = Get-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        if ($existingRule) {
            Remove-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        }
        
        # Criar nova regra de firewall
        New-NetFirewallRule -DisplayName "CyberShield Agent" `
                           -Direction Outbound `
                           -Action Allow `
                           -Protocol TCP `
                           -RemotePort 443 `
                           -Program "powershell.exe" `
                           -Description "Permite comunicação do CyberShield Agent com o servidor" `
                           -ErrorAction Stop | Out-Null
        Write-Host "✓ Regra de firewall configurada" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Não foi possível criar regra de firewall: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    Write-Host "[5/6] Criando tarefa agendada..." -ForegroundColor Green

    $taskName = "CyberShield Agent"
    $taskDescription = "CyberShield Security Agent - Monitora o sistema e reporta ao servidor central"

    # Remover tarefa existente se presente
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "  Removendo tarefa antiga..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Criar ação
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$AgentScript`" -AgentToken `"$AgentToken`" -HmacSecret `"$HmacSecret`" -ServerUrl `"$ServerUrl`" -PollInterval $PollInterval"

    # Criar trigger (na inicialização do sistema)
    $trigger = New-ScheduledTaskTrigger -AtStartup

    # Criar configurações
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 365)

    # Criar principal (executar como SYSTEM com privilégios máximos)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    # Registrar tarefa
    Register-ScheduledTask `
        -TaskName $taskName `
        -Description $taskDescription `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host "✓ Tarefa agendada criada com sucesso" -ForegroundColor Green

    Write-Host "[6/6] Iniciando o agente..." -ForegroundColor Green

    # Iniciar a tarefa
    Start-ScheduledTask -TaskName $taskName

    # Aguardar um momento para a tarefa iniciar
    Start-Sleep -Seconds 3

    # Verificar se a tarefa está rodando
    $task = Get-ScheduledTask -TaskName $taskName
    $taskState = $task.State
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName

    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "✓ INSTALAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""

    if ($taskState -eq "Running") {
        Write-Host "Status do Agente: " -NoNewline
        Write-Host "RODANDO" -ForegroundColor Green
    } else {
        Write-Host "Status do Agente: " -NoNewline
        Write-Host "$taskState" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "INFORMAÇÕES DA INSTALAÇÃO:" -ForegroundColor Cyan
    Write-Host "  • Diretório: $InstallDir" -ForegroundColor White
    Write-Host "  • Logs: $LogDir\agent.log" -ForegroundColor White
    Write-Host "  • Tarefa: $taskName" -ForegroundColor White
    Write-Host "  • Última execução: $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host ""
    Write-Host "O AGENTE ESTÁ:" -ForegroundColor Cyan
    Write-Host "  ✓ Monitorando este sistema" -ForegroundColor White
    Write-Host "  ✓ Enviando heartbeats a cada 60 segundos" -ForegroundColor White
    Write-Host "  ✓ Reportando métricas a cada 5 minutos" -ForegroundColor White
    Write-Host "  ✓ Buscando jobs para executar" -ForegroundColor White
    Write-Host ""
    Write-Host "COMANDOS ÚTEIS:" -ForegroundColor Yellow
    Write-Host "  Ver logs:" -ForegroundColor White
    Write-Host "    Get-Content $LogDir\agent.log -Tail 50" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Parar o agente:" -ForegroundColor White
    Write-Host "    Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Iniciar o agente:" -ForegroundColor White
    Write-Host "    Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Status da tarefa:" -ForegroundColor White
    Write-Host "    Get-ScheduledTask -TaskName '$taskName' | Format-List" -ForegroundColor Gray
    Write-Host ""

    if ($taskState -ne "Running") {
        Write-Host "ATENÇÃO: O agente não está rodando no momento." -ForegroundColor Yellow
        Write-Host "Para iniciar manualmente, execute:" -ForegroundColor Yellow
        Write-Host "  Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
        Write-Host ""
    }

    # Fix #2: Código de validação pós-instalação DENTRO do try block
    Write-Host ""
    Write-Host "VALIDAÇÃO PÓS-INSTALAÇÃO (Opcional):" -ForegroundColor Cyan
    Write-Host "  Para validar se o agente está funcionando 100%:" -ForegroundColor White
    Write-Host "  1. Aguarde 2 minutos para o agente iniciar" -ForegroundColor White
    Write-Host "  2. Execute: .\post-installation-validation.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Pressione Enter para sair..." -ForegroundColor Gray
    Read-Host

} catch {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Red
    Write-Host "ERRO DURANTE A INSTALAÇÃO" -ForegroundColor Red
    Write-Host "==================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalhes do erro:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    Write-Host "Para suporte, entre em contato:" -ForegroundColor Yellow
    Write-Host "  Email: gamehousetecnologia@gmail.com" -ForegroundColor White
    Write-Host "  WhatsApp: (34) 98443-2835" -ForegroundColor White
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}
