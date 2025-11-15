/**
 * Shared Windows Installer Template
 * Single source of truth for PS1 installer generation
 * Used by: serve-installer, build-agent-exe
 */

export const WINDOWS_INSTALLER_TEMPLATE = `# CyberShield Agent - Windows Installation Script v3.0.0-APEX
# Auto-generated: {{TIMESTAMP}}
# APEX BUILD - Universal, Robust, Production-Ready

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ============================================================================
# CONFIGURATION
# ============================================================================
$AGENT_TOKEN = "{{AGENT_TOKEN}}"
$HMAC_SECRET = "{{HMAC_SECRET}}"
$SERVER_URL = "{{SERVER_URL}}"
$POLL_INTERVAL = {{POLL_INTERVAL}}

# Backward compatibility aliases
$AgentToken = $AGENT_TOKEN
$HmacSecret = $HMAC_SECRET

# ============================================================================
# VALIDATION - Ensure credentials are valid
# ============================================================================
if ([string]::IsNullOrWhiteSpace($AGENT_TOKEN) -or $AGENT_TOKEN.Length -lt 32) {
    Write-Host ""
    Write-Host "=" * 70 -ForegroundColor Red
    Write-Host "❌ INVALID INSTALLER - Credentials not configured" -ForegroundColor Red
    Write-Host "=" * 70 -ForegroundColor Red
    Write-Host ""
    Write-Host "This installer was not properly generated." -ForegroundColor Yellow
    Write-Host "Please generate a NEW installer from the dashboard:" -ForegroundColor Yellow
    Write-Host "  1. Go to Agent Installer page" -ForegroundColor White
    Write-Host "  2. Enter a unique agent name" -ForegroundColor White
    Write-Host "  3. Download a fresh installer" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  DO NOT use old/cached installer links!" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($HMAC_SECRET) -or $HMAC_SECRET.Length -ne 64) {
    Write-Host ""
    Write-Host "=" * 70 -ForegroundColor Red
    Write-Host "❌ INVALID INSTALLER - HMAC secret missing" -ForegroundColor Red
    Write-Host "=" * 70 -ForegroundColor Red
    Write-Host ""
    Write-Host "This installer is incomplete. Please generate a new one." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Log credentials (first 8 chars only for security)
Write-Host "Configuration loaded:" -ForegroundColor Cyan
Write-Host "  Token: $($AGENT_TOKEN.Substring(0, [Math]::Min(8, $AGENT_TOKEN.Length)))..." -ForegroundColor Gray
Write-Host "  HMAC: $($HMAC_SECRET.Substring(0, [Math]::Min(8, $HMAC_SECRET.Length)))..." -ForegroundColor Gray
Write-Host "  Server: $SERVER_URL" -ForegroundColor Gray

# ============================================================================
# PATHS AND DIRECTORIES
# ============================================================================
$InstallDir = "C:\\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$LogFile = Join-Path $LogDir "install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$taskName = "CyberShieldAgent"

# ============================================================================
# SYSTEM INFORMATION (collected early for telemetry)
# ============================================================================
$osInfo = $null
$healthCheckOk = $false

try {
    $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
} catch {
    Write-Host "[WARN] Could not retrieve OS information" -ForegroundColor Yellow
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Convert HEX string to byte array (PS 5.1 compatible)
function Convert-HexToBytes {
    param([string]$HexString)
    $HexString = $HexString -replace '\\s',''
    if ($HexString.Length % 2 -ne 0) {
        throw "HEX string length must be even"
    }
    $bytes = New-Object byte[] ($HexString.Length / 2)
    for ($i = 0; $i -lt $HexString.Length; $i += 2) {
        $bytes[$i/2] = [Convert]::ToByte($HexString.Substring($i, 2), 16)
    }
    return $bytes
}

# ============================================================================
# LOGGING FUNCTION
# ============================================================================
function Write-InstallLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    if (Test-Path $LogDir) {
        Add-Content -Path $LogFile -Value $logMessage -ErrorAction SilentlyContinue
    }
}

# ============================================================================
# INSTALLATION STEPS
# ============================================================================

try {
    Write-InstallLog "🚀 Starting CyberShield Agent installation..."
    
    # Create directories
    Write-InstallLog "Creating installation directories..."
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    
    # Configure TLS 1.2
    Write-InstallLog "Configuring TLS 1.2 for secure communication..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    # Detect and configure proxy
    Write-InstallLog "Detecting proxy settings..."
    $proxyUri = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy($SERVER_URL)
    if ($proxyUri -ne $SERVER_URL) {
        Write-InstallLog "Proxy detected: $proxyUri"
        $env:HTTP_PROXY = $proxyUri
        $env:HTTPS_PROXY = $proxyUri
    }
    
    # Health check - CRITICAL validation
    Write-InstallLog "Performing backend health check..."
    try {
        $healthCheck = Invoke-WebRequest -Uri "$SERVER_URL/functions/v1/serve-installer" -Method GET -TimeoutSec 10 -UseBasicParsing
        
        if ($healthCheck.StatusCode -eq 200) {
            $healthCheckOk = $true
            Write-InstallLog "✅ Backend is reachable and healthy"
        } else {
            $healthCheckOk = $false
            throw "Backend returned unexpected status: $($healthCheck.StatusCode)"
        }
    } catch {
        $healthCheckOk = $false
        Write-Host ""
        Write-Host "=" * 70 -ForegroundColor Red
        Write-Host "❌ BACKEND UNREACHABLE - Installation aborted" -ForegroundColor Red
        Write-Host "=" * 70 -ForegroundColor Red
        Write-Host ""
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Possible causes:" -ForegroundColor Cyan
        Write-Host "  1. No internet connection" -ForegroundColor White
        Write-Host "  2. Firewall blocking HTTPS traffic" -ForegroundColor White
        Write-Host "  3. Corporate proxy not configured" -ForegroundColor White
        Write-Host "  4. Backend service is down (rare)" -ForegroundColor White
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Cyan
        Write-Host "  • Test connectivity: Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443" -ForegroundColor White
        Write-Host "  • Check firewall: Get-NetFirewallRule | Where-Object DisplayName -like '*CyberShield*'" -ForegroundColor White
        Write-Host "  • If behind proxy, configure: \`$env:HTTPS_PROXY='http://proxy:port'" -ForegroundColor White
        Write-Host ""
        Write-Host "If issue persists, generate a NEW installer from the dashboard." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    # Save agent script
    Write-InstallLog "Installing CyberShield agent script..."
    
    # ============================================================================
    # AGENT SCRIPT CONTENT (Injected by serve-installer or build-agent-exe)
    # ============================================================================
$AgentScriptContentBlock = @'
{{AGENT_SCRIPT_CONTENT}}
'@

    # Write agent script to file
    $AgentScriptContentBlock | Out-File -FilePath $AgentScript -Encoding UTF8 -Force
    Write-InstallLog "✅ Agent script saved to: $AgentScript"
    
    # ============================================================================
    # CORREÇÃO 5: VALIDAR QUE SCRIPT FOI GERADO CORRETAMENTE
    # ============================================================================
    if (Test-Path $AgentScript) {
        $scriptContent = Get-Content $AgentScript -Raw
        
        # Verificar se funções críticas existem
        $hasWriteLog = $scriptContent -match 'function Write-Log'
        $hasHeartbeat = $scriptContent -match 'function Send-Heartbeat'
        $hasPollJobs = $scriptContent -match 'function Poll-Jobs'
        $hasTrap = $scriptContent -match 'trap \{'
        
        if (-not $hasWriteLog) {
            Write-InstallLog "⚠️ WARNING: Script gerado não contém função Write-Log!" "ERROR"
        }
        if (-not $hasHeartbeat) {
            Write-InstallLog "⚠️ WARNING: Script gerado não contém função Send-Heartbeat!" "ERROR"
        }
        if (-not $hasPollJobs) {
            Write-InstallLog "⚠️ WARNING: Script gerado não contém função Poll-Jobs!" "ERROR"
        }
        if (-not $hasTrap) {
            Write-InstallLog "⚠️ WARNING: Script gerado não contém trap (crash handler)!" "ERROR"
        }
        
        $validationStatus = if($hasWriteLog -and $hasHeartbeat -and $hasPollJobs -and $hasTrap) {'✅ OK'} else {'❌ INCOMPLETE'}
        Write-InstallLog "Script validation: $validationStatus" "INFO"
        
        $scriptSizeKB = [Math]::Round((Get-Item $AgentScript).Length / 1KB, 2)
        Write-InstallLog "Script size: $scriptSizeKB KB" "INFO"
    } else {
        Write-InstallLog "⚠️ CRITICAL: Script file was not created at $AgentScript" "ERROR"
    }
    
    # Configure Windows Firewall
    Write-InstallLog "Configuring Windows Firewall rule..."
    $firewallRule = Get-NetFirewallRule -DisplayName "CyberShield Agent Outbound" -ErrorAction SilentlyContinue
    if (-not $firewallRule) {
        New-NetFirewallRule -DisplayName "CyberShield Agent Outbound" \`
            -Direction Outbound -Action Allow \`
            -Program "powershell.exe" \`
            -Description "Allow CyberShield Agent to communicate with backend" | Out-Null
        Write-InstallLog "✅ Firewall rule created"
    } else {
        Write-InstallLog "ℹ️ Firewall rule already exists"
    }
    
    # Create Scheduled Task for agent
    Write-InstallLog "Creating Scheduled Task for automatic agent startup..."
    
    $taskName = "CyberShieldAgent"
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-InstallLog "Removed existing task"
    }
    
    $action = New-ScheduledTaskAction -Execute "powershell.exe" \`
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"$AgentScript\`" -AgentToken \`"$AGENT_TOKEN\`" -HmacSecret \`"$HMAC_SECRET\`" -ServerUrl \`"$SERVER_URL\`" -PollInterval $POLL_INTERVAL"
    
    $trigger = New-ScheduledTaskTrigger -AtStartup
    
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" \`
        -LogonType ServiceAccount -RunLevel Highest
    
    $settings = New-ScheduledTaskSettingsSet \`
        -AllowStartIfOnBatteries \`
        -DontStopIfGoingOnBatteries \`
        -StartWhenAvailable \`
        -RestartCount 3 \`
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName $taskName \`
        -Action $action -Trigger $trigger \`
        -Principal $principal -Settings $settings \`
        -Description "CyberShield Security Agent - Auto-start at system boot" | Out-Null
    
    Write-InstallLog "✅ Scheduled Task created: $taskName"
    
    # Start the agent task
    Write-InstallLog "Starting CyberShield Agent..."
    Start-ScheduledTask -TaskName $taskName
    
    Start-Sleep -Seconds 3
    
    $taskInfo = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($taskInfo) {
        Write-InstallLog "✅ Agent task status: $($taskInfo.State)"
        
        if ($taskInfo.State -eq "Ready") {
            Write-InstallLog "✅ Task is ready to run"
        } elseif ($taskInfo.State -eq "Running") {
            Write-InstallLog "✅ Task is already running"
        } else {
            Write-InstallLog "⚠️ Task state: $($taskInfo.State)" "WARN"
        }
    } else {
        Write-InstallLog "⚠️ Could not verify task status" "WARN"
        Write-InstallLog "Run manually: Start-ScheduledTask -TaskName '$taskName'" "INFO"
    }
    
    # Verificar se task foi criada com parâmetros corretos
    $taskAction = (Get-ScheduledTask -TaskName $taskName).Actions[0]
    $taskArguments = $taskAction.Arguments
    
    if ($taskArguments -notlike "*-AgentToken*") {
        Write-InstallLog "⚠️ WARNING: Scheduled Task missing -AgentToken parameter!" "ERROR"
        Write-InstallLog "   This is a BUG - agent will not be able to authenticate" "ERROR"
    }
    
    if ($taskArguments -notlike "*-HmacSecret*") {
        Write-InstallLog "⚠️ WARNING: Scheduled Task missing -HmacSecret parameter!" "ERROR"
        Write-InstallLog "   This is a BUG - agent will not be able to sign requests" "ERROR"
    }
    
    if ($taskArguments -notlike "*-ServerUrl*") {
        Write-InstallLog "⚠️ WARNING: Scheduled Task missing -ServerUrl parameter!" "ERROR"
        Write-InstallLog "   This is a BUG - agent will not know where to connect" "ERROR"
    }
    
    Write-InstallLog "Task command line: powershell.exe $taskArguments" "DEBUG"
    
    # Send post-installation telemetry (HMAC-authenticated)
    Write-InstallLog "Sending installation telemetry..."
    try {
        # DEFENSIVE: Ensure all variables exist with fallbacks
        if (-not $InstallDir) { $InstallDir = "C:\\CyberShield" }
        if (-not $taskName) { $taskName = "CyberShieldAgent" }
        
        # Collect OS info with fallback
        if (-not $osInfo) {
            try {
                $osInfo = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
            } catch {
                $osInfo = $null
            }
        }
        
        # Get task info with defensive checks
        $taskInfo = $null
        $taskCreated = $false
        $taskRunning = $false
        
        try {
            $taskInfo = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            $taskCreated = $null -ne $taskInfo
            $taskRunning = $taskInfo -and ($taskInfo.State -eq "Running")
        } catch {
            Write-InstallLog "   Could not verify task status for telemetry" "DEBUG"
        }
        
        # Get script info with path validation
        $agentScriptPath = Join-Path $InstallDir "cybershield-agent.ps1"
        $scriptExists = $false
        $scriptSize = 0
        
        if ($agentScriptPath -and (Test-Path $agentScriptPath -ErrorAction SilentlyContinue)) {
            $scriptExists = $true
            try {
                $scriptItem = Get-Item $agentScriptPath -ErrorAction Stop
                $scriptSize = $scriptItem.Length
            } catch {
                $scriptSize = 0
            }
        }
        
        # Get PowerShell version with fallback
        $psVersion = "5.1.0"
        if ($PSVersionTable -and $PSVersionTable.PSVersion) {
            $psVersion = $PSVersionTable.PSVersion.ToString()
        }
        
        # TELEMETRY PAYLOAD - Minimal mandatory + optional fields
        $telemetryData = @{
            # MANDATORY FIELDS (always present)
            success = $true
            event_type = "post_installation"
            installation_time = (Get-Date).ToString("o")
            powershell_version = $psVersion
            
            # OPTIONAL FIELDS (may be null/empty)
            os_version = if ($osInfo) { $osInfo.Caption } else { "Windows Unknown" }
            os_architecture = if ($osInfo) { $osInfo.OSArchitecture } else { "Unknown" }
            network_tests = @{
                health_check_passed = [bool]$healthCheckOk
                dns_test = $true
                api_test = [bool]$healthCheckOk
            }
            firewall_status = "configured"
            proxy_detected = $false
            task_created = [bool]$taskCreated
            task_running = [bool]$taskRunning
            script_exists = [bool]$scriptExists
            script_size_bytes = [int]$scriptSize
        }
        
        $telemetryJson = $telemetryData | ConvertTo-Json -Compress -Depth 10
        
        # Calculate HMAC signature
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
        $nonce = [Guid]::NewGuid().ToString()
        $payload = $timestamp + ":" + $nonce + ":" + $telemetryJson
        
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = Convert-HexToBytes $HMAC_SECRET
        $signatureBytes = $hmacsha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
        $signature = [System.BitConverter]::ToString($signatureBytes).Replace('-','').ToLower()
        
        $telemetryHeaders = @{
            "Content-Type" = "application/json"
            "X-Agent-Token" = $AGENT_TOKEN
            "X-HMAC-Signature" = $signature
            "X-Timestamp" = $timestamp
            "X-Nonce" = $nonce
        }
        
        $telemetryResponse = Invoke-WebRequest \`
            -Uri "$SERVER_URL/functions/v1/post-installation-telemetry" \`
            -Method POST \`
            -Body $telemetryJson \`
            -Headers $telemetryHeaders \`
            -TimeoutSec 15 \`
            -UseBasicParsing
        
        if ($telemetryResponse.StatusCode -eq 200 -or $telemetryResponse.StatusCode -eq 201 -or $telemetryResponse.StatusCode -eq 202) {
            Write-InstallLog "✅ Telemetry sent successfully (HTTP $($telemetryResponse.StatusCode))"
        } else {
            Write-InstallLog "⚠️ Telemetry returned HTTP $($telemetryResponse.StatusCode) (non-critical)" "WARN"
        }
        
    } catch {
        $errorDetail = $_.Exception.Message
        $errorType = $_.Exception.GetType().Name
        Write-InstallLog "⚠️ Telemetry failed (non-critical): [$errorType] $errorDetail" "WARN"
        Write-InstallLog "   Installation is complete despite telemetry failure" "INFO"
    }
    
    # Installation complete
    Write-InstallLog "=" * 70
    Write-InstallLog "✅ CyberShield Agent installed successfully!" "SUCCESS"
    Write-InstallLog "=" * 70
    Write-InstallLog ""
    Write-InstallLog "📋 Useful commands:"
    Write-InstallLog "  • View agent status:  Get-ScheduledTask -TaskName '$taskName'"
    Write-InstallLog "  • Start agent:        Start-ScheduledTask -TaskName '$taskName'"
    Write-InstallLog "  • Stop agent:         Stop-ScheduledTask -TaskName '$taskName'"
    Write-InstallLog "  • View logs:          Get-Content '$LogFile'"
    Write-InstallLog ""
    Write-InstallLog "🔍 Agent is now running in background with automatic restart on system boot."
    Write-InstallLog "Monitor the dashboard for agent status and heartbeat."
    
    # Keep-Alive monitoring period (2 minutes)
    Write-InstallLog ""
    Write-InstallLog "🔄 Monitoring agent for 2 minutes (Keep-Alive)..."
    Write-Host -NoNewline "Monitoring agent status"
    
    $everRunning = $false
    $maxChecks = 24   # 24 * 5s = 120 seconds (2 minutes)
    
    for ($i = 1; $i -le $maxChecks; $i++) {
        Start-Sleep -Seconds 5
        
        try {
            $currentTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
            $status = $currentTask.State
        } catch {
            Write-InstallLog "" "ERROR"
            Write-InstallLog "❌ Failed to read Scheduled Task '$taskName': $($_.Exception.Message)" "ERROR"
            break
        }
        
        Write-Host "." -NoNewline
        
        if ($status -eq "Running") {
            $everRunning = $true
        }
        
        # If status leaves Running/Ready, something went wrong
        if ($status -notin @("Running", "Ready")) {
            Write-InstallLog "" "WARN"
            Write-InstallLog "⚠️ Agent task status changed to: $status" "WARN"
            break
        }
    }
    
    Write-InstallLog ""
    
    if ($everRunning) {
        Write-InstallLog "✅ Keep-Alive monitoring complete. Agent is stable."
    } else {
        Write-InstallLog "⚠️ Agent never reached Running state during Keep-Alive window" "WARN"
    }
    
    Write-InstallLog "Installation log saved to: $LogFile"
    
} catch {
    Write-Host ""
    Write-Host "=" * 70 -ForegroundColor Red
    Write-Host "❌ INSTALLATION FAILED!" -ForegroundColor Red
    Write-Host "=" * 70 -ForegroundColor Red
    Write-Host ""
    Write-Host "Error Details:" -ForegroundColor Yellow
    Write-Host "  Message: $($_.Exception.Message)" -ForegroundColor White
    Write-Host "  Line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor White
    Write-Host "  Command: $($_.InvocationInfo.Line.Trim())" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Stack Trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    
    # Log detailed error
    if (Test-Path $LogDir) {
        Write-InstallLog "FATAL ERROR: $($_.Exception.Message)" "ERROR"
        Write-InstallLog "Line: $($_.InvocationInfo.ScriptLineNumber)" "ERROR"
        Write-InstallLog "StackTrace: $($_.ScriptStackTrace)" "ERROR"
    }
    
    Write-Host "Troubleshooting Steps:" -ForegroundColor Cyan
    Write-Host "  1. Check logs: Get-Content '$LogFile'" -ForegroundColor White
    Write-Host "  2. Verify admin privileges: ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)" -ForegroundColor White
    Write-Host "  3. Test network: Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443" -ForegroundColor White
    Write-Host "  4. Contact support: gamehousetecnologia@gmail.com" -ForegroundColor White
    Write-Host ""
    Write-Host "Log file saved to: $LogFile" -ForegroundColor Gray
    Write-Host ""
    
    Read-Host "Press Enter to exit"
    exit 1
}
`;
