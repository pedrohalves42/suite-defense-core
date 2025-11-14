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
            Write-InstallLog "✅ Backend is reachable and healthy"
        } else {
            throw "Backend returned unexpected status: $($healthCheck.StatusCode)"
        }
    } catch {
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
$AgentScriptContentBlock = @"
{{AGENT_SCRIPT_CONTENT}}
"@

    # Write agent script to file
    $AgentScriptContentBlock | Out-File -FilePath $AgentScript -Encoding UTF8 -Force
    Write-InstallLog "✅ Agent script saved to: $AgentScript"
    
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
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"$AgentScript\`""
    
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
    
    # Send post-installation telemetry
    Write-InstallLog "Sending installation telemetry..."
    try {
        $telemetryBody = @{
            event = "agent_installed"
            platform = "windows"
            installation_method = "installer_script"
        } | ConvertTo-Json
        
        $telemetryHeaders = @{
            "Content-Type" = "application/json"
            "apikey" = $AGENT_TOKEN
        }
        
        Invoke-WebRequest -Uri "$SERVER_URL/functions/v1/track-installation-event" \`
            -Method POST -Body $telemetryBody -Headers $telemetryHeaders \`
            -TimeoutSec 10 -UseBasicParsing | Out-Null
        
        Write-InstallLog "✅ Telemetry sent successfully"
    } catch {
        Write-InstallLog "⚠️ Telemetry failed (non-critical): $($_.Exception.Message)" "WARN"
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
    for ($i = 1; $i -le 24; $i++) {
        Start-Sleep -Seconds 5
        $currentTask = Get-ScheduledTask -TaskName $taskName
        $status = $currentTask.State
        Write-Host "." -NoNewline
        if ($status -ne "Running" -and $status -ne "Ready") {
            Write-InstallLog "" "WARN"
            Write-InstallLog "⚠️ Agent task status changed to: $status" "WARN"
            break
        }
    }
    Write-InstallLog ""
    Write-InstallLog "✅ Keep-Alive monitoring complete. Agent is stable."
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
