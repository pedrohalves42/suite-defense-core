# CyberShield Agent - Windows Installation Script v3.1.0-HARDENED
# Auto-generated: {{TIMESTAMP}}
# Hardened Build - Production-Ready with Self-Test & Auto-Cleanup

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.1.0-HARDENED" -ForegroundColor Cyan
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

# Log credentials (prefixes only for security)
$TokenPrefix = $AgentToken.Substring(0, 8)
$HmacPrefix = $HmacSecret.Substring(0, 8)
Write-Host "[INFO] AgentToken: $TokenPrefix... HmacSecret: $HmacPrefix..." -ForegroundColor Gray

# Diretório de instalação
$InstallDir = "C:\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

# Função de log de instalação
function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

# ========================================
# FASE 1: CLEANUP DE INSTALAÇÕES ANTIGAS
# ========================================
Write-Host ""
Write-Host "[1/6] Limpando instalações anteriores..." -ForegroundColor Yellow

# Parar e remover tasks antigas
$oldTasks = Get-ScheduledTask | Where-Object { $_.TaskName -match 'CyberShield' }
if ($oldTasks) {
    Write-InstallLog "Encontradas $($oldTasks.Count) task(s) antiga(s)"
    foreach ($task in $oldTasks) {
        try {
            Write-InstallLog "  Removendo task: $($task.TaskName)"
            Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
        } catch {
            Write-InstallLog "  Aviso: Erro ao remover $($task.TaskName): $($_.Exception.Message)"
        }
    }
} else {
    Write-InstallLog "Nenhuma task antiga encontrada"
}

# Matar processos antigos do agente
$oldProcesses = Get-CimInstance Win32_Process | Where-Object { 
    $_.CommandLine -match 'cybershield-agent' 
}
if ($oldProcesses) {
    Write-InstallLog "Encontrados $($oldProcesses.Count) processo(s) antigo(s)"
    foreach ($proc in $oldProcesses) {
        try {
            Write-InstallLog "  Encerrando PID $($proc.ProcessId)"
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        } catch {
            Write-InstallLog "  Aviso: Erro ao encerrar PID $($proc.ProcessId)"
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-InstallLog "Nenhum processo antigo encontrado"
}

Write-Host "✅ Limpeza concluída" -ForegroundColor Green

# ========================================
# FASE 2: FUNÇÕES AUXILIARES
# ========================================

# Função de telemetria de erros
function Send-ErrorTelemetry {
    param(
        [string]$ErrorMessage,
        [string]$ErrorType,
        [string]$StackTrace
    )
    
    Write-InstallLog "Enviando telemetria de erro ($ErrorType)..."
    
    # Capturar logs de instalação existentes
    $installLogs = @()
    if (Test-Path $InstallLog) {
        $installLogs = Get-Content $InstallLog -ErrorAction SilentlyContinue | Select-Object -Last 50
    }
    
    $telemetryPayload = @{
        agent_token = $AgentToken
        agent_name = $env:COMPUTERNAME
        success = $false
        platform = "windows"
        installation_time_seconds = 0
        installation_method = "powershell"
        error_type = $ErrorType
        error_message = $ErrorMessage
        installation_logs = @{
            stdout = $installLogs
            stderr = @($StackTrace)
        }
        system_info = @{
            os_version = [System.Environment]::OSVersion.VersionString
            powershell_version = "$($PSVersionTable.PSVersion.Major).$($PSVersionTable.PSVersion.Minor)"
            hostname = $env:COMPUTERNAME
            admin_privileges = $isAdmin
            tls_enabled = ([Net.ServicePointManager]::SecurityProtocol -band [Net.SecurityProtocolType]::Tls12) -eq [Net.SecurityProtocolType]::Tls12
        }
        network_tests = @{
            health_check_passed = $false
            proxy_detected = $false
            dns_test = $false
            api_test = $false
        }
        errors = @{
            type = $ErrorType
            message = $ErrorMessage
            stack = $StackTrace
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
        }
    } | ConvertTo-Json -Depth 10 -Compress
    
    try {
        Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" `
            -Method POST `
            -Body $telemetryPayload `
            -ContentType "application/json" `
            -TimeoutSec 10 `
            -ErrorAction Stop | Out-Null
        Write-InstallLog "✓ Telemetria de erro enviada com sucesso"
    } catch {
        Write-InstallLog "⚠ Falha ao enviar telemetria de erro: $_"
        # Não bloquear instalação por falha de telemetria
    }
}

# ✅ TELEMETRIA: Parser de tipo de erro
function Get-ErrorType {
    param([string]$ErrorMessage)
    
    switch -Regex ($ErrorMessage) {
        '401|unauthorized|Unauthorized' { return 'http_401_unauthorized' }
        '403|forbidden|Forbidden' { return 'http_403_forbidden' }
        '404|not found|Not Found' { return 'http_404_not_found' }
        '500|internal server|Internal Server' { return 'http_500_server_error' }
        '502|bad gateway|Bad Gateway' { return 'http_502_bad_gateway' }
        '503|service unavailable|Service Unavailable' { return 'http_503_unavailable' }
        'TLS|SSL|certificate|secure channel' { return 'tls_ssl_error' }
        'proxy|407' { return 'proxy_error' }
        'timeout|timed out' { return 'network_timeout' }
        'DNS|name resolution|could not be resolved' { return 'dns_resolution_error' }
        'Cannot call a method on a null-valued expression|null' { return 'null_reference_error' }
        'Access is denied|permission denied' { return 'permission_denied' }
        'execution policy|ExecutionPolicy' { return 'execution_policy_error' }
        'not recognized as the name of a cmdlet' { return 'cmdlet_not_found' }
        default { return 'script_error' }
    }
}

try {
    Write-InstallLog "[2/7] Criando diretórios de instalação..."
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Write-InstallLog "✓ Diretórios criados com sucesso"

    # ✅ FASE 1.2: Configurar proxy e TLS globalmente
    Write-InstallLog "[3/7] Configurando rede (TLS 1.2 + Proxy)..."
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
    Write-InstallLog "[4/7] Testando conectividade com backend..."
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

    Write-InstallLog "[5/7] Criando tarefa agendada..."

    $taskName = "CyberShield Agent"
    $taskDescription = "CyberShield Security Agent - Monitora o sistema e reporta ao servidor central"

    # Remover tarefa existente se presente
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-InstallLog "  Removendo tarefa antiga..."
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Usar caminho absoluto do PowerShell 64-bit
    $PowerShellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    
    # Criar ação
    $action = New-ScheduledTaskAction -Execute $PowerShellExe `
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

    # ========================================
    # FASE 3: SELF-TEST DE CONECTIVIDADE
    # ========================================
    Write-Host ""
    Write-Host "[6/6] Executando self-test de conectividade..." -ForegroundColor Yellow
    Write-InstallLog "[Self-Test] Validando credenciais com backend..."
    
    # Log credentials being tested (prefixes only)
    Write-InstallLog "[Self-Test] Token: $TokenPrefix... | HMAC: $HmacPrefix..."
    
    try {
        # Construir timestamp e nonce para HMAC
        $timestamp = [Math]::Floor((Get-Date).ToUniversalTime().Subtract((Get-Date "1970-01-01")).TotalSeconds).ToString()
        $nonce = [guid]::NewGuid().ToString()
        
        # Construir payload para HMAC (vazio para heartbeat)
        $payload = ""
        
        # Calcular HMAC-SHA256
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = [System.Text.Encoding]::UTF8.GetBytes($HmacSecret)
        $dataToSign = "$AgentToken|$timestamp|$nonce|$payload"
        $signature = [Convert]::ToBase64String($hmacsha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($dataToSign)))
        
        # Headers para autenticação
        $headers = @{
            "X-Agent-Token" = $AgentToken
            "X-Signature" = $signature
            "X-Timestamp" = $timestamp
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        # Tentar heartbeat
        $selfTestUrl = "$ServerUrl/functions/v1/heartbeat"
        Write-InstallLog "[Self-Test] Chamando $selfTestUrl"
        
        $response = Invoke-RestMethod -Uri $selfTestUrl `
            -Method POST `
            -Headers $headers `
            -Body '{}' `
            -TimeoutSec 15 `
            -ErrorAction Stop
        
        Write-Host "✅ Self-test PASSOU - Credenciais validadas!" -ForegroundColor Green
        Write-InstallLog "[Self-Test] ✅ HTTP 200 - Autenticação bem-sucedida"
        Write-InstallLog "[Self-Test] Response: $($response | ConvertTo-Json -Compress)"
        
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorBody = ""
        
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errorBody = $reader.ReadToEnd()
                $reader.Close()
            } catch {}
        }
        
        Write-Host "❌ Self-test FALHOU!" -ForegroundColor Red
        Write-InstallLog "[Self-Test] ❌ HTTP $statusCode - $($_.Exception.Message)"
        
        if ($statusCode -eq 401) {
            Write-Host ""
            Write-Host "================================================" -ForegroundColor Red
            Write-Host "ERRO CRÍTICO: TOKEN OU HMAC SECRET INVÁLIDOS" -ForegroundColor Red
            Write-Host "================================================" -ForegroundColor Red
            Write-Host ""
            Write-Host "O instalador foi gerado com credenciais incorretas." -ForegroundColor Yellow
            Write-Host "Token usado: $TokenPrefix..." -ForegroundColor Yellow
            Write-Host "HMAC usado: $HmacPrefix..." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "SOLUÇÃO:" -ForegroundColor Cyan
            Write-Host "  1. Volte ao dashboard (/admin/agent-installer)" -ForegroundColor White
            Write-Host "  2. Gere um NOVO instalador para este agente" -ForegroundColor White
            Write-Host "  3. Execute o novo instalador" -ForegroundColor White
            Write-Host ""
            
            # Remover a tarefa criada (inútil com credenciais erradas)
            Write-InstallLog "[Self-Test] Removendo tarefa inválida..."
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
            
            Write-InstallLog "[Self-Test] Instalação ABORTADA devido a credenciais inválidas"
            Read-Host "Pressione Enter para sair"
            exit 401
        }
        
        Write-Host "⚠️  Self-test falhou mas instalação continuará" -ForegroundColor Yellow
        Write-Host "    Código HTTP: $statusCode" -ForegroundColor Gray
        Write-Host "    Erro: $($_.Exception.Message)" -ForegroundColor Gray
        Write-InstallLog "[Self-Test] Aviso: Self-test falhou mas não bloqueará instalação"
    }

    Write-Host ""
    Write-Host "[7/7] Iniciando o agente..." -ForegroundColor Yellow

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
    Write-InstallLog "[7/7] Enviando telemetria pós-instalação..."
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
    Write-InstallLog "[7/7] Validando inicialização do agente (aguardando 15s)..."
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
    Write-InstallLog "[7/7] DIAGNÓSTICO FINAL DE INSTALAÇÃO..."
    
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
        Write-Host "Por favor, verifique os logs: $LogDir\agent.log" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Agente instalado e validado com sucesso!" -ForegroundColor Green
    Write-Host "Você pode fechar esta janela ou aguardar fechamento automático." -ForegroundColor Gray
    Write-Host ""
    
    # Aguardar 10 segundos antes de fechar
    Start-Sleep -Seconds 10

} catch {
    # ✅ TELEMETRIA DE ERROS: Capturar e enviar erro ao backend
    $errorMessage = $_.Exception.Message
    $stackTrace = $_.ScriptStackTrace
    $errorType = Get-ErrorType -ErrorMessage $errorMessage
    
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Red
    Write-Host "ERRO DURANTE A INSTALAÇÃO" -ForegroundColor Red
    Write-Host "==================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalhes do erro:" -ForegroundColor Yellow
    Write-Host $errorMessage -ForegroundColor Red
    Write-Host ""
    Write-Host "Tipo de erro detectado: $errorType" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $stackTrace -ForegroundColor Gray
    Write-Host ""
    
    # Enviar telemetria de erro (não bloquear se falhar)
    Write-Host "Enviando telemetria de erro ao backend..." -ForegroundColor Cyan
    try {
        Send-ErrorTelemetry -ErrorMessage $errorMessage `
                           -ErrorType $errorType `
                           -StackTrace $stackTrace
        Write-Host "✓ Telemetria de erro enviada" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Não foi possível enviar telemetria: $_" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Para suporte, entre em contato:" -ForegroundColor Yellow
    Write-Host "  Email: gamehousetecnologia@gmail.com" -ForegroundColor White
    Write-Host "  WhatsApp: (34) 98443-2835" -ForegroundColor White
    Write-Host ""
    Write-Host "INFORMAÇÕES PARA DIAGNÓSTICO:" -ForegroundColor Cyan
    Write-Host "  • Tipo de erro: $errorType" -ForegroundColor White
    Write-Host "  • Log de instalação: $InstallLog" -ForegroundColor White
    Write-Host "  • PowerShell versão: $($PSVersionTable.PSVersion)" -ForegroundColor White
    Write-Host "  • OS: [System.Environment]::OSVersion.VersionString" -ForegroundColor White
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}
