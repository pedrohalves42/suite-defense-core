// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 2.0.0 - Enhanced TLS and auto-credential detection

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstalacao com Preservacao de Credenciais
# Version: 2.0.0
# Descricao: Reinstala o agente preservando identidade, credenciais e historico
#
# USO:
#   Automatico (detecta credenciais do script existente):
#     irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
#
#   Manual (fornece credenciais):
#     .\\reinstall-agent-preserve.ps1 -AgentName "nome" -AgentToken "uuid" -HmacSecret "hex64"

param(
    [string]\$AgentName,
    [string]\$AgentToken,
    [string]\$HmacSecret,
    [string]\$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

# CRITICAL: Force TLS 1.2 for Windows Server 2012/2016 compatibility
# PowerShell uses TLS 1.0 by default but Supabase requires TLS 1.2+
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

\$ErrorActionPreference = "Stop"
\$InstallDir = "C:\\CyberShield"
\$LogDir = "\$InstallDir\\logs"
\$BackupDir = "\$InstallDir\\backup"
\$TaskName = "CyberShieldAgent"
\$ScriptVersion = "2.0.0"

function Write-Status {
    param([string]\$Message, [string]\$Type = "INFO")
    \$color = switch (\$Type) {
        "INFO"    { "Cyan" }
        "SUCCESS" { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "White" }
    }
    \$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[\$timestamp] [\$Type] \$Message" -ForegroundColor \$color
}

function Get-HmacSha256 {
    param([string]\$Message, [string]\$Secret)
    \$hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    \$hmacsha.Key = [System.Text.Encoding]::UTF8.GetBytes(\$Secret)
    \$hash = \$hmacsha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(\$Message))
    return [BitConverter]::ToString(\$hash).Replace("-", "").ToLower()
}

function Test-TlsConnection {
    param([string]\$Url)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        \$request = [System.Net.HttpWebRequest]::Create(\$Url)
        \$request.Method = "HEAD"
        \$request.Timeout = 10000
        \$response = \$request.GetResponse()
        \$response.Close()
        return \$true
    } catch {
        return \$false
    }
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CyberShield Agent - Reinstalacao Preservando Identidade" -ForegroundColor Cyan
Write-Host "  Version: \$ScriptVersion" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Check Administrator privileges
\$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not \$isAdmin) {
    Write-Status "This script must run as Administrator!" "ERROR"
    Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Test TLS connectivity
Write-Status "Testing TLS 1.2 connectivity..." "INFO"
if (Test-TlsConnection -Url "\$ServerUrl/functions/v1/health") {
    Write-Status "TLS 1.2 connection successful" "SUCCESS"
} else {
    Write-Status "TLS connection test failed - continuing anyway..." "WARN"
}

# ============================================================
# PHASE 1: Detect Existing Agent
# ============================================================
Write-Host ""
Write-Status "=== PHASE 1/6: Detect Existing Agent ===" "INFO"

\$existingScript = \$null
\$detectedAgentName = \$null
\$detectedAgentToken = \$null
\$detectedHmacSecret = \$null
\$detectedServerUrl = \$null

# Search for existing script
\$scriptPattern = Join-Path \$InstallDir "cybershield-agent-*.ps1"
\$existingScripts = Get-ChildItem -Path \$scriptPattern -ErrorAction SilentlyContinue

if (\$existingScripts -and \$existingScripts.Count -gt 0) {
    \$existingScript = \$existingScripts | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Status "Script found: \$(\$existingScript.Name)" "SUCCESS"
    
    # Extract agent name from filename
    if (\$existingScript.Name -match 'cybershield-agent-(.+)\\.ps1\$') {
        \$detectedAgentName = \$Matches[1]
        Write-Status "Agent name detected: \$detectedAgentName" "SUCCESS"
    }
    
    # Read content and extract credentials
    \$scriptContent = Get-Content \$existingScript.FullName -Raw
    
    # Extract AgentToken
    if (\$scriptContent -match '\\\$AgentToken\\s*=\\s*[''"]([^''"]+)[''"]') {
        \$detectedAgentToken = \$Matches[1]
        Write-Status "AgentToken detected: \$(\$detectedAgentToken.Substring(0,8))..." "SUCCESS"
    }
    
    # Extract HmacSecret
    if (\$scriptContent -match '\\\$HmacSecret\\s*=\\s*[''"]([^''"]+)[''"]') {
        \$detectedHmacSecret = \$Matches[1]
        Write-Status "HmacSecret detected: \$(\$detectedHmacSecret.Substring(0,8))..." "SUCCESS"
    }
    
    # Extract ServerUrl
    if (\$scriptContent -match '\\\$ServerUrl\\s*=\\s*[''"]([^''"]+)[''"]') {
        \$detectedServerUrl = \$Matches[1]
        Write-Status "ServerUrl detected: \$detectedServerUrl" "SUCCESS"
    }
} else {
    Write-Status "No existing script found in \$InstallDir" "WARN"
}

# Use provided or detected parameters
if (-not \$AgentName -and \$detectedAgentName) { \$AgentName = \$detectedAgentName }
if (-not \$AgentToken -and \$detectedAgentToken) { \$AgentToken = \$detectedAgentToken }
if (-not \$HmacSecret -and \$detectedHmacSecret) { \$HmacSecret = \$detectedHmacSecret }
if (-not \$ServerUrl -and \$detectedServerUrl) { \$ServerUrl = \$detectedServerUrl }

# Validate credentials
if (-not \$AgentName -or -not \$AgentToken -or -not \$HmacSecret) {
    Write-Status "Incomplete credentials!" "ERROR"
    Write-Host ""
    Write-Host "Required credentials:" -ForegroundColor Yellow
    Write-Host "  - AgentName:  \$(if(\$AgentName){'OK'}else{'MISSING'})" -ForegroundColor \$(if(\$AgentName){'Green'}else{'Red'})
    Write-Host "  - AgentToken: \$(if(\$AgentToken){'OK'}else{'MISSING'})" -ForegroundColor \$(if(\$AgentToken){'Green'}else{'Red'})
    Write-Host "  - HmacSecret: \$(if(\$HmacSecret){'OK'}else{'MISSING'})" -ForegroundColor \$(if(\$HmacSecret){'Green'}else{'Red'})
    Write-Host ""
    Write-Host "Run with manual parameters:" -ForegroundColor Yellow
    Write-Host '  .\\reinstall-agent-preserve.ps1 -AgentName "name" -AgentToken "uuid" -HmacSecret "hex64"' -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Credentials to be used:" -ForegroundColor Cyan
Write-Host "  AgentName:  \$AgentName" -ForegroundColor White
Write-Host "  AgentToken: \$(\$AgentToken.Substring(0,8))..." -ForegroundColor White
Write-Host "  HmacSecret: \$(\$HmacSecret.Substring(0,8))..." -ForegroundColor White
Write-Host "  ServerUrl:  \$ServerUrl" -ForegroundColor White

# ============================================================
# PHASE 2: Stop Services
# ============================================================
Write-Host ""
Write-Status "=== PHASE 2/6: Stop Services ===" "INFO"

# Stop Scheduled Tasks
\$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
foreach (\$task in \$tasks) {
    Write-Status "Stopping task: \$(\$task.TaskName)" "INFO"
    Stop-ScheduledTask -TaskName \$task.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName \$task.TaskName -Confirm:\$false -ErrorAction SilentlyContinue
    Write-Status "Task removed: \$(\$task.TaskName)" "SUCCESS"
}

# Kill agent PowerShell processes
\$agentProcesses = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | 
    Where-Object { \$_.CommandLine -like "*CyberShield*" -or \$_.CommandLine -like "*cybershield*" }

foreach (\$proc in \$agentProcesses) {
    Write-Status "Terminating PowerShell process (PID: \$(\$proc.ProcessId))" "INFO"
    Stop-Process -Id \$proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# ============================================================
# PHASE 3: Backup
# ============================================================
Write-Host ""
Write-Status "=== PHASE 3/6: Backup ===" "INFO"

if (-not (Test-Path \$BackupDir)) {
    New-Item -ItemType Directory -Path \$BackupDir -Force | Out-Null
}

if (\$existingScript) {
    \$backupName = "cybershield-agent-\$AgentName-backup-\$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    \$backupPath = Join-Path \$BackupDir \$backupName
    Copy-Item \$existingScript.FullName \$backupPath -Force
    Write-Status "Backup created: \$backupPath" "SUCCESS"
} else {
    Write-Status "No script to backup" "INFO"
}

# ============================================================
# PHASE 4: Download Updated Script
# ============================================================
Write-Host ""
Write-Status "=== PHASE 4/6: Download Updated Script ===" "INFO"

# Prepare HMAC request
\$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
\$nonce = [Guid]::NewGuid().ToString()
\$method = "GET"
\$path = "/functions/v1/serve-agent-update"
\$body = ""

# Calculate HMAC
\$message = "\$method\`n\$path\`n\$timestamp\`n\$nonce\`n\$body"
\$signature = Get-HmacSha256 -Message \$message -Secret \$HmacSecret

Write-Status "Requesting updated script from server..." "INFO"

\$newScriptContent = \$null
\$newVersion = "v5.0.1"

try {
    # Force TLS 1.2 again before request
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    \$headers = @{
        "X-Agent-Token" = \$AgentToken
        "X-HMAC-Signature" = \$signature
        "X-Timestamp" = \$timestamp
        "X-Nonce" = \$nonce
        "Content-Type" = "application/json"
    }
    
    \$url = "\$ServerUrl\$path"
    Write-Status "URL: \$url" "INFO"
    
    \$response = Invoke-RestMethod -Uri \$url -Method GET -Headers \$headers -TimeoutSec 60
    
    if (-not \$response.script_content -and -not \$response.script_content_base64) {
        if (\$response.message -eq "Already up to date") {
            Write-Status "Agent already at latest version: \$(\$response.current_version)" "SUCCESS"
            Write-Status "Reinstallation will continue with existing script..." "INFO"
            
            if (\$existingScript) {
                \$newScriptContent = Get-Content \$existingScript.FullName -Raw
                \$newVersion = \$response.current_version
            } else {
                throw "No script available for reinstall"
            }
        } else {
            throw "Server did not return script: \$(\$response.message)"
        }
    } else {
        # Use server script
        if (\$response.script_content_base64) {
            \$newScriptContent = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(\$response.script_content_base64))
            Write-Status "Script downloaded via Base64" "SUCCESS"
        } else {
            \$newScriptContent = \$response.script_content
            Write-Status "Script downloaded via text" "SUCCESS"
        }
        \$newVersion = \$response.version
        
        Write-Status "Downloaded version: \$newVersion" "SUCCESS"
        Write-Status "Size: \$(\$newScriptContent.Length) bytes" "INFO"
    }
} catch {
    Write-Status "Failed to download script: \$(\$_.Exception.Message)" "WARN"
    
    if (\$existingScript) {
        Write-Status "Using existing script for reinstallation..." "WARN"
        \$newScriptContent = Get-Content \$existingScript.FullName -Raw
        \$newVersion = "existing"
    } else {
        Write-Status "No fallback script available" "ERROR"
        exit 1
    }
}

# ============================================================
# PHASE 5: Reinstall
# ============================================================
Write-Host ""
Write-Status "=== PHASE 5/6: Reinstall ===" "INFO"

# Remove old scripts
\$oldScripts = Get-ChildItem -Path "\$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue
foreach (\$script in \$oldScripts) {
    Remove-Item \$script.FullName -Force -ErrorAction SilentlyContinue
    Write-Status "Removed: \$(\$script.Name)" "INFO"
}

# Create required directories
if (-not (Test-Path \$InstallDir)) {
    New-Item -ItemType Directory -Path \$InstallDir -Force | Out-Null
}
if (-not (Test-Path \$LogDir)) {
    New-Item -ItemType Directory -Path \$LogDir -Force | Out-Null
}

# Save new script
\$newScriptPath = Join-Path \$InstallDir "cybershield-agent-\$AgentName.ps1"
[System.IO.File]::WriteAllText(\$newScriptPath, \$newScriptContent, [System.Text.Encoding]::UTF8)
Write-Status "Script installed: \$newScriptPath" "SUCCESS"

# Create Scheduled Task
\$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"\$newScriptPath\`""
\$taskTrigger = New-ScheduledTaskTrigger -AtStartup
\$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Seconds 30)
\$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

\$fullTaskName = "\$TaskName-\$AgentName"
Register-ScheduledTask -TaskName \$fullTaskName -Action \$taskAction -Trigger \$taskTrigger -Settings \$taskSettings -Principal \$taskPrincipal -Force | Out-Null
Write-Status "Scheduled Task created: \$fullTaskName" "SUCCESS"

# ============================================================
# PHASE 6: Start Agent
# ============================================================
Write-Host ""
Write-Status "=== PHASE 6/6: Start Agent ===" "INFO"

Start-ScheduledTask -TaskName \$fullTaskName
Write-Status "Agent started" "SUCCESS"

# Wait for initialization
Start-Sleep -Seconds 5

# Check status
\$task = Get-ScheduledTask -TaskName \$fullTaskName -ErrorAction SilentlyContinue
if (\$task) {
    Write-Status "Task status: \$(\$task.State)" "INFO"
}

# Check logs
\$logFile = Join-Path \$LogDir "agent.log"
if (Test-Path \$logFile) {
    Write-Host ""
    Write-Host "Last log lines:" -ForegroundColor Cyan
    Write-Host ("-" * 60) -ForegroundColor Gray
    Get-Content \$logFile -Tail 10 | ForEach-Object { Write-Host "  \$_" -ForegroundColor Gray }
    Write-Host ("-" * 60) -ForegroundColor Gray
}

# ============================================================
# Final Summary
# ============================================================
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  REINSTALLATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Agent Name: \$AgentName" -ForegroundColor White
Write-Host "  Version: \$newVersion" -ForegroundColor White
Write-Host "  Script: \$newScriptPath" -ForegroundColor White
Write-Host "  Task: \$fullTaskName" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Check dashboard if agent shows as 'online'" -ForegroundColor Gray
Write-Host "  2. Check logs: Get-Content \$logFile -Tail 50 -Wait" -ForegroundColor Gray
Write-Host "  3. Verify heartbeat in dashboard" -ForegroundColor Gray
Write-Host ""
`;
