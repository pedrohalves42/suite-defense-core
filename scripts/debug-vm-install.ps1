#Requires -RunAsAdministrator

<#
.SYNOPSIS
    CyberShield Installation Diagnostic Tool
.DESCRIPTION
    Comprehensive diagnostic script to troubleshoot agent installation issues on Windows VMs.
    Tests environment, permissions, connectivity, and executes installer with detailed logging.
.PARAMETER InstallerPath
    Path to the installer script (default: .\install-testevm.ps1)
.PARAMETER ServerUrl
    Backend server URL (default: production Supabase URL)
.PARAMETER AgentToken
    Agent authentication token (UUID format)
.PARAMETER HmacSecret
    HMAC secret for request signing (64 hex characters)
.PARAMETER AgentName
    Name of the agent to install
.EXAMPLE
    .\debug-vm-install.ps1 -AgentToken "abc123..." -HmacSecret "def456..." -AgentName "myvm01"
#>

param(
    [string]$InstallerPath = ".\install-testevm.ps1",
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co",
    [Parameter(Mandatory=$false)]
    [string]$AgentToken = "COLOCAR_TOKEN_AQUI",
    [Parameter(Mandatory=$false)]
    [string]$HmacSecret = "COLOCAR_HMAC_64_HEX_AQUI",
    [string]$AgentName = "testevm"
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== CyberShield Installation Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# ============================================
# CHECK 1: Verify Administrator Privileges
# ============================================
Write-Host "[1/8] Verificando privilegios..." -ForegroundColor Yellow
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-Host "  [OK]  Executando como Administrador" -ForegroundColor Green
} else {
    Write-Host "  [ERROR]  NAO esta executando como Administrador" -ForegroundColor Red
    Write-Host "  [WARN] ?  Este script DEVE ser executado como Administrador" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Por favor, execute novamente com 'Executar como Administrador'" -ForegroundColor Yellow
    exit 1
}

# ============================================
# CHECK 2: PowerShell Environment
# ============================================
Write-Host "[2/8] Verificando PowerShell..." -ForegroundColor Yellow
Write-Host "  Versao: $($PSVersionTable.PSVersion.Major).$($PSVersionTable.PSVersion.Minor)" -ForegroundColor Gray
Write-Host "  ExecutionPolicy: $(Get-ExecutionPolicy)" -ForegroundColor Gray
Write-Host "  Edition: $($PSVersionTable.PSEdition)" -ForegroundColor Gray

if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "  [WARN] ?  PowerShell 5.1+ recomendado (versao atual: $($PSVersionTable.PSVersion))" -ForegroundColor Yellow
} else {
    Write-Host "  [OK]  Versao adequada do PowerShell" -ForegroundColor Green
}

# ============================================
# CHECK 3: Installer File Validation
# ============================================
Write-Host "[3/8] Verificando arquivo do instalador..." -ForegroundColor Yellow
if (Test-Path $InstallerPath) {
    Write-Host "  [OK]  Arquivo existe: $InstallerPath" -ForegroundColor Green
    
    # Get file size
    $fileSize = (Get-Item $InstallerPath).Length
    Write-Host "  Tamanho: $([math]::Round($fileSize/1KB, 2)) KB" -ForegroundColor Gray
    
    # Check for Zone.Identifier (file downloaded from internet and blocked)
    try {
        $streams = Get-Item $InstallerPath -Stream * -ErrorAction SilentlyContinue
        $hasZoneId = $streams | Where-Object { $_.Stream -eq 'Zone.Identifier:$DATA' }
        
        if ($hasZoneId) {
            Write-Host "  [WARN] ?  Arquivo esta BLOQUEADO (baixado da internet)" -ForegroundColor Yellow
            Write-Host "  Executando: Unblock-File..." -ForegroundColor Gray
            Unblock-File $InstallerPath
            Write-Host "  [OK]  Arquivo desbloqueado" -ForegroundColor Green
        } else {
            Write-Host "  [OK]  Arquivo nao esta bloqueado" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] ?  Nao foi possivel verificar Zone.Identifier: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    # Check file content for basic validity
    $firstLine = Get-Content $InstallerPath -First 1 -ErrorAction SilentlyContinue
    if ($firstLine -match '#Requires -RunAsAdministrator') {
        Write-Host "  [OK]  Script tem requisito de Admin (valido)" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] ?  Script pode nao ter requisito de Admin" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [ERROR]  Arquivo NAO encontrado: $InstallerPath" -ForegroundColor Red
    Write-Host "  Certifique-se de que o arquivo do instalador existe no caminho especificado." -ForegroundColor Yellow
    exit 1
}

# ============================================
# CHECK 4: Network Connectivity to Backend
# ============================================
Write-Host "[4/8] Testando conectividade com backend..." -ForegroundColor Yellow
try {
    $healthUrl = "$ServerUrl/functions/v1/health"
    Write-Host "  Testando: $healthUrl" -ForegroundColor Gray
    
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    
    if ($response.StatusCode -eq 200) {
        Write-Host "  [OK]  Health check: HTTP $($response.StatusCode)" -ForegroundColor Green
        
        # Try to parse response
        try {
            $healthData = $response.Content | ConvertFrom-Json
            if ($healthData.status) {
                Write-Host "  Status: $($healthData.status)" -ForegroundColor Gray
            }
        } catch {
            # Content may not be JSON
        }
    } else {
        Write-Host "  [WARN] ?  Health check: HTTP $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [ERROR]  Falha na conexao com o backend" -ForegroundColor Red
    Write-Host "  Erro: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -match "nao foi possivel resolver") {
        Write-Host "  ? Problema de DNS - verifique conectividade com a internet" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -match "timeout") {
        Write-Host "  ? Timeout - firewall ou proxy pode estar bloqueando" -ForegroundColor Yellow
    }
}

# ============================================
# CHECK 5: Validate Agent Credentials
# ============================================
Write-Host "[5/8] Validando credenciais do agente..." -ForegroundColor Yellow

if ($AgentToken -eq "COLOCAR_TOKEN_AQUI" -or [string]::IsNullOrWhiteSpace($AgentToken)) {
    Write-Host "  [WARN] ?  AgentToken nao configurado (usando placeholder)" -ForegroundColor Yellow
    Write-Host "  ? Execute com: -AgentToken '<seu-token-uuid>'" -ForegroundColor Cyan
} else {
    Write-Host "  AgentToken (primeiros 8 chars): $($AgentToken.Substring(0, [Math]::Min(8, $AgentToken.Length)))..." -ForegroundColor Gray
    
    # Validate UUID format
    if ($AgentToken -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
        Write-Host "  [OK]  Token formato UUID valido" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR]  Token NAO e um UUID valido" -ForegroundColor Red
    }
}

if ($HmacSecret -eq "COLOCAR_HMAC_64_HEX_AQUI" -or [string]::IsNullOrWhiteSpace($HmacSecret)) {
    Write-Host "  [WARN] ?  HmacSecret nao configurado (usando placeholder)" -ForegroundColor Yellow
    Write-Host "  ? Execute com: -HmacSecret '<seu-hmac-64-hex>'" -ForegroundColor Cyan
} else {
    Write-Host "  HmacSecret (primeiros 8 chars): $($HmacSecret.Substring(0, [Math]::Min(8, $HmacSecret.Length)))..." -ForegroundColor Gray
    
    # Validate HMAC format (64 hex chars)
    if ($HmacSecret -match '^[0-9a-f]{64}$') {
        Write-Host "  [OK]  HMAC formato SHA256-HEX valido (64 chars)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR]  HMAC NAO e SHA256-HEX valido (deve ter 64 caracteres hexadecimais)" -ForegroundColor Red
        Write-Host "  Tamanho atual: $($HmacSecret.Length) chars" -ForegroundColor Gray
    }
}

Write-Host "  AgentName: $AgentName" -ForegroundColor Gray

# ============================================
# CHECK 6: Test Directory Creation
# ============================================
Write-Host "[6/8] Testando criacao de pasta..." -ForegroundColor Yellow
try {
    $testPath = "C:\CyberShield\test-diagnostic"
    New-Item -ItemType Directory -Path $testPath -Force -ErrorAction Stop | Out-Null
    Write-Host "  [OK]  Pasta criada: $testPath" -ForegroundColor Green
    
    # Try to write a test file
    $testFile = Join-Path $testPath "test.txt"
    "Diagnostic test" | Out-File -FilePath $testFile -Force -ErrorAction Stop
    Write-Host "  [OK]  Arquivo de teste criado" -ForegroundColor Green
    
    # Cleanup
    Remove-Item $testPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK]  Limpeza concluida" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR]  Erro ao criar pasta/arquivo de teste" -ForegroundColor Red
    Write-Host "  Erro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  ? Verifique permissoes no disco C:" -ForegroundColor Yellow
}

# ============================================
# CHECK 7: Check Existing Installation
# ============================================
Write-Host "[7/8] Verificando instalacoes existentes..." -ForegroundColor Yellow

$existingPath = "C:\CyberShield"
if (Test-Path $existingPath) {
    Write-Host "  [WARN] ?  Pasta C:\CyberShield ja existe" -ForegroundColor Yellow
    
    # Check for agent script
    $agentScripts = Get-ChildItem -Path $existingPath -Filter "cybershield-agent*.ps1" -ErrorAction SilentlyContinue
    if ($agentScripts) {
        Write-Host "  [WARN] ?  Scripts de agente encontrados: $($agentScripts.Count)" -ForegroundColor Yellow
        $agentScripts | ForEach-Object { Write-Host "    - $($_.Name)" -ForegroundColor Gray }
    }
    
    # Check for scheduled task
    $existingTasks = Get-ScheduledTask -TaskName "CyberShieldAgent*" -ErrorAction SilentlyContinue
    if ($existingTasks) {
        Write-Host "  [WARN] ?  Scheduled Tasks encontradas: $($existingTasks.Count)" -ForegroundColor Yellow
        $existingTasks | ForEach-Object { 
            Write-Host "    - $($_.TaskName) (Estado: $($_.State))" -ForegroundColor Gray
        }
    }
    
    # Check for running processes
    $agentProcesses = Get-Process -Name "*cybershield*" -ErrorAction SilentlyContinue
    if ($agentProcesses) {
        Write-Host "  [WARN] ?  Processos do agente em execucao: $($agentProcesses.Count)" -ForegroundColor Yellow
        $agentProcesses | ForEach-Object {
            Write-Host "    - PID $($_.Id): $($_.ProcessName)" -ForegroundColor Gray
        }
    }
    
    Write-Host "  ? Considere fazer limpeza manual antes de reinstalar:" -ForegroundColor Cyan
    Write-Host "     Stop-Process -Name '*cybershield*' -Force" -ForegroundColor Gray
    Write-Host "     Unregister-ScheduledTask -TaskName 'CyberShieldAgent*' -Confirm:`$false" -ForegroundColor Gray
    Write-Host "     Remove-Item -Path 'C:\CyberShield' -Recurse -Force" -ForegroundColor Gray
} else {
    Write-Host "  [OK]  Nenhuma instalacao previa encontrada" -ForegroundColor Green
}

# ============================================
# CHECK 8: Execute Installer with Detailed Logging
# ============================================
Write-Host "[8/8] Executando instalador com log detalhado..." -ForegroundColor Yellow
Write-Host ""
Write-Host "---------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = "C:\install-debug-$timestamp.log"

Write-Host "Log sera salvo em: $logFile" -ForegroundColor Cyan
Write-Host ""

try {
    # Execute installer with verbose output and capture everything
    $installerArgs = @(
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile',
        '-File', $InstallerPath,
        '-ServerUrl', $ServerUrl,
        '-AgentToken', $AgentToken,
        '-HmacSecret', $HmacSecret,
        '-AgentName', $AgentName,
        '-Verbose'
    )
    
    # Start transcript to capture everything
    Start-Transcript -Path $logFile -Append
    
    & powershell.exe @installerArgs *>&1 | Tee-Object -FilePath $logFile -Append
    
    Stop-Transcript
    
    Write-Host ""
    Write-Host "---------------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[OK]  Execucao concluida" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "---------------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[ERROR]  Erro durante execucao do instalador" -ForegroundColor Red
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log parcial salvo em: $logFile" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Diagnostico Concluido ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "? Proximos passos:" -ForegroundColor Yellow
Write-Host "  1. Revisar log completo:" -ForegroundColor White
Write-Host "     notepad $logFile" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Verificar se pasta foi criada:" -ForegroundColor White
Write-Host "     Test-Path C:\CyberShield" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Verificar scheduled task:" -ForegroundColor White
Write-Host "     Get-ScheduledTask -TaskName 'CyberShieldAgent*'" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Ver logs do agente:" -ForegroundColor White
Write-Host "     Get-Content C:\CyberShield\logs\agent.log -Tail 50" -ForegroundColor Gray
Write-Host ""
Write-Host "  5. Testar heartbeat manualmente:" -ForegroundColor White
Write-Host "     Get-Content C:\CyberShield\logs\installer.log" -ForegroundColor Gray
Write-Host ""
