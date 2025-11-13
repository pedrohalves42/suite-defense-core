# CyberShield Agent - Windows Installation Script v3.0.0-APEX
# Auto-generated: {{TIMESTAMP}}
# APEX BUILD - Universal, Robust, Production-Ready

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.0.0-APEX" -ForegroundColor Cyan
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
$PollInterval = 60  # ✅ FASE 1.1: Definido explicitamente

# Validar parâmetros
if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "{{AGENT_TOKEN}}") {
    Write-Host "ERRO: Token do agente não configurado" -ForegroundColor Red
    Write-Host "Por favor, gere um novo instalador através do dashboard web" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Diretório de instalação - ✅ FASE 1.1: Path unificado
$InstallDir = "C:\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

# ✅ FASE 1.1: Função de log de instalação
function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

try {
    Write-InstallLog "[1/8] Criando diretórios de instalação..."
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Write-InstallLog "✓ Diretórios criados com sucesso"

    # ✅ FASE 1.2: Configurar proxy e TLS globalmente
    Write-InstallLog "[2/8] Configurando rede (TLS 1.2 + Proxy)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    $proxyUri = $proxy.GetProxy((New-Object System.Uri("https://www.google.com")))
    
    if ($proxyUri -ne "https://www.google.com") {
        Write-InstallLog "Proxy detectado: $proxyUri"
        [System.Net.WebRequest]::DefaultWebProxy = $proxy
        [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
    } else {
        Write-InstallLog "Nenhum proxy detectado - conexão direta"
    }
    Write-InstallLog "✓ TLS 1.2 habilitado e proxy configurado"

    # ✅ FASE 1.3: Health check inicial
    Write-InstallLog "[3/8] Testando conectividade com backend..."
    $healthCheck = $false
    $healthUrls = @(
        "$ServerUrl/functions/v1/heartbeat",
        "$ServerUrl/functions/v1/post-installation-telemetry",
        "https://www.google.com"
    )

    foreach ($url in $healthUrls) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method OPTIONS -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            Write-InstallLog "✓ Conectividade OK: $url (Status: $($response.StatusCode))"
            $healthCheck = $true
            break
        } catch {
            Write-InstallLog "✗ Falha ao conectar: $url - $_"
        }
    }

    if (-not $healthCheck) {
        Write-Host ""
        Write-Host "⚠ AVISO: Não foi possível conectar ao backend." -ForegroundColor Yellow
        Write-Host "Possíveis causas:" -ForegroundColor Yellow
        Write-Host "  1. Firewall bloqueando HTTPS (porta 443)" -ForegroundColor Gray
        Write-Host "  2. Proxy corporativo não configurado" -ForegroundColor Gray
        Write-Host "  3. Servidor backend offline" -ForegroundColor Gray
        Write-Host ""
        $continue = Read-Host "Continuar instalação mesmo assim? (S/N)"
        if ($continue -ne "S") {
            Write-InstallLog "Instalação cancelada pelo usuário (sem conectividade)"
            exit 1
        }
    }

    Write-InstallLog "[4/8] Baixando script do agente..."
    
    # Conteúdo do script do agente (embedded)
    $AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

    # Salvar script do agente
    Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force
    Write-InstallLog "✓ Script do agente salvo em: $AgentScript"

    Write-InstallLog "[5/8] Configurando regra de firewall..."
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
        Write-InstallLog "✓ Regra de firewall configurada"
    } catch {
        Write-InstallLog "⚠ Não foi possível criar regra de firewall: $($_.Exception.Message)"
    }

    Write-InstallLog "[6/8] Criando tarefa agendada..."

    $taskName = "CyberShield Agent"
    $taskDescription = "CyberShield Security Agent - Monitora o sistema e reporta ao servidor central"

    # Remover tarefa existente se presente
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-InstallLog "  Removendo tarefa antiga..."
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Criar ação - ✅ FASE 1.1: $PollInterval agora definido
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

    Write-InstallLog "✓ Tarefa agendada criada com sucesso"

    Write-InstallLog "[7/8] Iniciando o agente..."

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
    Write-Host "  • Logs de instalação: $InstallLog" -ForegroundColor White
    Write-Host "  • Tarefa: $taskName" -ForegroundColor White
    Write-Host "  • Última execução: $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host ""
    Write-Host "O AGENTE ESTÁ:" -ForegroundColor Cyan
    Write-Host "  ✓ Monitorando este sistema" -ForegroundColor White
    Write-Host "  ✓ Enviando heartbeats a cada 60 segundos" -ForegroundColor White
    Write-Host "  ✓ Reportando métricas a cada 5 minutos" -ForegroundColor White
    Write-Host "  ✓ Buscando jobs para executar" -ForegroundColor White
    Write-Host ""

    # ✅ FASE 2: Enviar telemetria EXPANDIDA pós-instalação
    Write-InstallLog "[8/10] Enviando telemetria DETALHADA pós-instalação..."
    try {
        # Validar se tarefa agendada foi criada e está rodando
        $taskExists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        $taskIsRunning = ($taskExists -and $taskExists.State -eq "Running")
        
        # Validar se script do agente existe
        $scriptExists = Test-Path $AgentScript
        $scriptSize = if ($scriptExists) { (Get-Item $AgentScript).Length } else { 0 }
        
        # Testar conectividade detalhada
        $telemetryTests = @{
            health_check_passed = $healthCheck
            proxy_detected = ($proxyUri -ne "https://www.google.com")
            dns_test = (Test-Connection -ComputerName "google.com" -Count 1 -Quiet -ErrorAction SilentlyContinue)
            api_test = try {
                $testResponse = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/heartbeat" `
                    -Method GET -TimeoutSec 5 -ErrorAction Stop
                $true
            } catch { $false }
        }
        
        $telemetryBody = @{
            agent_name = "{{AGENT_NAME}}"
            success = $true
            os_version = (Get-WmiObject Win32_OperatingSystem).Caption
            installation_time = (Get-Date).ToUniversalTime().ToString("o")
            network_tests = $telemetryTests
            firewall_status = if (Get-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue) { "configured" } else { "not_configured" }
            task_created = ($taskExists -ne $null)
            task_running = $taskIsRunning
            script_exists = $scriptExists
            script_size_bytes = $scriptSize
            powershell_version = "$($PSVersionTable.PSVersion.Major).$($PSVersionTable.PSVersion.Minor)"
        } | ConvertTo-Json -Depth 10
        
        Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" `
            -Method POST `
            -Body $telemetryBody `
            -ContentType "application/json" `
            -TimeoutSec 15 `
            -ErrorAction Stop | Out-Null
        
        Write-InstallLog "✓ Telemetria EXPANDIDA enviada com sucesso"
    } catch {
        Write-InstallLog "⚠ Telemetria falhou: $($_.Exception.Message)"
        Write-InstallLog "   Stack: $($_.ScriptStackTrace)"
    }

    # ✅ FASE 2: Validação Pós-Instalação com Retry
    Write-InstallLog "[9/10] Validando inicialização do agente (aguardando 15s)..."
    Start-Sleep -Seconds 15
    
    $validationAttempts = 0
    $maxAttempts = 3
    $agentInitialized = $false
    
    while ($validationAttempts -lt $maxAttempts -and -not $agentInitialized) {
        $validationAttempts++
        Write-InstallLog "  Tentativa $validationAttempts/$maxAttempts de validação..."
        
        # Verificar se log do agente foi criado
        if (Test-Path "$LogDir\agent.log") {
            $logContent = Get-Content "$LogDir\agent.log" -Tail 20 -ErrorAction SilentlyContinue
            
            if ($logContent -match "Heartbeat sent successfully|AGENTE INICIALIZADO COM SUCESSO") {
                Write-InstallLog "  ✓ Agente iniciou e está operacional!"
                $agentInitialized = $true
            } elseif ($logContent -match "ERROR|ERRO|CRITICAL") {
                Write-InstallLog "  ✗ Agente iniciou mas reportou ERROS:"
                $logContent | Where-Object { $_ -match "ERROR|ERRO|CRITICAL" } | ForEach-Object {
                    Write-InstallLog "    $_"
                }
                break
            }
        }
        
        if (-not $agentInitialized -and $validationAttempts -lt $maxAttempts) {
            Start-Sleep -Seconds 10
        }
    }
    
    if (-not $agentInitialized) {
        Write-Host ""
        Write-Host "⚠ AVISO: Não foi possível confirmar inicialização do agente" -ForegroundColor Yellow
        Write-Host "Verifique os logs manualmente:" -ForegroundColor Yellow
        Write-Host "  Get-Content $LogDir\agent.log -Tail 50" -ForegroundColor Gray
        Write-Host ""
    }

    # ✅ FASE 2: DIAGNÓSTICO FINAL DE INSTALAÇÃO
    Write-InstallLog "[10/10] DIAGNÓSTICO FINAL DE INSTALAÇÃO..."
    
    $diagnosticReport = @"

========================================
RELATÓRIO DE DIAGNÓSTICO
========================================
Timestamp: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

INSTALAÇÃO:
  ✓ Diretório criado: $InstallDir
  ✓ Script do agente: $AgentScript ($(if (Test-Path $AgentScript) { "OK" } else { "FALTANDO" }))
  ✓ Logs: $LogDir

TAREFA AGENDADA:
  Nome: $taskName
  Estado: $(if ($task) { $task.State } else { "NÃO ENCONTRADA" })
  Última execução: $($taskInfo.LastRunTime)
  Próxima execução: $($taskInfo.NextRunTime)

FIREWALL:
  Regra: $(if (Get-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue) { "CONFIGURADA" } else { "NÃO CONFIGURADA" })

CONECTIVIDADE:
  Health Check: $(if ($healthCheck) { "SUCESSO" } else { "FALHOU" })
  DNS: $(if (Test-Connection google.com -Count 1 -Quiet -ErrorAction SilentlyContinue) { "OK" } else { "FALHOU" })
  Proxy: $(if ($proxyUri -ne "https://www.google.com") { "DETECTADO: $proxyUri" } else { "NÃO DETECTADO" })

AGENTE:
  Log existe: $(Test-Path "$LogDir\agent.log")
  Inicializado: $(if ($agentInitialized) { "SIM ✓" } else { "VERIFICAÇÃO FALHOU ✗" })

TROUBLESHOOTING:
  1. Ver logs do agente:
     Get-Content $LogDir\agent.log -Tail 50
  
  2. Ver logs de instalação:
     Get-Content $InstallLog
  
  3. Verificar tarefa:
     Get-ScheduledTask -TaskName "$taskName" | Format-List
  
  4. Testar conectividade:
     Test-NetConnection -ComputerName $($ServerUrl -replace "https://","" -replace "/.*","") -Port 443

========================================
"@
    
    Write-Host $diagnosticReport
    Write-InstallLog $diagnosticReport
    
    Write-Host ""
    if ($agentInitialized) {
        Write-Host "✅ INSTALAÇÃO CONCLUÍDA E VALIDADA!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  INSTALAÇÃO CONCLUÍDA MAS VALIDAÇÃO INCOMPLETA" -ForegroundColor Yellow
        Write-Host "Por favor, verifique os logs acima para troubleshooting" -ForegroundColor Yellow
    }
    Write-Host ""

    # ✅ FASE 1.4: Instalador "Keep-Alive" - monitorar agente por 60 segundos
    Write-Host ""
    Write-Host "Instalação concluída! Monitorando agente por 60 segundos..." -ForegroundColor Cyan
    Write-Host "Feche esta janela a qualquer momento." -ForegroundColor Gray
    Write-Host ""

    for ($i = 1; $i -le 12; $i++) {
        Start-Sleep -Seconds 5
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
        
        Write-Host "[$i/12] Task Status: $($task.State) | Last Result: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
        
        if ($task.State -eq "Running") {
            Write-Host "✓ Agente está rodando!" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "Monitoramento concluído. Instalador será fechado em 10 segundos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

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
