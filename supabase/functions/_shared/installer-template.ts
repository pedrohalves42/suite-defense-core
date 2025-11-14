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
    
    # Health check
    Write-InstallLog "Performing backend health check..."
    try {
        $healthCheck = Invoke-WebRequest -Uri "$SERVER_URL/functions/v1/heartbeat" -Method GET -TimeoutSec 10 -UseBasicParsing
        Write-InstallLog "✅ Backend is reachable (Status: $($healthCheck.StatusCode))"
    } catch {
        Write-InstallLog "⚠️ Health check failed: $($_.Exception.Message)" "WARN"
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
    
    $taskInfo = Get-ScheduledTask -TaskName $taskName
    Write-InstallLog "✅ Agent task status: $($taskInfo.State)"
    
    # Send post-installation telemetry
    Write-InstallLog "Sending installation telemetry..."
    try {
        $telemetryBody = @{
            event = "agent_installed"
            platform = "windows"
            agent_name = "{{AGENT_NAME}}"
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
    Write-InstallLog "=" * 70 "ERROR"
    Write-InstallLog "❌ Installation failed!" "ERROR"
    Write-InstallLog "Error: $($_.Exception.Message)" "ERROR"
    Write-InstallLog "StackTrace: $($_.ScriptStackTrace)" "ERROR"
    Write-InstallLog "=" * 70 "ERROR"
    Write-InstallLog ""
    Write-InstallLog "📞 Contact support: support@cybershield.com" "ERROR"
    Write-InstallLog "📄 Log file: $LogFile" "ERROR"
    exit 1
}
`;
