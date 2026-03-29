import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DIAGNOSTIC_SCRIPT = `#Requires -RunAsAdministrator
# CyberShield Agent Diagnostic Script
# Version: 1.0.0
# Run with: irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-diagnostic-script | iex

param(
    [switch]$Silent,
    [switch]$JsonOnly
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Colors
function Write-Success { param($msg) if (-not $Silent -and -not $JsonOnly) { Write-Host "[OK] $msg" -ForegroundColor Green } }
function Write-Warn { param($msg) if (-not $Silent -and -not $JsonOnly) { Write-Host "[!] $msg" -ForegroundColor Yellow } }
function Write-Fail { param($msg) if (-not $Silent -and -not $JsonOnly) { Write-Host "[X] $msg" -ForegroundColor Red } }
function Write-Info { param($msg) if (-not $Silent -and -not $JsonOnly) { Write-Host "[i] $msg" -ForegroundColor Cyan } }

$Report = @{
    timestamp = (Get-Date).ToString("o")
    hostname = $env:COMPUTERNAME
    os = @{}
    network = @{}
    firewall = @{}
    agent = @{}
    issues = @()
    recommendations = @()
}

# ==================== OS INFO ====================
Write-Info "Checking Operating System..."

try {
    $os = Get-CimInstance Win32_OperatingSystem
    $Report.os = @{
        name = $os.Caption
        version = $os.Version
        build = $os.BuildNumber
        architecture = $os.OSArchitecture
        last_boot = $os.LastBootUpTime.ToString("o")
    }
    Write-Success "OS: $($os.Caption) ($($os.Version))"
} catch {
    Write-Fail "Failed to get OS info: $_"
    $Report.issues += "Failed to get OS information"
}

# PowerShell Version
$Report.os.powershell_version = $PSVersionTable.PSVersion.ToString()
Write-Info "PowerShell Version: $($PSVersionTable.PSVersion)"

# Execution Policy
$execPolicy = Get-ExecutionPolicy
$Report.os.execution_policy = $execPolicy.ToString()
if ($execPolicy -eq "Restricted") {
    Write-Warn "ExecutionPolicy is Restricted - may block agent scripts"
    $Report.issues += "ExecutionPolicy is Restricted"
    $Report.recommendations += "Run: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope LocalMachine"
} else {
    Write-Success "ExecutionPolicy: $execPolicy"
}

# ==================== NETWORK CONNECTIVITY ====================
Write-Info "Testing Network Connectivity..."

# DNS Test
try {
    $dnsTest = Resolve-DnsName "iavbnmduxpxhwubqrzzn.supabase.co" -ErrorAction Stop
    $Report.network.dns_test = $true
    $Report.network.dns_resolved_ip = $dnsTest[0].IPAddress
    Write-Success "DNS Resolution: OK ($($dnsTest[0].IPAddress))"
} catch {
    $Report.network.dns_test = $false
    Write-Fail "DNS Resolution: FAILED"
    $Report.issues += "Cannot resolve Supabase DNS"
    $Report.recommendations += "Check DNS server configuration"
}

# HTTPS Test (Port 443)
try {
    $tcpTest = Test-NetConnection -ComputerName "iavbnmduxpxhwubqrzzn.supabase.co" -Port 443 -WarningAction SilentlyContinue
    $Report.network.https_test = $tcpTest.TcpTestSucceeded
    $Report.network.latency_ms = $tcpTest.PingReplyDetails.RoundtripTime
    if ($tcpTest.TcpTestSucceeded) {
        Write-Success "HTTPS (443): OK (Latency: $($tcpTest.PingReplyDetails.RoundtripTime)ms)"
    } else {
        Write-Fail "HTTPS (443): BLOCKED"
        $Report.issues += "Port 443 is blocked"
        $Report.recommendations += "Open outbound port 443 in firewall"
    }
} catch {
    $Report.network.https_test = $false
    Write-Fail "HTTPS Test: FAILED"
    $Report.issues += "Network connectivity test failed"
}

# TLS Test
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $response = Invoke-WebRequest -Uri "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/health" -Method HEAD -TimeoutSec 10 -UseBasicParsing
    $Report.network.tls_test = $true
    Write-Success "TLS 1.2: OK"
} catch {
    $Report.network.tls_test = $false
    Write-Warn "TLS 1.2 Test: FAILED - $_"
    $Report.issues += "TLS 1.2 connection failed"
}

# Proxy Detection
$proxySettings = Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -ErrorAction SilentlyContinue
$Report.network.proxy_enabled = [bool]$proxySettings.ProxyEnable
$Report.network.proxy_server = $proxySettings.ProxyServer
if ($proxySettings.ProxyEnable) {
    Write-Warn "Proxy Detected: $($proxySettings.ProxyServer)"
    $Report.recommendations += "Ensure proxy allows HTTPS to *.supabase.co"
} else {
    Write-Success "Proxy: Not configured"
}

# ==================== FIREWALL STATUS ====================
Write-Info "Checking Windows Firewall..."

try {
    $fwProfiles = Get-NetFirewallProfile
    $Report.firewall.profiles = @{}
    foreach ($profile in $fwProfiles) {
        $Report.firewall.profiles[$profile.Name] = @{
            enabled = $profile.Enabled
            default_inbound = $profile.DefaultInboundAction.ToString()
            default_outbound = $profile.DefaultOutboundAction.ToString()
        }
        $status = if ($profile.Enabled) { "Enabled" } else { "Disabled" }
        Write-Info "  $($profile.Name): $status (Outbound: $($profile.DefaultOutboundAction))"
    }
    Write-Success "Firewall profiles checked"
} catch {
    Write-Warn "Could not check firewall: $_"
    $Report.firewall.error = $_.ToString()
}

# ==================== AGENT STATUS ====================
Write-Info "Checking CyberShield Agent..."

$agentPath = "C:\\CyberShield"
$Report.agent.install_path = $agentPath
$Report.agent.path_exists = Test-Path $agentPath

if (Test-Path $agentPath) {
    Write-Success "Agent folder exists: $agentPath"
    
    # Find agent script
    $agentScripts = Get-ChildItem -Path $agentPath -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue
    if ($agentScripts) {
        $Report.agent.script_found = $true
        $Report.agent.script_name = $agentScripts[0].Name
        $Report.agent.script_size = $agentScripts[0].Length
        $Report.agent.script_modified = $agentScripts[0].LastWriteTime.ToString("o")
        Write-Success "Agent script: $($agentScripts[0].Name) ($($agentScripts[0].Length) bytes)"
        
        # Extract version from script
        $scriptContent = Get-Content $agentScripts[0].FullName -Raw -ErrorAction SilentlyContinue
        if ($scriptContent -match '\\$AgentVersion\\s*=\\s*["'']([^"'']+)["'']') {
            $Report.agent.version = $Matches[1]
            Write-Success "Agent version: $($Matches[1])"
        }
    } else {
        $Report.agent.script_found = $false
        Write-Fail "No agent script found in $agentPath"
        $Report.issues += "Agent script not found"
        $Report.recommendations += "Reinstall agent from dashboard"
    }
    
    # Check log file
    $logFile = Join-Path $agentPath "agent.log"
    if (Test-Path $logFile) {
        $Report.agent.log_exists = $true
        $logInfo = Get-Item $logFile
        $Report.agent.log_size = $logInfo.Length
        $Report.agent.log_modified = $logInfo.LastWriteTime.ToString("o")
        Write-Success "Log file exists ($($logInfo.Length) bytes)"
        
        # Get last 10 lines
        $lastLines = Get-Content $logFile -Tail 10 -ErrorAction SilentlyContinue
        $Report.agent.log_last_lines = $lastLines
    } else {
        $Report.agent.log_exists = $false
        Write-Warn "No log file found"
    }
} else {
    Write-Fail "Agent folder not found: $agentPath"
    $Report.issues += "Agent not installed"
    $Report.recommendations += "Install agent from dashboard using: irm [installer-url] | iex"
}

# Check Scheduled Task
Write-Info "Checking Scheduled Task..."
try {
    $tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
    if ($tasks) {
        $Report.agent.scheduled_task = @{
            found = $true
            name = $tasks[0].TaskName
            state = $tasks[0].State.ToString()
        }
        
        $taskInfo = Get-ScheduledTaskInfo -TaskName $tasks[0].TaskName -ErrorAction SilentlyContinue
        if ($taskInfo) {
            $Report.agent.scheduled_task.last_run = $taskInfo.LastRunTime.ToString("o")
            $Report.agent.scheduled_task.next_run = $taskInfo.NextRunTime.ToString("o")
            $Report.agent.scheduled_task.last_result = $taskInfo.LastTaskResult
        }
        
        if ($tasks[0].State -eq "Running") {
            Write-Success "Scheduled Task: $($tasks[0].TaskName) (Running)"
        } elseif ($tasks[0].State -eq "Ready") {
            Write-Success "Scheduled Task: $($tasks[0].TaskName) (Ready)"
        } else {
            Write-Warn "Scheduled Task: $($tasks[0].TaskName) ($($tasks[0].State))"
            $Report.issues += "Scheduled Task is not running"
            $Report.recommendations += "Start task: Start-ScheduledTask -TaskName '$($tasks[0].TaskName)'"
        }
    } else {
        $Report.agent.scheduled_task = @{ found = $false }
        Write-Fail "No CyberShield Scheduled Task found"
        $Report.issues += "Scheduled Task not found"
        $Report.recommendations += "Reinstall agent to create Scheduled Task"
    }
} catch {
    Write-Warn "Could not check Scheduled Task: $_"
    $Report.agent.scheduled_task = @{ error = $_.ToString() }
}

# ==================== ANTIVIRUS ====================
Write-Info "Checking Antivirus..."
try {
    $av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct -ErrorAction SilentlyContinue
    if ($av) {
        $Report.antivirus = @{
            name = $av[0].displayName
            state = $av[0].productState
        }
        Write-Success "Antivirus: $($av[0].displayName)"
    } else {
        $Report.antivirus = @{ name = "Not detected" }
        Write-Warn "No antivirus detected"
    }
} catch {
    $Report.antivirus = @{ error = $_.ToString() }
}

# ==================== SUMMARY ====================
Write-Host ""
Write-Host "==================== DIAGNOSTIC SUMMARY ====================" -ForegroundColor Cyan

$issueCount = $Report.issues.Count
if ($issueCount -eq 0) {
    Write-Host "Status: ALL CHECKS PASSED" -ForegroundColor Green
    $Report.overall_status = "healthy"
} elseif ($issueCount -le 2) {
    Write-Host "Status: $issueCount MINOR ISSUE(S) FOUND" -ForegroundColor Yellow
    $Report.overall_status = "warning"
} else {
    Write-Host "Status: $issueCount ISSUE(S) FOUND" -ForegroundColor Red
    $Report.overall_status = "critical"
}

if ($Report.issues.Count -gt 0) {
    Write-Host ""
    Write-Host "Issues:" -ForegroundColor Yellow
    foreach ($issue in $Report.issues) {
        Write-Host "  - $issue" -ForegroundColor Yellow
    }
}

if ($Report.recommendations.Count -gt 0) {
    Write-Host ""
    Write-Host "Recommendations:" -ForegroundColor Cyan
    foreach ($rec in $Report.recommendations) {
        Write-Host "  - $rec" -ForegroundColor Cyan
    }
}

# Save report
$reportPath = Join-Path $env:TEMP "cybershield-diagnostic-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$Report | ConvertTo-Json -Depth 10 | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host ""
Write-Host "Report saved to: $reportPath" -ForegroundColor Green

if ($JsonOnly) {
    $Report | ConvertTo-Json -Depth 10
}

Write-Host "============================================================" -ForegroundColor Cyan
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // Rate limiting: 10 requests per 5 minutes, block for 15 minutes if exceeded
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { allowed, remainingRequests, resetAt } = await checkRateLimit(
      supabase,
      clientIP,
      'get-diagnostic-script',
      { maxRequests: 10, windowMinutes: 5, blockMinutes: 15 }
    );

    if (!allowed) {
      const retryAfter = resetAt ? Math.ceil((resetAt.getTime() - Date.now()) / 1000) : 900;
      logger.warn(`[get-diagnostic-script] Rate limit exceeded for IP: ${clientIP}`);
      
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded', 
        retry_after_seconds: retryAfter 
      }), {
        status: 429,
        headers: { 
          ...buildCorsHeaders(origin), 
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString()
        },
      });
    }

    logger.info(`[get-diagnostic-script] Access from IP: ${clientIP}, UA: ${userAgent.slice(0, 50)}, remaining: ${remainingRequests}`);
  } catch (rateLimitError) {
    // If rate limiting fails, log and continue (don't block legitimate requests)
    logger.error('[get-diagnostic-script] Rate limit check failed:', rateLimitError);
  }

  return new Response(DIAGNOSTIC_SCRIPT, {
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="diagnose-agent.ps1"',
    },
  });
});
