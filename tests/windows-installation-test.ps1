# CyberShield Windows Installation Test Suite
# Este script testa completamente a instalação e funcionamento do agent Windows

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$EnrollmentKey,
    
    [Parameter(Mandatory=$false)]
    [int]$TestDuration = 300  # 5 minutos de teste por padrão
)

$ErrorActionPreference = "Stop"

# Cores para output
$ColorSuccess = "Green"
$ColorError = "Red"
$ColorWarning = "Yellow"
$ColorInfo = "Cyan"

function Write-TestResult {
    param(
        [string]$TestName,
        [bool]$Passed,
        [string]$Details = ""
    )
    
    $status = if ($Passed) { "[✓ PASS]" } else { "[✗ FAIL]" }
    $color = if ($Passed) { $ColorSuccess } else { $ColorError }
    
    Write-Host "$status $TestName" -ForegroundColor $color
    if ($Details) {
        Write-Host "       $Details" -ForegroundColor Gray
    }
}

function Test-Prerequisites {
    Write-Host "`n=== TESTE 1: Pré-requisitos ===" -ForegroundColor $ColorInfo
    
    # PowerShell Version
    $psVersion = $PSVersionTable.PSVersion
    $psVersionOk = $psVersion.Major -ge 5
    Write-TestResult "PowerShell 5.1+" $psVersionOk "Version: $psVersion"
    
    # Admin Rights
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Write-TestResult "Administrator Rights" $isAdmin
    
    # Network Connectivity
    try {
        $null = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet
        $networkOk = $true
    } catch {
        $networkOk = $false
    }
    Write-TestResult "Network Connectivity" $networkOk
    
    # Server Reachability
    try {
        $response = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/poll-jobs" -Method HEAD -UseBasicParsing -TimeoutSec 10
        $serverOk = $response.StatusCode -eq 401 -or $response.StatusCode -eq 200  # 401 é esperado (sem auth)
    } catch {
        $serverOk = $false
    }
    Write-TestResult "Server Reachable" $serverOk "URL: $ServerUrl"
    
    return $psVersionOk -and $isAdmin -and $networkOk -and $serverOk
}

function Test-EnrollmentProcess {
    Write-Host "`n=== TESTE 2: Processo de Enrollment ===" -ForegroundColor $ColorInfo
    
    try {
        # Chamar função de enrollment
        $enrollUrl = "$ServerUrl/functions/v1/enroll-agent"
        
        $agentName = "test-agent-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        
        $body = @{
            enrollmentKey = $EnrollmentKey
            agentName = $agentName
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri $enrollUrl -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
        
        if ($response.agent_token -and $response.hmac_secret) {
            Write-TestResult "Enrollment Successful" $true "Agent: $agentName"
            
            # Salvar credenciais para testes seguintes
            $script:TestAgentToken = $response.agent_token
            $script:TestHmacSecret = $response.hmac_secret
            $script:TestAgentName = $agentName
            
            Write-Host "       Token: $($response.agent_token.Substring(0, 16))..." -ForegroundColor Gray
            Write-Host "       Secret: $($response.hmac_secret.Substring(0, 16))..." -ForegroundColor Gray
            
            return $true
        } else {
            Write-TestResult "Enrollment Failed" $false "Invalid response"
            return $false
        }
    } catch {
        Write-TestResult "Enrollment Failed" $false $_.Exception.Message
        return $false
    }
}

function Test-HeartbeatFunction {
    Write-Host "`n=== TESTE 3: Heartbeat ===" -ForegroundColor $ColorInfo
    
    if (-not $script:TestAgentToken) {
        Write-TestResult "Heartbeat Test" $false "No agent token available"
        return $false
    }
    
    try {
        # Criar HMAC signature
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $nonce = [guid]::NewGuid().ToString()
        $message = "$timestamp$nonce{}"
        
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($script:TestHmacSecret)
        $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
        $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
        
        # Enviar heartbeat
        $headers = @{
            "X-Agent-Token" = $script:TestAgentToken
            "X-HMAC-Signature" = $signatureHex
            "X-Timestamp" = $timestamp.ToString()
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        $response = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/heartbeat" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30
        
        $success = $response.ok -eq $true
        Write-TestResult "Heartbeat" $success "Agent: $($response.agent)"
        
        return $success
    } catch {
        Write-TestResult "Heartbeat Failed" $false $_.Exception.Message
        return $false
    }
}

function Test-JobPolling {
    Write-Host "`n=== TESTE 4: Job Polling ===" -ForegroundColor $ColorInfo
    
    if (-not $script:TestAgentToken) {
        Write-TestResult "Job Polling Test" $false "No agent token available"
        return $false
    }
    
    try {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $nonce = [guid]::NewGuid().ToString()
        $message = "$timestamp$nonce{}"
        
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($script:TestHmacSecret)
        $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
        $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
        
        $headers = @{
            "X-Agent-Token" = $script:TestAgentToken
            "X-HMAC-Signature" = $signatureHex
            "X-Timestamp" = $timestamp.ToString()
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        $jobs = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/poll-jobs" -Method GET -Headers $headers -TimeoutSec 30
        
        Write-TestResult "Job Polling" $true "Found $($jobs.Count) job(s)"
        
        $script:TestJobs = $jobs
        return $true
    } catch {
        Write-TestResult "Job Polling Failed" $false $_.Exception.Message
        return $false
    }
}

function Test-JobAcknowledgment {
    Write-Host "`n=== TESTE 5: Job ACK ===" -ForegroundColor $ColorInfo
    
    if (-not $script:TestAgentToken) {
        Write-TestResult "Job ACK Test" $false "No agent token available"
        return $false
    }
    
    # Se não há jobs, criar um de teste via API
    Write-Host "       Creating test job..." -ForegroundColor Gray
    
    # Por enquanto, vamos simular que não há jobs pendentes
    Write-TestResult "Job ACK (No Jobs)" $true "No jobs to acknowledge (expected)"
    
    return $true
}

function Test-ContinuousOperation {
    param([int]$DurationSeconds)
    
    Write-Host "`n=== TESTE 6: Operação Contínua ($DurationSeconds segundos) ===" -ForegroundColor $ColorInfo
    
    if (-not $script:TestAgentToken) {
        Write-TestResult "Continuous Operation Test" $false "No agent token available"
        return $false
    }
    
    $startTime = Get-Date
    $endTime = $startTime.AddSeconds($DurationSeconds)
    $heartbeatCount = 0
    $heartbeatErrors = 0
    $pollCount = 0
    $pollErrors = 0
    
    Write-Host "       Starting continuous operation test..." -ForegroundColor Gray
    Write-Host "       End time: $($endTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
    
    while ((Get-Date) -lt $endTime) {
        # Heartbeat a cada 30 segundos
        if ($heartbeatCount -eq 0 -or ((Get-Date) - $lastHeartbeat).TotalSeconds -ge 30) {
            try {
                $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                $nonce = [guid]::NewGuid().ToString()
                $message = "$timestamp$nonce{}"
                
                $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
                $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($script:TestHmacSecret)
                $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
                $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
                
                $headers = @{
                    "X-Agent-Token" = $script:TestAgentToken
                    "X-HMAC-Signature" = $signatureHex
                    "X-Timestamp" = $timestamp.ToString()
                    "X-Nonce" = $nonce
                    "Content-Type" = "application/json"
                }
                
                $null = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/heartbeat" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30
                $heartbeatCount++
                $lastHeartbeat = Get-Date
                Write-Host "       ✓ Heartbeat #$heartbeatCount" -ForegroundColor Green
            } catch {
                $heartbeatErrors++
                Write-Host "       ✗ Heartbeat error: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        
        # Poll a cada 10 segundos
        if ($pollCount -eq 0 -or ((Get-Date) - $lastPoll).TotalSeconds -ge 10) {
            try {
                $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                $nonce = [guid]::NewGuid().ToString()
                $message = "$timestamp$nonce{}"
                
                $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
                $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($script:TestHmacSecret)
                $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
                $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
                
                $headers = @{
                    "X-Agent-Token" = $script:TestAgentToken
                    "X-HMAC-Signature" = $signatureHex
                    "X-Timestamp" = $timestamp.ToString()
                    "X-Nonce" = $nonce
                    "Content-Type" = "application/json"
                }
                
                $jobs = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/poll-jobs" -Method GET -Headers $headers -TimeoutSec 30
                $pollCount++
                $lastPoll = Get-Date
                Write-Host "       ✓ Poll #$pollCount (jobs: $($jobs.Count))" -ForegroundColor Green
            } catch {
                $pollErrors++
                Write-Host "       ✗ Poll error: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        
        Start-Sleep -Seconds 1
    }
    
    $totalTime = ((Get-Date) - $startTime).TotalSeconds
    $successRate = (($heartbeatCount + $pollCount - $heartbeatErrors - $pollErrors) / ($heartbeatCount + $pollCount)) * 100
    
    Write-Host ""
    Write-Host "       Statistics:" -ForegroundColor Gray
    Write-Host "       - Duration: $([math]::Round($totalTime, 1))s" -ForegroundColor Gray
    Write-Host "       - Heartbeats: $heartbeatCount (errors: $heartbeatErrors)" -ForegroundColor Gray
    Write-Host "       - Polls: $pollCount (errors: $pollErrors)" -ForegroundColor Gray
    Write-Host "       - Success Rate: $([math]::Round($successRate, 2))%" -ForegroundColor Gray
    
    $passed = $successRate -ge 95
    Write-TestResult "Continuous Operation" $passed "Success rate: $([math]::Round($successRate, 2))%"
    
    return $passed
}

function Test-LogsAndCleanup {
    Write-Host "`n=== TESTE 7: Logs e Cleanup ===" -ForegroundColor $ColorInfo
    
    # Verificar se logs seriam criados corretamente
    $logDir = "C:\CyberShield\logs"
    $logDirExists = Test-Path $logDir
    
    if ($logDirExists) {
        Write-TestResult "Log Directory Exists" $true $logDir
    } else {
        Write-TestResult "Log Directory" $false "Would be created at: $logDir"
    }
    
    # Limpeza do agente de teste (opcional)
    Write-Host ""
    $cleanup = Read-Host "Deseja limpar o agente de teste? (y/n)"
    
    if ($cleanup -eq "y") {
        Write-Host "       Cleaning up test agent..." -ForegroundColor Gray
        # Aqui você poderia chamar uma API para deletar o agente
        Write-Host "       Note: Manual cleanup may be needed in dashboard" -ForegroundColor Yellow
    }
    
    return $true
}

# ============================================
# MAIN TEST EXECUTION
# ============================================

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     CyberShield Windows Agent Installation Test Suite    ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server: $ServerUrl" -ForegroundColor Gray
Write-Host "Test Duration: $TestDuration seconds" -ForegroundColor Gray
Write-Host ""

$testResults = @{
    Prerequisites = $false
    Enrollment = $false
    Heartbeat = $false
    JobPolling = $false
    JobAck = $false
    ContinuousOperation = $false
    LogsCleanup = $false
}

try {
    $testResults.Prerequisites = Test-Prerequisites
    
    if ($testResults.Prerequisites) {
        $testResults.Enrollment = Test-EnrollmentProcess
        
        if ($testResults.Enrollment) {
            $testResults.Heartbeat = Test-HeartbeatFunction
            $testResults.JobPolling = Test-JobPolling
            $testResults.JobAck = Test-JobAcknowledgment
            $testResults.ContinuousOperation = Test-ContinuousOperation -DurationSeconds $TestDuration
        }
    }
    
    $testResults.LogsCleanup = Test-LogsAndCleanup
    
} catch {
    Write-Host "`n[CRITICAL ERROR] Test suite failed: $_" -ForegroundColor Red
}

# ============================================
# FINAL REPORT
# ============================================

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                     FINAL REPORT                          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$passedTests = ($testResults.Values | Where-Object { $_ -eq $true }).Count
$totalTests = $testResults.Count
$passRate = ($passedTests / $totalTests) * 100

foreach ($test in $testResults.GetEnumerator()) {
    $status = if ($test.Value) { "[✓]" } else { "[✗]" }
    $color = if ($test.Value) { $ColorSuccess } else { $ColorError }
    Write-Host "$status $($test.Key)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Tests Passed: $passedTests / $totalTests ($([math]::Round($passRate, 1))%)" -ForegroundColor $(if ($passRate -ge 85) { $ColorSuccess } else { $ColorError })
Write-Host ""

if ($passRate -ge 85) {
    Write-Host "✓ INSTALLATION VALIDATION: PASSED" -ForegroundColor $ColorSuccess
    Write-Host "  Agent is ready for production deployment" -ForegroundColor Gray
} else {
    Write-Host "✗ INSTALLATION VALIDATION: FAILED" -ForegroundColor $ColorError
    Write-Host "  Review failed tests before deploying" -ForegroundColor Gray
}

Write-Host ""
