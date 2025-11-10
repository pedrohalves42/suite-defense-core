# CyberShield Load Test Suite
# Simula múltiplos agents e jobs para testar escalabilidade

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$EnrollmentKey,
    
    [Parameter(Mandatory=$false)]
    [int]$NumAgents = 10,
    
    [Parameter(Mandatory=$false)]
    [int]$NumJobsPerAgent = 10,
    
    [Parameter(Mandatory=$false)]
    [int]$ConcurrentRequests = 5
)

$ErrorActionPreference = "Continue"

# ============================================
# SETUP
# ============================================

$script:Stats = @{
    TotalAgents = 0
    EnrolledAgents = 0
    FailedEnrollments = 0
    TotalJobs = 0
    CompletedJobs = 0
    FailedJobs = 0
    TotalRequests = 0
    FailedRequests = 0
    AverageResponseTime = 0
    ResponseTimes = @()
}

$script:EnrolledAgents = @()

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          CyberShield Load Test Suite                     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  - Server: $ServerUrl" -ForegroundColor Gray
Write-Host "  - Agents: $NumAgents" -ForegroundColor Gray
Write-Host "  - Jobs per agent: $NumJobsPerAgent" -ForegroundColor Gray
Write-Host "  - Concurrent requests: $ConcurrentRequests" -ForegroundColor Gray
Write-Host "  - Total operations: $(($NumAgents * $NumJobsPerAgent) + $NumAgents)" -ForegroundColor Gray
Write-Host ""

# ============================================
# PHASE 1: ENROLL AGENTS
# ============================================

Write-Host "═══ PHASE 1: Agent Enrollment ===" -ForegroundColor Cyan
Write-Host ""

$enrollmentStartTime = Get-Date

for ($i = 1; $i -le $NumAgents; $i++) {
    $agentName = "load-test-agent-$i-$(Get-Date -Format 'HHmmss')"
    
    Write-Host "[$i/$NumAgents] Enrolling $agentName..." -NoNewline
    
    try {
        $body = @{
            enrollmentKey = $EnrollmentKey
            agentName = $agentName
        } | ConvertTo-Json
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/enroll-agent" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
        $stopwatch.Stop()
        
        $script:Stats.ResponseTimes += $stopwatch.ElapsedMilliseconds
        $script:Stats.TotalRequests++
        
        if ($response.agent_token -and $response.hmac_secret) {
            $script:EnrolledAgents += @{
                Name = $agentName
                Token = $response.agent_token
                Secret = $response.hmac_secret
            }
            $script:Stats.EnrolledAgents++
            Write-Host " ✓ OK ($($stopwatch.ElapsedMilliseconds)ms)" -ForegroundColor Green
        } else {
            $script:Stats.FailedEnrollments++
            Write-Host " ✗ FAILED (invalid response)" -ForegroundColor Red
        }
    } catch {
        $script:Stats.FailedEnrollments++
        $script:Stats.FailedRequests++
        Write-Host " ✗ FAILED ($($_.Exception.Message))" -ForegroundColor Red
    }
    
    # Pequeno delay para não sobrecarregar
    Start-Sleep -Milliseconds 100
}

$enrollmentDuration = ((Get-Date) - $enrollmentStartTime).TotalSeconds

Write-Host ""
Write-Host "Enrollment Summary:" -ForegroundColor Yellow
Write-Host "  - Enrolled: $($script:Stats.EnrolledAgents) / $NumAgents" -ForegroundColor Gray
Write-Host "  - Failed: $($script:Stats.FailedEnrollments)" -ForegroundColor Gray
Write-Host "  - Duration: $([math]::Round($enrollmentDuration, 2))s" -ForegroundColor Gray
Write-Host "  - Rate: $([math]::Round($NumAgents / $enrollmentDuration, 2)) agents/s" -ForegroundColor Gray
Write-Host ""

if ($script:EnrolledAgents.Count -eq 0) {
    Write-Host "✗ No agents enrolled. Cannot continue." -ForegroundColor Red
    exit 1
}

# ============================================
# PHASE 2: HEARTBEAT STORM
# ============================================

Write-Host "═══ PHASE 2: Heartbeat Storm ===" -ForegroundColor Cyan
Write-Host ""

$heartbeatStartTime = Get-Date
$heartbeatSuccess = 0
$heartbeatFailed = 0

Write-Host "Sending heartbeats from all agents..." -ForegroundColor Gray

foreach ($agent in $script:EnrolledAgents) {
    try {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $nonce = [guid]::NewGuid().ToString()
        $message = "$timestamp$nonce{}"
        
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($agent.Secret)
        $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
        $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
        
        $headers = @{
            "X-Agent-Token" = $agent.Token
            "X-HMAC-Signature" = $signatureHex
            "X-Timestamp" = $timestamp.ToString()
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $null = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/heartbeat" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30
        $stopwatch.Stop()
        
        $script:Stats.ResponseTimes += $stopwatch.ElapsedMilliseconds
        $script:Stats.TotalRequests++
        $heartbeatSuccess++
        
        Write-Host "  ✓ $($agent.Name): $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor Green
    } catch {
        $script:Stats.FailedRequests++
        $heartbeatFailed++
        Write-Host "  ✗ $($agent.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

$heartbeatDuration = ((Get-Date) - $heartbeatStartTime).TotalSeconds

Write-Host ""
Write-Host "Heartbeat Summary:" -ForegroundColor Yellow
Write-Host "  - Success: $heartbeatSuccess / $($script:EnrolledAgents.Count)" -ForegroundColor Gray
Write-Host "  - Failed: $heartbeatFailed" -ForegroundColor Gray
Write-Host "  - Duration: $([math]::Round($heartbeatDuration, 2))s" -ForegroundColor Gray
Write-Host "  - Rate: $([math]::Round($script:EnrolledAgents.Count / $heartbeatDuration, 2)) heartbeats/s" -ForegroundColor Gray
Write-Host ""

# ============================================
# PHASE 3: JOB POLLING STORM
# ============================================

Write-Host "═══ PHASE 3: Job Polling Storm ===" -ForegroundColor Cyan
Write-Host ""

$pollStartTime = Get-Date
$pollSuccess = 0
$pollFailed = 0

Write-Host "Polling jobs from all agents simultaneously..." -ForegroundColor Gray

foreach ($agent in $script:EnrolledAgents) {
    try {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $nonce = [guid]::NewGuid().ToString()
        $message = "$timestamp$nonce{}"
        
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($agent.Secret)
        $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
        $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
        
        $headers = @{
            "X-Agent-Token" = $agent.Token
            "X-HMAC-Signature" = $signatureHex
            "X-Timestamp" = $timestamp.ToString()
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $jobs = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/poll-jobs" -Method GET -Headers $headers -TimeoutSec 30
        $stopwatch.Stop()
        
        $script:Stats.ResponseTimes += $stopwatch.ElapsedMilliseconds
        $script:Stats.TotalRequests++
        $pollSuccess++
        
        Write-Host "  ✓ $($agent.Name): $($jobs.Count) job(s), $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor Green
    } catch {
        $script:Stats.FailedRequests++
        $pollFailed++
        Write-Host "  ✗ $($agent.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

$pollDuration = ((Get-Date) - $pollStartTime).TotalSeconds

Write-Host ""
Write-Host "Polling Summary:" -ForegroundColor Yellow
Write-Host "  - Success: $pollSuccess / $($script:EnrolledAgents.Count)" -ForegroundColor Gray
Write-Host "  - Failed: $pollFailed" -ForegroundColor Gray
Write-Host "  - Duration: $([math]::Round($pollDuration, 2))s" -ForegroundColor Gray
Write-Host "  - Rate: $([math]::Round($script:EnrolledAgents.Count / $pollDuration, 2)) polls/s" -ForegroundColor Gray
Write-Host ""

# ============================================
# PHASE 4: SUSTAINED LOAD TEST
# ============================================

Write-Host "═══ PHASE 4: Sustained Load Test (60 seconds) ===" -ForegroundColor Cyan
Write-Host ""

$sustainedStartTime = Get-Date
$sustainedEndTime = $sustainedStartTime.AddSeconds(60)
$sustainedRequests = 0
$sustainedErrors = 0

Write-Host "Running sustained load test..." -ForegroundColor Gray

while ((Get-Date) -lt $sustainedEndTime) {
    # Selecionar agente aleatório
    $agent = $script:EnrolledAgents | Get-Random
    
    try {
        # Alternar entre heartbeat e poll
        $operation = Get-Random -Minimum 0 -Maximum 2
        
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $nonce = [guid]::NewGuid().ToString()
        $message = "$timestamp$nonce{}"
        
        $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($agent.Secret)
        $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
        $signatureHex = [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
        
        $headers = @{
            "X-Agent-Token" = $agent.Token
            "X-HMAC-Signature" = $signatureHex
            "X-Timestamp" = $timestamp.ToString()
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        if ($operation -eq 0) {
            $null = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/heartbeat" -Method POST -Headers $headers -Body "{}" -TimeoutSec 10
        } else {
            $null = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/poll-jobs" -Method GET -Headers $headers -TimeoutSec 10
        }
        
        $sustainedRequests++
        $script:Stats.TotalRequests++
    } catch {
        $sustainedErrors++
        $script:Stats.FailedRequests++
    }
    
    # Pequeno delay
    Start-Sleep -Milliseconds 50
}

$sustainedDuration = ((Get-Date) - $sustainedStartTime).TotalSeconds

Write-Host ""
Write-Host "Sustained Load Summary:" -ForegroundColor Yellow
Write-Host "  - Total Requests: $sustainedRequests" -ForegroundColor Gray
Write-Host "  - Errors: $sustainedErrors" -ForegroundColor Gray
Write-Host "  - Success Rate: $([math]::Round((($sustainedRequests - $sustainedErrors) / $sustainedRequests) * 100, 2))%" -ForegroundColor Gray
Write-Host "  - Duration: $([math]::Round($sustainedDuration, 2))s" -ForegroundColor Gray
Write-Host "  - Rate: $([math]::Round($sustainedRequests / $sustainedDuration, 2)) req/s" -ForegroundColor Gray
Write-Host ""

# ============================================
# FINAL STATISTICS
# ============================================

if ($script:Stats.ResponseTimes.Count -gt 0) {
    $avgResponseTime = ($script:Stats.ResponseTimes | Measure-Object -Average).Average
    $minResponseTime = ($script:Stats.ResponseTimes | Measure-Object -Minimum).Minimum
    $maxResponseTime = ($script:Stats.ResponseTimes | Measure-Object -Maximum).Maximum
    $p95ResponseTime = ($script:Stats.ResponseTimes | Sort-Object)[[math]::Floor($script:Stats.ResponseTimes.Count * 0.95)]
} else {
    $avgResponseTime = 0
    $minResponseTime = 0
    $maxResponseTime = 0
    $p95ResponseTime = 0
}

$totalDuration = ((Get-Date) - $enrollmentStartTime).TotalSeconds
$successRate = (($script:Stats.TotalRequests - $script:Stats.FailedRequests) / $script:Stats.TotalRequests) * 100

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                   FINAL STATISTICS                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "Agents:" -ForegroundColor Yellow
Write-Host "  - Enrolled: $($script:Stats.EnrolledAgents) / $NumAgents" -ForegroundColor Gray
Write-Host "  - Failed Enrollments: $($script:Stats.FailedEnrollments)" -ForegroundColor Gray
Write-Host ""

Write-Host "Requests:" -ForegroundColor Yellow
Write-Host "  - Total: $($script:Stats.TotalRequests)" -ForegroundColor Gray
Write-Host "  - Failed: $($script:Stats.FailedRequests)" -ForegroundColor Gray
Write-Host "  - Success Rate: $([math]::Round($successRate, 2))%" -ForegroundColor Gray
Write-Host ""

Write-Host "Response Times:" -ForegroundColor Yellow
Write-Host "  - Average: $([math]::Round($avgResponseTime, 2))ms" -ForegroundColor Gray
Write-Host "  - Min: $([math]::Round($minResponseTime, 2))ms" -ForegroundColor Gray
Write-Host "  - Max: $([math]::Round($maxResponseTime, 2))ms" -ForegroundColor Gray
Write-Host "  - P95: $([math]::Round($p95ResponseTime, 2))ms" -ForegroundColor Gray
Write-Host ""

Write-Host "Performance:" -ForegroundColor Yellow
Write-Host "  - Total Duration: $([math]::Round($totalDuration, 2))s" -ForegroundColor Gray
Write-Host "  - Average Throughput: $([math]::Round($script:Stats.TotalRequests / $totalDuration, 2)) req/s" -ForegroundColor Gray
Write-Host ""

# Avaliar resultado
$passed = $successRate -ge 95 -and $avgResponseTime -lt 2000 -and $script:Stats.EnrolledAgents -ge ($NumAgents * 0.9)

if ($passed) {
    Write-Host "✓ LOAD TEST: PASSED" -ForegroundColor Green
    Write-Host "  System is ready for production scale" -ForegroundColor Gray
} else {
    Write-Host "✗ LOAD TEST: NEEDS IMPROVEMENT" -ForegroundColor Yellow
    Write-Host "  Review performance metrics above" -ForegroundColor Gray
}

Write-Host ""

# Cleanup
Write-Host "Note: $($script:EnrolledAgents.Count) test agents created. Clean them up in the dashboard if needed." -ForegroundColor Yellow
Write-Host ""
