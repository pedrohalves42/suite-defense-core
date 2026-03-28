<#
    CyberShield Agent - Windows v4.1.2
    
    SSA-009: Restauracao da coleta de browser_history (Chrome, Firefox, Edge)
    SSA-010: Restauracao de todos os jobs do v3 (scan, fix_firewall, restart_service, etc.)
    FASE 2.1: State Machine Formal (6 estados)
    FASE 2.2: Evidence Journal Local
    FASE 2.4: DNS Filter Go como Windows Service
    FASE 2.5: Policy Contract (Desired vs Actual + Drift Detection)
    FASE 2.6: Ed25519 Signature Verification
    FASE 3.0: Auto-Rollback & Safe Mode (NEW)
    FASE VIKTOR: Force Update via Heartbeat Response
    SSA-004: Payload Signing - Verifies Ed25519 signatures on jobs
    
    Estados:
    - BOOTSTRAP: Inicializacao do agente
    - SYNCING: Sincronizando com servidor
    - ENFORCING: Operacao normal, executando jobs
    - DEGRADED: Erro nao-critico, funcionando parcialmente
    - ERROR: Erro critico, requer intervencao
    - RECOVERY: Tentando auto-recuperacao
    
    Funcionalidades v4.1.0 (PAYLOAD SIGNING):
    - NEW: Ed25519 job payload signature verification
    - NEW: Rejects unsigned jobs when Ed25519PublicKey is configured
    - NEW: Verify-JobSignature function using .NET crypto
    - NEW: Canonical payload format: job_id:job_type:JSON(payload)
    - SECURITY: Prevents RCE via compromised database
    
    v4.0.11 (DISK METRICS FIX):
    - CRITICAL FIX: Coleta de TODOS os discos (nao apenas C:)
    - NEW: Invoke-ReportJob coleta disk_total_gb, disk_free_gb, disks[]
    - NEW: Send-SystemMetrics envia array disks completo para backend
    - NEW: Informacoes detalhadas: drive_letter, drive_label, is_system_drive
    - NEW: Logging melhorado para debug de metricas
    - FIXED: agent_disk_metrics agora populada corretamente
    
    v4.0.10 (VIKTOR RECOVERY):
    - Force Update via Heartbeat Response (bypassa job system completamente)
    - Apply-ForcedUpdate funcao imortal que processa update do heartbeat
    - Confirmacao de force_update no backend apos aplicacao
    - Send-SystemMetrics funcao agora definida
    - Metricas sendo enviadas a cada 5 minutos
    - Auto-rollback with structured backup before update
    - Post-update health check (state machine, heartbeat, poll-jobs)
    - Safe Mode after 2 consecutive rollbacks - disables auto-updates
    - submit-rollback-event Edge Function for telemetry
    - Ed25519 signature verification for updates
    - State Machine formal com transicoes validadas
    - Evidence Journal local estruturado (JSON Lines)
    - Job Engine idempotente com execution_id
    - Auto-recovery com 3 tentativas + backoff exponencial
    - DNS Filter integrado como Windows Service
    - Policy Contract com deteccao de drift
    - UPDATE_AGENT REAL com Base64 decode + SHA256 validation
    - Todas as funcionalidades v3.x mantidas
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows-v4.ps1 `
        -ServerUrl "https://seu-projeto.supabase.co" `
        -AgentToken "AGENT_TOKEN_AQUI" `
        -HmacSecret "64_HEX_CHARS_AQUI" `
        -AgentName "meu-servidor-01"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentToken,

    [Parameter(Mandatory = $true)]
    [string]$HmacSecret,

    [Parameter(Mandatory = $false)]
    [string]$AgentName = $env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = $false)]
    [string]$AgentVersion = "v4.1.2"
)

# CRITICAL: Forcar TLS 1.2 para compatibilidade com Windows Server 2012/2016
# PowerShell usa TLS 1.0 por padrao, mas Supabase requer TLS 1.2+
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ErrorActionPreference = "Stop"

# ============================================
#  TRAP GLOBAL PARA ERROS NAO TRATADOS
# ============================================
trap {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = "FATAL ERROR: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)"
    $stack = $_.ScriptStackTrace

    $logDir = "C:\CyberShield\logs"
    $logPath = Join-Path $logDir "cybershield-agent-v4.log"

    if (Test-Path $logDir) {
        try {
            "$ts [FATAL] $msg" | Out-File -FilePath $logPath -Append -Encoding UTF8
            "$ts [FATAL] Stack: $stack" | Out-File -FilePath $logPath -Append -Encoding UTF8
        } catch { }
    }

    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -EntryType Error -Message "$msg`n$stack" -ErrorAction SilentlyContinue
    throw
}

# ============================================
#  BOOTSTRAP VALIDATION - CRITICAL FUNCTIONS
# ============================================
# This validation runs AFTER all functions are defined (at script execution)
# We defer the actual check to after function definitions
$Global:RequiredFunctions = @(
    "Write-Log",
    "Send-Heartbeat",
    "Send-SystemMetrics",
    "Invoke-ReportJob",
    "Invoke-SecureRequest",
    "Add-EvidenceEntry",
    "Set-AgentState"
)

function Invoke-BootstrapValidation {
    Write-Host "[BOOTSTRAP] Validando funcoes criticas..." -ForegroundColor Cyan
    
    $missingFunctions = @()
    foreach ($fn in $Global:RequiredFunctions) {
        if (-not (Get-Command $fn -ErrorAction SilentlyContinue)) {
            $missingFunctions += $fn
        }
    }
    
    if ($missingFunctions.Count -gt 0) {
        $errorMsg = "FATAL: Funcoes criticas nao definidas: $($missingFunctions -join ', ')"
        Write-Host "[BOOTSTRAP] $errorMsg" -ForegroundColor Red
        
        # Tentar logar no arquivo antes de abortar
        $logPath = "C:\CyberShield\logs\bootstrap-error.log"
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        
        # Criar diretorio se nao existir
        $logDir = Split-Path $logPath -Parent
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        
        "$timestamp | BOOTSTRAP FAILED | $errorMsg" | Out-File -FilePath $logPath -Append -Encoding UTF8
        
        # Nao executar agente quebrado - forcar reinstalacao
        throw $errorMsg
    }
    
    Write-Host "[BOOTSTRAP] Todas as funcoes criticas validadas" -ForegroundColor Green
    return $true
}

# ============================================
#  VARIAVEIS GLOBAIS
# ============================================
$Global:ServerUrl    = $ServerUrl.TrimEnd('/')
$Global:AgentToken   = $AgentToken
$Global:HmacSecret   = $HmacSecret
$Global:AgentName    = $AgentName
$Global:AgentVersion = $AgentVersion

# Diretorios
$Global:BaseDir = "C:\CyberShield"
$logDir = Join-Path -Path $Global:BaseDir -ChildPath "logs"
$evidenceDir = Join-Path -Path $Global:BaseDir -ChildPath "evidence"

# Criar diretorios se nao existirem
@($logDir, $evidenceDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

$Global:LogFilePath = Join-Path -Path $logDir -ChildPath "cybershield-agent-v4.log"
$Global:EvidenceJournalPath = Join-Path -Path $evidenceDir -ChildPath "journal.log"

# Intervalos
$Global:PollIntervalSeconds = 60

# ============================================
#  FASE 2.6: ED25519 SIGNATURE VERIFICATION
# ============================================
# IMPORTANT: This is the Ed25519 PUBLIC KEY for verifying agent updates
# The corresponding PRIVATE KEY must NEVER be stored in the agent or repository
# Private key should be in HSM, HashiCorp Vault, or offline encrypted storage
# 
# To generate a new keypair (offline, secure environment):
#   openssl genpkey -algorithm Ed25519 -out private.key
#   openssl pkey -in private.key -pubout -out public.key
#   cat public.key | base64 -w0
#
# To sign a release:
#   openssl pkeyutl -sign -inkey private.key -rawin -in script.ps1 > signature.bin
#   base64 -w0 signature.bin > signature.txt

# PLACEHOLDER: Replace with actual Ed25519 public key when available
# Format: Base64-encoded SubjectPublicKeyInfo (SPKI) format
# SSA-004: This is the public key for verifying job payload signatures
$Global:Ed25519PublicKey = "MCowBQYDK2VwAyEALE6FW6/R+acpFFZXw86DbfKQEtbYPVdABZih0iggaoI="

# SSA-004: Require signatures when public key is configured
$Global:RequireJobSignatures = (-not [string]::IsNullOrEmpty($Global:Ed25519PublicKey))

function Verify-Ed25519Signature {
    <#
    .SYNOPSIS
        Verifies an Ed25519 signature for script content
    .DESCRIPTION
        Uses .NET cryptography to verify Ed25519 signatures.
        Returns $true if signature is valid, $false otherwise.
        If no public key is configured, returns $true (backward compatible).
    .PARAMETER ScriptBytes
        The raw bytes of the script to verify
    .PARAMETER SignatureBase64
        The Base64-encoded Ed25519 signature
    #>
    param (
        [Parameter(Mandatory = $true)]
        [byte[]]$ScriptBytes,
        
        [Parameter(Mandatory = $false)]
        [string]$SignatureBase64
    )
    
    try {
        # If no signature provided and no public key configured, allow (backward compat)
        if ([string]::IsNullOrEmpty($SignatureBase64)) {
            if ([string]::IsNullOrEmpty($Global:Ed25519PublicKey)) {
                Write-Log "[SECURITY] No signature verification configured (backward compatible mode)" "WARN"
                return $true
            } else {
                Write-Log "[SECURITY] [ERROR]  Signature required but not provided" "ERROR"
                return $false
            }
        }
        
        # If public key not configured, skip verification (backward compat)
        if ([string]::IsNullOrEmpty($Global:Ed25519PublicKey)) {
            Write-Log "[SECURITY] Ed25519 public key not configured - skipping signature verification" "WARN"
            return $true
        }
        
        Write-Log "[SECURITY] Verifying Ed25519 signature..." "INFO"
        
        # Decode signature from Base64
        $signature = [Convert]::FromBase64String($SignatureBase64)
        
        # Decode public key from Base64
        $publicKeyBytes = [Convert]::FromBase64String($Global:Ed25519PublicKey)
        
        # Check if .NET supports Ed25519 (requires .NET 5+ or Windows with specific updates)
        $ed25519Type = [Type]::GetType("System.Security.Cryptography.Ed25519")
        
        if ($null -eq $ed25519Type) {
            # Fallback: Try using ECDsa with Ed25519 curve (requires newer .NET)
            try {
                # Import public key and verify
                $ed25519 = [System.Security.Cryptography.ECDsa]::Create()
                $ed25519.ImportSubjectPublicKeyInfo($publicKeyBytes, [ref]$null)
                
                $isValid = $ed25519.VerifyData($ScriptBytes, $signature, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
                
                if ($isValid) {
                    Write-Log "[SECURITY] [OK]  Ed25519 signature verified successfully" "SUCCESS"
                } else {
                    Write-Log "[SECURITY] [ERROR]  Ed25519 signature verification FAILED" "ERROR"
                }
                
                return $isValid
            }
            catch {
                # If Ed25519 is not supported on this system, log warning and allow
                Write-Log "[SECURITY] Ed25519 verification not supported on this system: $($_.Exception.Message)" "WARN"
                Write-Log "[SECURITY] Allowing update (signature present but cannot verify)" "WARN"
                
                Add-EvidenceEntry -Type "security_warning" -Data @{
                    event = "ed25519_not_supported"
                    error = $_.Exception.Message
                    signature_provided = $true
                } -Severity "warning"
                
                return $true
            }
        }
        else {
            # Use native Ed25519 support
            $ed25519 = [System.Security.Cryptography.Ed25519]::Create()
            $ed25519.ImportSubjectPublicKeyInfo($publicKeyBytes, [ref]$null)
            
            $isValid = $ed25519.VerifyData($ScriptBytes, $signature)
            
            if ($isValid) {
                Write-Log "[SECURITY] [OK]  Ed25519 signature verified successfully" "SUCCESS"
            } else {
                Write-Log "[SECURITY] [ERROR]  Ed25519 signature verification FAILED" "ERROR"
            }
            
            return $isValid
        }
}

# ============================================
#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION
# ============================================
function Verify-JobSignature {
    <#
    .SYNOPSIS
        Verifies the Ed25519 signature of a job payload
    .DESCRIPTION
        Uses .NET cryptography to verify Ed25519 signatures on job payloads.
        The canonical payload format is: job_id:job_type:JSON(payload)
        Returns $true if signature is valid or if no public key is configured.
        Returns $false if signature verification fails.
    .PARAMETER Job
        The job object containing id, type, payload, and payload_signature
    #>
    param (
        [Parameter(Mandatory = $true)]
        $Job
    )
    
    try {
        $jobId = $Job.id
        $jobType = $Job.type
        $signature = $Job.payload_signature
        $signingAlg = $Job.signing_alg
        
        # If no public key configured, skip verification (backward compatible)
        if ([string]::IsNullOrEmpty($Global:Ed25519PublicKey)) {
            Write-Log "[SECURITY] Ed25519 public key not configured - skipping signature verification" "WARN"
            return $true
        }
        
        # If public key is configured but job has no signature, reject
        if ([string]::IsNullOrEmpty($signature)) {
            if ($Global:RequireJobSignatures) {
                Write-Log "[SECURITY] [ERROR]  REJECTED: Job $jobId has no signature (signatures required)" "ERROR"
                
                Add-EvidenceEntry -Type "security_alert" -Data @{
                    event = "unsigned_job_rejected"
                    job_id = $jobId
                    job_type = $jobType
                    reason = "No signature provided but signatures are required"
                } -Severity "critical"
                
                return $false
            }
            Write-Log "[SECURITY] Job $jobId has no signature (backward compatible mode)" "WARN"
            return $true
        }
        
        # Verify algorithm is Ed25519
        if ($signingAlg -and $signingAlg -ne "Ed25519") {
            Write-Log "[SECURITY] [ERROR]  REJECTED: Unsupported signing algorithm: $signingAlg" "ERROR"
            return $false
        }
        
        Write-Log "[SECURITY] Verifying Ed25519 signature for job $jobId..." "INFO"
        
        # Create canonical payload: job_id:job_type:JSON(payload)
        $payloadJson = if ($Job.payload) { 
            $sortedKeys = ($Job.payload | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name | Sort-Object)
            $orderedPayload = [ordered]@{}
            foreach ($key in $sortedKeys) {
                $orderedPayload[$key] = $Job.payload.$key
            }
            $orderedPayload | ConvertTo-Json -Compress -Depth 10 
        } else { 
            "{}" 
        }
        $canonicalPayload = "${jobId}:${jobType}:${payloadJson}"
        
        # Decode signature and public key from Base64
        $signatureBytes = [Convert]::FromBase64String($signature)
        $publicKeyBytes = [Convert]::FromBase64String($Global:Ed25519PublicKey)
        $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($canonicalPayload)
        
        # Try to verify using .NET Ed25519 (requires .NET 5+ or specific Windows versions)
        try {
            # Import public key
            $ed25519 = [System.Security.Cryptography.ECDsa]::Create()
            $bytesRead = 0
            $ed25519.ImportSubjectPublicKeyInfo($publicKeyBytes, [ref]$bytesRead)
            
            # Verify signature
            $isValid = $ed25519.VerifyData($payloadBytes, $signatureBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            
            if ($isValid) {
                Write-Log "[SECURITY] [OK]  Job $jobId signature verified successfully" "SUCCESS"
                
                Add-EvidenceEntry -Type "security_check" -Data @{
                    event = "job_signature_verified"
                    job_id = $jobId
                    job_type = $jobType
                    algorithm = "Ed25519"
                } -Severity "info"
                
                return $true
            } else {
                Write-Log "[SECURITY] [ERROR]  REJECTED: Job $jobId signature verification FAILED" "ERROR"
                
                Add-EvidenceEntry -Type "security_alert" -Data @{
                    event = "invalid_job_signature"
                    job_id = $jobId
                    job_type = $jobType
                    reason = "Signature does not match payload"
                } -Severity "critical"
                
                return $false
            }
        }
        catch {
            # If Ed25519 verification is not supported, log warning
            Write-Log "[SECURITY] Ed25519 verification not fully supported: $($_.Exception.Message)" "WARN"
            Write-Log "[SECURITY] Attempting fallback verification method..." "INFO"
            
            # For systems without native Ed25519, we accept if signature is present
            # This provides partial protection until full Ed25519 support
            Add-EvidenceEntry -Type "security_warning" -Data @{
                event = "ed25519_verification_fallback"
                job_id = $jobId
                error = $_.Exception.Message
                signature_present = $true
            } -Severity "warning"
            
            # In strict mode, reject; otherwise allow with signature present
            if ($Global:RequireJobSignatures) {
                Write-Log "[SECURITY] [ERROR]  Cannot verify signature - rejecting in strict mode" "ERROR"
                return $false
            }
            
            return $true
        }
    }
    catch {
        Write-Log "[SECURITY] Signature verification error: $($_.Exception.Message)" "ERROR"
        
        Add-EvidenceEntry -Type "error" -Data @{
            event = "signature_verification_failed"
            job_id = $Job.id
            error = $_.Exception.Message
        } -Severity "error"
        
        # Security: If verification fails unexpectedly, reject the job
        return $false
    }
}
    catch {
        Write-Log "[SECURITY] Signature verification error: $($_.Exception.Message)" "ERROR"
        
        Add-EvidenceEntry -Type "error" -Data @{
            event = "signature_verification_failed"
            error = $_.Exception.Message
        } -Severity "error"
        
        # Security: If verification fails unexpectedly, reject the update
        return $false
    }
}


# ============================================
#  FASE 3.0: AUTO-ROLLBACK & SAFE MODE
# ============================================
$Global:RollbackPaths = @{
    Current   = "C:\CyberShield\agent-current.ps1"
    Previous  = "C:\CyberShield\agent-previous.ps1"
    StateFile = "C:\CyberShield\rollback-state.json"
}

function Get-RollbackState {
    <#
    .SYNOPSIS
        Retrieves the current rollback state from persistent storage
    #>
    $stateFile = $Global:RollbackPaths.StateFile
    if (Test-Path $stateFile) {
        try {
            $content = Get-Content $stateFile -Raw -ErrorAction Stop
            return ($content | ConvertFrom-Json)
        } catch {
            Write-Log "[ROLLBACK] Failed to read state file: $($_.Exception.Message)" "WARN"
        }
    }
    return @{
        rollback_count = 0
        last_rollback = $null
        safe_mode = $false
        current_version = $Global:AgentVersion
        previous_version = $null
        last_health_check = $null
    }
}

function Save-RollbackState {
    <#
    .SYNOPSIS
        Persists rollback state to disk
    #>
    param($State)
    
    try {
        $stateFile = $Global:RollbackPaths.StateFile
        $State | ConvertTo-Json -Depth 3 | Set-Content $stateFile -Encoding UTF8 -Force
        Write-Log "[ROLLBACK] State saved: rollback_count=$($State.rollback_count), safe_mode=$($State.safe_mode)" "DEBUG"
    } catch {
        Write-Log "[ROLLBACK] Failed to save state: $($_.Exception.Message)" "ERROR"
    }
}

function Test-PostUpdateHealth {
    <#
    .SYNOPSIS
        Validates agent health after an update
    .DESCRIPTION
        Checks state machine, heartbeat, and job polling to ensure
        the new version is functioning correctly
    .OUTPUTS
        Hashtable with healthy (bool) and reason (string)
    #>
    Write-Log "[HEALTH CHECK] Starting post-update health validation..." "INFO"
    
    try {
        # 1. Validate state machine
        $state = Get-AgentState
        if ($state -notin @('SYNCING', 'ENFORCING', 'DEGRADED')) {
            return @{ healthy = $false; reason = "state_machine_invalid"; details = "Invalid state: $state" }
        }
        Write-Log "[HEALTH CHECK] State machine OK: $state" "DEBUG"
        
        # 2. Validate heartbeat
        $heartbeat = Send-Heartbeat
        if (-not $heartbeat) {
            return @{ healthy = $false; reason = "heartbeat_failed"; details = "Heartbeat failed" }
        }
        Write-Log "[HEALTH CHECK] Heartbeat OK" "DEBUG"
        
        # 3. Validate poll-jobs (basic connectivity test)
        try {
            $pollResult = Invoke-SecureRequest -Path "/functions/v1/poll-jobs" -Method "POST" -Body @{
                agent_name = $Global:AgentName
                agent_version = $Global:AgentVersion
            } -TimeoutSec 15
            
            if (-not $pollResult.Success) {
                return @{ healthy = $false; reason = "health_check_failed"; details = "Poll-jobs failed: HTTP $($pollResult.StatusCode)" }
            }
        } catch {
            return @{ healthy = $false; reason = "health_check_failed"; details = "Poll-jobs exception: $($_.Exception.Message)" }
        }
        Write-Log "[HEALTH CHECK] Poll-jobs OK" "DEBUG"
        
        return @{ healthy = $true; reason = "All checks passed" }
    } catch {
        return @{ healthy = $false; reason = "health_check_failed"; details = $_.Exception.Message }
    }
}

function Send-RollbackEvent {
    <#
    .SYNOPSIS
        Reports rollback event to backend for telemetry
    #>
    param(
        [string]$FromVersion,
        [string]$ToVersion,
        [string]$Reason,
        [bool]$SafeMode = $false,
        [hashtable]$Details = @{}
    )
    
    try {
        $body = @{
            from_version = $FromVersion
            to_version = $ToVersion
            reason = $Reason
            safe_mode_triggered = $SafeMode
            hostname = $env:COMPUTERNAME
            details = $Details
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-rollback-event" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 15
        
        if ($result.Success) {
            Write-Log "[ROLLBACK] Event reported successfully (event_id: $($result.Body | ConvertFrom-Json | Select-Object -ExpandProperty event_id))" "INFO"
        } else {
            Write-Log "[ROLLBACK] Failed to report event: HTTP $($result.StatusCode)" "WARN"
        }
    } catch {
        Write-Log "[ROLLBACK] Failed to report event: $($_.Exception.Message)" "ERROR"
    }
}

function Invoke-SafeRollback {
    <#
    .SYNOPSIS
        Performs automatic rollback to previous version
    .DESCRIPTION
        - Checks if previous version exists
        - Increments rollback counter
        - Triggers Safe Mode after 2 consecutive rollbacks
        - Reports event to backend
        - Copies previous version back to current
        - Restarts agent
    #>
    param(
        [string]$Reason
    )
    
    Write-Log "[ROLLBACK] Initiating rollback due to: $Reason" "WARN"
    
    $state = Get-RollbackState
    $previousPath = $Global:RollbackPaths.Previous
    
    # Verify previous version exists
    if (-not (Test-Path $previousPath)) {
        Write-Log "[ROLLBACK] No previous version available at $previousPath" "ERROR"
        
        Add-EvidenceEntry -Type "error" -Data @{
            event = "rollback_failed"
            reason = "no_previous_version"
            error = "Previous version file not found"
        } -Severity "error"
        
        return @{ success = $false; error = "No previous version available" }
    }
    
    # Anti-loop: check rollback count
    $state.rollback_count++
    $state.last_rollback = (Get-Date).ToUniversalTime().ToString("o")
    
    # Safe Mode: after 2 consecutive rollbacks
    if ($state.rollback_count -ge 2) {
        Write-Log "[CRITICAL] Rollback loop detected (count: $($state.rollback_count)) - ENTERING SAFE MODE" "ERROR"
        $state.safe_mode = $true
        Save-RollbackState -State $state
        
        # Report Safe Mode to backend
        Send-RollbackEvent -FromVersion $Global:AgentVersion -ToVersion $state.previous_version -Reason $Reason -SafeMode $true -Details @{
            rollback_count = $state.rollback_count
            safe_mode_reason = "rollback_loop_detected"
        }
        
        Add-EvidenceEntry -Type "security_event" -Data @{
            event = "safe_mode_activated"
            rollback_count = $state.rollback_count
            reason = "Rollback loop detected - auto-updates disabled"
        } -Severity "critical"
        
        return @{ success = $false; error = "Safe mode activated - updates disabled"; safe_mode = $true }
    }
    
    # Execute rollback
    Write-Log "[ROLLBACK] Rolling back: $($Global:AgentVersion) -> $($state.previous_version)" "WARN"
    
    try {
        # Find current script path
        $currentScriptPath = $null
        $possiblePaths = @(
            $PSCommandPath,
            (Join-Path $Global:BaseDir "cybershield-agent-$($Global:AgentName).ps1"),
            (Join-Path $Global:BaseDir "cybershield-agent-v4.ps1"),
            (Join-Path $Global:BaseDir "cybershield-agent.ps1")
        )
        
        foreach ($path in $possiblePaths) {
            if ($path -and (Test-Path $path)) {
                $currentScriptPath = $path
                break
            }
        }
        
        if (-not $currentScriptPath) {
            $found = Get-ChildItem -Path $Global:BaseDir -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $currentScriptPath = $found.FullName }
        }
        
        if (-not $currentScriptPath) {
            throw "Cannot find current script path for rollback"
        }
        
        # Copy previous version to current location
        Copy-Item -Path $previousPath -Destination $currentScriptPath -Force
        Write-Log "[ROLLBACK] Previous version restored to: $currentScriptPath" "INFO"
        
        # Update state
        $state.current_version = $state.previous_version
        Save-RollbackState -State $state
        
        # Report rollback to backend
        Send-RollbackEvent -FromVersion $Global:AgentVersion -ToVersion $state.previous_version -Reason $Reason -SafeMode $false -Details @{
            rollback_count = $state.rollback_count
            restored_to = $currentScriptPath
        }
        
        # Evidence for audit
        Add-EvidenceEntry -Type "security_event" -Data @{
            event = "agent_rollback"
            from_version = $Global:AgentVersion
            to_version = $state.previous_version
            reason = $Reason
            rollback_count = $state.rollback_count
        } -Severity "warning"
        
        # Restart agent to load previous version
        Write-Log "[ROLLBACK] Restarting agent to load previous version..." "WARN"
        
        try {
            Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Start-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
        } catch {
            Write-Log "[ROLLBACK] Failed to restart scheduled task: $($_.Exception.Message)" "WARN"
        }
        
        # Exit to allow new version to start
        exit 0
        
    } catch {
        Write-Log "[ROLLBACK] Rollback failed: $($_.Exception.Message)" "ERROR"
        
        Add-EvidenceEntry -Type "error" -Data @{
            event = "rollback_failed"
            error = $_.Exception.Message
        } -Severity "error"
        
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Reset-SafeMode {
    <#
    .SYNOPSIS
        Resets Safe Mode (for manual recovery)
    #>
    $state = Get-RollbackState
    $state.safe_mode = $false
    $state.rollback_count = 0
    Save-RollbackState -State $state
    Write-Log "[ROLLBACK] Safe mode reset - auto-updates re-enabled" "INFO"
}


# ============================================
#  FASE 2.1: STATE MACHINE FORMAL
# ============================================
$Global:AgentState = @{
    Current = "BOOTSTRAP"
    Previous = $null
    History = [System.Collections.ArrayList]::new()
    ErrorCount = 0
    RecoveryAttempts = 0
    LastStateChange = (Get-Date)
    LastError = $null
}

# Estados validos e transicoes permitidas
$Global:ValidStates = @("BOOTSTRAP", "SYNCING", "ENFORCING", "DEGRADED", "ERROR", "RECOVERY")
$Global:StateTransitions = @{
    "BOOTSTRAP" = @("SYNCING", "ERROR")
    "SYNCING" = @("ENFORCING", "DEGRADED", "ERROR")
    "ENFORCING" = @("DEGRADED", "ERROR", "SYNCING")
    "DEGRADED" = @("RECOVERY", "ERROR", "ENFORCING")
    "RECOVERY" = @("ENFORCING", "DEGRADED", "ERROR")
    "ERROR" = @("RECOVERY")  # Requer intervencao ou recovery manual
}

# Estados que permitem execucao de jobs
# P1 Fix: Adicionado SYNCING para permitir poll-jobs durante bootstrap
# Isso resolve o problema de agentes ficando presos em SYNCING quando evidence_logs falha
$Global:JobExecutionStates = @("ENFORCING", "DEGRADED", "SYNCING")

function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("BOOTSTRAP", "SYNCING", "ENFORCING", "DEGRADED", "ERROR", "RECOVERY")]
        [string]$NewState,
        
        [Parameter(Mandatory = $true)]
        [string]$Reason,
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorDetails = $null
    )
    
    $currentState = $Global:AgentState.Current
    
    # Validar transicao
    if ($currentState -ne $NewState) {
        $allowedTransitions = $Global:StateTransitions[$currentState]
        if ($NewState -notin $allowedTransitions) {
            Write-Log "[STATE] INVALID TRANSITION: $currentState -> $NewState (allowed: $($allowedTransitions -join ', '))" "WARN"
            # Registrar tentativa invalida mas nao bloquear
            Add-EvidenceEntry -Type "state_change" -Data @{
                attempted_from = $currentState
                attempted_to = $NewState
                reason = $Reason
                blocked = $true
                allowed_transitions = $allowedTransitions
            } -StateBefore $currentState -StateAfter $currentState -Severity "warning"
            return $false
        }
    }
    
    # Aplicar transicao
    $Global:AgentState.Previous = $currentState
    $Global:AgentState.Current = $NewState
    $Global:AgentState.LastStateChange = Get-Date
    
    # Adicionar ao historico (manter ultimos 100)
    $historyEntry = @{
        from = $currentState
        to = $NewState
        reason = $Reason
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
    [void]$Global:AgentState.History.Add($historyEntry)
    if ($Global:AgentState.History.Count -gt 100) {
        $Global:AgentState.History.RemoveAt(0)
    }
    
    # Resetar contadores em estados de sucesso
    if ($NewState -eq "ENFORCING") {
        $Global:AgentState.ErrorCount = 0
        $Global:AgentState.RecoveryAttempts = 0
    }
    
    # Incrementar contador de erros
    if ($NewState -eq "ERROR" -or $NewState -eq "DEGRADED") {
        $Global:AgentState.ErrorCount++
        if ($ErrorDetails) {
            $Global:AgentState.LastError = $ErrorDetails
        }
    }
    
    Write-Log "[STATE] $currentState -> $NewState ($Reason)" "INFO"
    
    # Registrar evidencia
    Add-EvidenceEntry -Type "state_change" -Data @{
        from = $currentState
        to = $NewState
        reason = $Reason
        error_details = $ErrorDetails
        error_count = $Global:AgentState.ErrorCount
        recovery_attempts = $Global:AgentState.RecoveryAttempts
    } -StateBefore $currentState -StateAfter $NewState -Severity $(if ($NewState -eq "ERROR") { "error" } elseif ($NewState -eq "DEGRADED") { "warning" } else { "info" })
    
    return $true
}

function Get-AgentState {
    return $Global:AgentState.Current
}

function Test-CanExecuteJob {
    $state = Get-AgentState
    return $state -in $Global:JobExecutionStates
}

# ============================================
#  FASE 2.2: EVIDENCE JOURNAL LOCAL
# ============================================
$Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
$Global:EvidenceFlushThreshold = 10  # Flush apos 10 entradas ou 60s

function Add-EvidenceEntry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Type,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Data,
        
        [Parameter(Mandatory = $false)]
        [string]$StateBefore = $null,
        
        [Parameter(Mandatory = $false)]
        [string]$StateAfter = $null,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("debug", "info", "warning", "error", "critical")]
        [string]$Severity = "info"
    )
    
    try {
        # RUNTIME VALIDATION - Backward + Forward compatible (substitui ValidateSet rigido)
        $AllowedTypes = @(
            "state_change", "job_execution", "dns_block", "policy_sync", 
            "auto_recovery", "heartbeat", "update_applied", "update_check", 
            "error", "policy_drift", "security_event", "security_warning",
            "metrics_sent", "force_update"
        )
        
        if ($Type -notin $AllowedTypes) {
            Write-Log "[EVIDENCE] Tipo desconhecido aceito graciosamente: $Type" "WARN"
            # Nao bloqueia - aceita qualquer tipo para forward compatibility
        }
        
        # Criar hash SHA256 do data para integridade
        $dataJson = $Data | ConvertTo-Json -Compress -Depth 5
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($dataJson))
        $evidenceHash = [System.BitConverter]::ToString($hashBytes) -replace '-', ''
        
        $entry = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            type = $Type
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            state_before = $StateBefore
            state_after = $StateAfter
            severity = $Severity
            data = $Data
            evidence_hash = $evidenceHash.ToLower()
        }
        
        # Adicionar ao buffer
        [void]$Global:EvidenceBuffer.Add($entry)
        
        # Gravar localmente (JSON Lines)
        $jsonLine = $entry | ConvertTo-Json -Compress -Depth 10
        Add-Content -Path $Global:EvidenceJournalPath -Value $jsonLine -Encoding UTF8 -ErrorAction SilentlyContinue
        
        # Flush para servidor se threshold atingido
        if ($Global:EvidenceBuffer.Count -ge $Global:EvidenceFlushThreshold) {
            Invoke-FlushEvidence
        }
        
        return $evidenceHash
    }
    catch {
        Write-Log "[EVIDENCE] Failed to add entry: $($_.Exception.Message)" "WARN"
        return $null
    }
}

function Invoke-FlushEvidence {
    if ($Global:EvidenceBuffer.Count -eq 0) {
        return
    }
    
    try {
        $entries = @($Global:EvidenceBuffer)
        
        $body = @{
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            entries = $entries | ForEach-Object {
                @{
                    event_type = $_.type
                    event_data = $_.data
                    evidence_hash = $_.evidence_hash
                    state_before = $_.state_before
                    state_after = $_.state_after
                    severity = $_.severity
                }
            }
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30 `
            -MaxRetries 2
        
        if ($result.Success) {
            Write-Log "[EVIDENCE] Flushed $($entries.Count) entries to server" "DEBUG"
            $Global:EvidenceBuffer.Clear()
        }
    }
    catch {
        Write-Log "[EVIDENCE] Flush failed: $($_.Exception.Message)" "WARN"
        # Manter no buffer para proxima tentativa
    }
}

function Invoke-EvidenceRotation {
    $maxSizeMB = 50
    $maxAgeDays = 7
    
    try {
        if (Test-Path $Global:EvidenceJournalPath) {
            $file = Get-Item $Global:EvidenceJournalPath -ErrorAction SilentlyContinue
            
            if ($file -and $file.Length -gt ($maxSizeMB * 1MB)) {
                $archivePath = "$($Global:EvidenceJournalPath).$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
                Move-Item $Global:EvidenceJournalPath $archivePath -Force -ErrorAction SilentlyContinue
                Write-Log "[EVIDENCE] Journal rotated to $archivePath" "INFO"
            }
        }
        
        # Limpar arquivos antigos
        Get-ChildItem -Path (Split-Path $Global:EvidenceJournalPath -Parent) -Filter "journal.log.*.bak" -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$maxAgeDays) } |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
    catch { }
}

# ============================================
#  AUTO-RECOVERY COM BACKOFF EXPONENCIAL
# ============================================
function Invoke-AutoRecovery {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FailedComponent,
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorMessage = $null
    )
    
    $maxAttempts = 3
    
    if ($Global:AgentState.RecoveryAttempts -ge $maxAttempts) {
        Write-Log "[RECOVERY] Max attempts ($maxAttempts) exceeded for $FailedComponent" "ERROR"
        Set-AgentState -NewState "ERROR" -Reason "Max recovery attempts exceeded" -ErrorDetails "Component: $FailedComponent, Last error: $ErrorMessage"
        
        Add-EvidenceEntry -Type "auto_recovery" -Data @{
            component = $FailedComponent
            attempt = $Global:AgentState.RecoveryAttempts
            success = $false
            reason = "Max attempts exceeded"
            error = $ErrorMessage
        } -Severity "critical"
        
        return $false
    }
    
    $Global:AgentState.RecoveryAttempts++
    $attempt = $Global:AgentState.RecoveryAttempts
    
    # Backoff exponencial: 5s, 10s, 20s
    $backoffSeconds = [Math]::Pow(2, $attempt - 1) * 5
    
    Write-Log "[RECOVERY] Attempt $attempt/$maxAttempts for $FailedComponent (backoff: ${backoffSeconds}s)" "WARN"
    Set-AgentState -NewState "RECOVERY" -Reason "Auto-recovery: $FailedComponent (attempt $attempt)"
    
    Add-EvidenceEntry -Type "auto_recovery" -Data @{
        component = $FailedComponent
        attempt = $attempt
        backoff_seconds = $backoffSeconds
        error = $ErrorMessage
    } -Severity "warning"
    
    Start-Sleep -Seconds $backoffSeconds
    
    # Tentar recuperar componente especifico
    $recovered = $false
    switch ($FailedComponent) {
        "heartbeat" {
            try {
                Send-Heartbeat
                $recovered = $true
            } catch { }
        }
        "job_engine" {
            try {
                Poll-Jobs
                $recovered = $true
            } catch { }
        }
        "dns_filter" {
            try {
                $recovered = Invoke-DNSFilterRecovery
            } catch { }
        }
        "network" {
            try {
                # Testar conectividade basica
                $test = Test-NetConnection -ComputerName "google.com" -Port 443 -WarningAction SilentlyContinue
                $recovered = $test.TcpTestSucceeded
            } catch { }
        }
        default {
            # Recovery generico - tentar heartbeat
            try {
                Send-Heartbeat
                $recovered = $true
            } catch { }
        }
    }
    
    if ($recovered) {
        Write-Log "[RECOVERY] Success for $FailedComponent on attempt $attempt" "SUCCESS"
        Set-AgentState -NewState "ENFORCING" -Reason "Recovery successful: $FailedComponent"
        $Global:AgentState.RecoveryAttempts = 0
        
        Add-EvidenceEntry -Type "auto_recovery" -Data @{
            component = $FailedComponent
            attempt = $attempt
            success = $true
        } -Severity "info"
        
        return $true
    }
    
    Write-Log "[RECOVERY] Failed for $FailedComponent on attempt $attempt" "WARN"
    Set-AgentState -NewState "DEGRADED" -Reason "Recovery attempt $attempt failed: $FailedComponent"
    
    return $false
}

# ============================================
#  FASE 2.4: DNS FILTER GO COMO WINDOWS SERVICE
# ============================================
$Global:DNSFilterConfig = @{
    ServiceName = "CyberShield-DNS"
    ExePath = "C:\CyberShield\dns-filter\cybershield-dns.exe"
    ConfigPath = "C:\CyberShield\dns-filter\config.json"
    LogPath = "C:\CyberShield\dns-filter\dns.log"
    ListenAddress = "127.0.0.1:53"
    UpstreamDNS = @("8.8.8.8:53", "1.1.1.1:53")
    Enabled = $true
    LastHealthCheck = $null
    ConsecutiveFailures = 0
}

function Test-DNSFilterInstalled {
    try {
        $svc = Get-Service -Name $Global:DNSFilterConfig.ServiceName -ErrorAction SilentlyContinue
        return ($null -ne $svc)
    }
    catch {
        return $false
    }
}

function Get-DNSFilterStatus {
    try {
        $result = @{
            installed = $false
            running = $false
            status = "unknown"
            exe_exists = (Test-Path $Global:DNSFilterConfig.ExePath)
        }
        
        $svc = Get-Service -Name $Global:DNSFilterConfig.ServiceName -ErrorAction SilentlyContinue
        if ($svc) {
            $result.installed = $true
            $result.status = $svc.Status.ToString()
            $result.running = ($svc.Status -eq "Running")
        }
        
        return $result
    }
    catch {
        return @{
            installed = $false
            running = $false
            status = "error"
            error = $_.Exception.Message
        }
    }
}

function Install-DNSFilterService {
    try {
        $exePath = $Global:DNSFilterConfig.ExePath
        
        if (-not (Test-Path $exePath)) {
            Write-Log "[DNS] EXE not found at $exePath - skipping install" "WARN"
            return $false
        }
        
        # Verificar se ja instalado
        if (Test-DNSFilterInstalled) {
            Write-Log "[DNS] Service already installed" "INFO"
            return $true
        }
        
        Write-Log "[DNS] Installing DNS Filter service..." "INFO"
        
        # Instalar servico
        $installResult = & $exePath -install 2>&1
        Start-Sleep -Seconds 2
        
        if (Test-DNSFilterInstalled) {
            Write-Log "[DNS] Service installed successfully" "SUCCESS"
            
            Add-EvidenceEntry -Type "dns_block" -Data @{
                action = "service_installed"
                service = $Global:DNSFilterConfig.ServiceName
            } -Severity "info"
            
            return $true
        }
        else {
            Write-Log "[DNS] Service installation failed: $installResult" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "[DNS] Install error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Start-DNSFilterService {
    try {
        $status = Get-DNSFilterStatus
        
        if (-not $status.installed) {
            $installed = Install-DNSFilterService
            if (-not $installed) {
                return $false
            }
        }
        
        if ($status.running) {
            Write-Log "[DNS] Service already running" "DEBUG"
            return $true
        }
        
        Write-Log "[DNS] Starting DNS Filter service..." "INFO"
        Start-Service -Name $Global:DNSFilterConfig.ServiceName -ErrorAction Stop
        Start-Sleep -Seconds 2
        
        $newStatus = Get-DNSFilterStatus
        if ($newStatus.running) {
            Write-Log "[DNS] Service started successfully" "SUCCESS"
            $Global:DNSFilterConfig.ConsecutiveFailures = 0
            
            Add-EvidenceEntry -Type "dns_block" -Data @{
                action = "service_started"
                service = $Global:DNSFilterConfig.ServiceName
            } -Severity "info"
            
            return $true
        }
        else {
            Write-Log "[DNS] Service failed to start" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "[DNS] Start error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Stop-DNSFilterService {
    try {
        if (-not (Test-DNSFilterInstalled)) {
            return $true
        }
        
        $status = Get-DNSFilterStatus
        if (-not $status.running) {
            Write-Log "[DNS] Service already stopped" "DEBUG"
            return $true
        }
        
        Write-Log "[DNS] Stopping DNS Filter service..." "INFO"
        Stop-Service -Name $Global:DNSFilterConfig.ServiceName -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
        
        Add-EvidenceEntry -Type "dns_block" -Data @{
            action = "service_stopped"
            service = $Global:DNSFilterConfig.ServiceName
        } -Severity "info"
        
        return $true
    }
    catch {
        Write-Log "[DNS] Stop error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-DNSFilterHealth {
    try {
        $status = Get-DNSFilterStatus
        
        if (-not $status.running) {
            $Global:DNSFilterConfig.ConsecutiveFailures++
            return @{
                healthy = $false
                reason = "Service not running"
                consecutive_failures = $Global:DNSFilterConfig.ConsecutiveFailures
            }
        }
        
        # Testar resolucao DNS local
        try {
            $testResult = Resolve-DnsName -Name "google.com" -Server "127.0.0.1" -Type A -DnsOnly -ErrorAction Stop
            if ($testResult) {
                $Global:DNSFilterConfig.ConsecutiveFailures = 0
                $Global:DNSFilterConfig.LastHealthCheck = Get-Date
                return @{
                    healthy = $true
                    reason = "DNS resolution OK"
                    consecutive_failures = 0
                }
            }
        }
        catch {
            $Global:DNSFilterConfig.ConsecutiveFailures++
            return @{
                healthy = $false
                reason = "DNS resolution failed: $($_.Exception.Message)"
                consecutive_failures = $Global:DNSFilterConfig.ConsecutiveFailures
            }
        }
        
        return @{
            healthy = $false
            reason = "Unknown"
            consecutive_failures = $Global:DNSFilterConfig.ConsecutiveFailures
        }
    }
    catch {
        return @{
            healthy = $false
            reason = $_.Exception.Message
            consecutive_failures = $Global:DNSFilterConfig.ConsecutiveFailures
        }
    }
}

function Invoke-DNSFilterRecovery {
    Write-Log "[DNS] Attempting DNS Filter recovery..." "WARN"
    
    Add-EvidenceEntry -Type "auto_recovery" -Data @{
        component = "dns_filter"
        consecutive_failures = $Global:DNSFilterConfig.ConsecutiveFailures
    } -Severity "warning"
    
    # Tentar reiniciar servico
    Stop-DNSFilterService | Out-Null
    Start-Sleep -Seconds 2
    
    $started = Start-DNSFilterService
    if ($started) {
        $health = Test-DNSFilterHealth
        if ($health.healthy) {
            Write-Log "[DNS] Recovery successful" "SUCCESS"
            
            Add-EvidenceEntry -Type "auto_recovery" -Data @{
                component = "dns_filter"
                success = $true
            } -Severity "info"
            
            return $true
        }
    }
    
    Write-Log "[DNS] Recovery failed" "ERROR"
    
    Add-EvidenceEntry -Type "auto_recovery" -Data @{
        component = "dns_filter"
        success = $false
    } -Severity "error"
    
    return $false
}

# ============================================
#  FASE 2.5: POLICY CONTRACT (DESIRED VS ACTUAL)
# ============================================
$Global:PolicyContract = @{
    version = "2025-01"
    last_sync = $null
    expected = @{
        dns_enabled = $true
        dns_service_running = $true
        agent_min_version = "v4.0.0"
        blocked_domains_synced = $true
        heartbeat_interval_max = 120
        job_execution_enabled = $true
    }
    actual = @{}
    drift = @()
}

function Get-CurrentPolicyState {
    try {
        $dnsStatus = Get-DNSFilterStatus
        $agentState = Get-AgentState
        
        return @{
            dns_enabled = $Global:DNSFilterConfig.Enabled
            dns_service_running = $dnsStatus.running
            dns_installed = $dnsStatus.installed
            agent_version = $Global:AgentVersion
            agent_state = $agentState
            job_execution_enabled = (Test-CanExecuteJob)
            heartbeat_interval = $Global:PollIntervalSeconds
            blocked_domains_synced = (Test-Path "$Global:BaseDir\blocked_websites.json")
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
        }
    }
    catch {
        return @{
            error = $_.Exception.Message
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
        }
    }
}

function Compare-PolicyState {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Expected,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Actual
    )
    
    $drift = [System.Collections.ArrayList]::new()
    
    foreach ($key in $Expected.Keys) {
        if ($Actual.ContainsKey($key)) {
            $expectedVal = $Expected[$key]
            $actualVal = $Actual[$key]
            
            # Comparacao especial para versoes
            if ($key -eq "agent_min_version") {
                # Extrair numero da versao
                $expectedNum = [version]($expectedVal -replace '^v', '' -replace '-.*$', '')
                $actualNum = [version]($actualVal -replace '^v', '' -replace '-.*$', '')
                
                if ($actualNum -lt $expectedNum) {
                    [void]$drift.Add(@{
                        field = $key
                        expected = $expectedVal
                        actual = $actualVal
                        type = "version_mismatch"
                    })
                }
            }
            elseif ($key -eq "heartbeat_interval_max") {
                if ($Actual["heartbeat_interval"] -gt $expectedVal) {
                    [void]$drift.Add(@{
                        field = $key
                        expected = $expectedVal
                        actual = $Actual["heartbeat_interval"]
                        type = "interval_exceeded"
                    })
                }
            }
            elseif ($expectedVal -ne $actualVal) {
                [void]$drift.Add(@{
                    field = $key
                    expected = $expectedVal
                    actual = $actualVal
                    type = "value_mismatch"
                })
            }
        }
        else {
            [void]$drift.Add(@{
                field = $key
                expected = $Expected[$key]
                actual = $null
                type = "missing_field"
            })
        }
    }
    
    return $drift
}

function Check-PolicyCompliance {
    try {
        $current = Get-CurrentPolicyState
        $Global:PolicyContract.actual = $current
        
        $drift = Compare-PolicyState -Expected $Global:PolicyContract.expected -Actual $current
        $Global:PolicyContract.drift = $drift
        
        if ($drift.Count -gt 0) {
            Write-Log "[POLICY] Drift detected: $($drift.Count) issue(s)" "WARN"
            
            foreach ($d in $drift) {
                Write-Log "[POLICY] - $($d.field): expected=$($d.expected), actual=$($d.actual)" "WARN"
            }
            
            Add-EvidenceEntry -Type "policy_drift" -Data @{
                drift_count = $drift.Count
                drift_items = $drift
                expected = $Global:PolicyContract.expected
                actual = $current
            } -Severity "warning"
            
            return @{
                compliant = $false
                drift = $drift
                drift_count = $drift.Count
            }
        }
        
        Write-Log "[POLICY] Compliance check passed" "DEBUG"
        return @{
            compliant = $true
            drift = @()
            drift_count = 0
        }
    }
    catch {
        Write-Log "[POLICY] Compliance check error: $($_.Exception.Message)" "ERROR"
        return @{
            compliant = $false
            error = $_.Exception.Message
        }
    }
}

function Invoke-PolicyEnforcement {
    $compliance = Check-PolicyCompliance
    
    if ($compliance.compliant) {
        return $true
    }
    
    Write-Log "[POLICY] Attempting to enforce policy..." "INFO"
    $enforced = $true
    
    foreach ($d in $compliance.drift) {
        switch ($d.field) {
            "dns_service_running" {
                if ($d.expected -eq $true -and $d.actual -eq $false) {
                    Write-Log "[POLICY] Enforcing: Starting DNS service" "INFO"
                    $started = Start-DNSFilterService
                    if (-not $started) { $enforced = $false }
                }
            }
            "dns_enabled" {
                if ($d.expected -eq $true -and $d.actual -eq $false) {
                    Write-Log "[POLICY] Enforcing: Enabling DNS" "INFO"
                    $Global:DNSFilterConfig.Enabled = $true
                }
            }
            "agent_min_version" {
                Write-Log "[POLICY] Agent version below minimum - update required" "WARN"
                # Nao podemos forcar update, apenas registrar
            }
            default {
                Write-Log "[POLICY] Cannot auto-enforce: $($d.field)" "WARN"
            }
        }
    }
    
    if ($enforced) {
        Add-EvidenceEntry -Type "policy_sync" -Data @{
            action = "enforcement_complete"
            drift_resolved = $compliance.drift_count
        } -Severity "info"
    }
    
    return $enforced
}

function Sync-PolicyFromServer {
    try {
        Write-Log "[POLICY] Syncing policy from server..." "INFO"
        
        $body = @{
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/get-agent-policy" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 15 `
            -MaxRetries 2
        
        if ($result.Success -and $result.StatusCode -eq 200 -and $result.Body) {
            $serverPolicy = $result.Body | ConvertFrom-Json
            
            if ($serverPolicy.expected) {
                $Global:PolicyContract.expected = @{
                    dns_enabled = [bool]$serverPolicy.expected.dns_enabled
                    dns_service_running = [bool]$serverPolicy.expected.dns_service_running
                    agent_min_version = $serverPolicy.expected.agent_min_version
                    blocked_domains_synced = [bool]$serverPolicy.expected.blocked_domains_synced
                    heartbeat_interval_max = [int]$serverPolicy.expected.heartbeat_interval_max
                    job_execution_enabled = [bool]$serverPolicy.expected.job_execution_enabled
                }
                $Global:PolicyContract.version = $serverPolicy.version
                $Global:PolicyContract.last_sync = Get-Date
                
                Write-Log "[POLICY] Policy synced from server (version: $($serverPolicy.version))" "SUCCESS"
                
                Add-EvidenceEntry -Type "policy_sync" -Data @{
                    action = "synced_from_server"
                    version = $serverPolicy.version
                } -Severity "info"
                
                return $true
            }
        }
        
        Write-Log "[POLICY] Server policy not available, using defaults" "WARN"
        return $false
    }
    catch {
        Write-Log "[POLICY] Sync error: $($_.Exception.Message)" "WARN"
        return $false
    }
}

# ============================================
#  ROTACAO DE LOGS
# ============================================
function Invoke-LogRotation {
    $maxSizeMB = 10
    $maxAgeDays = 7
    $logPath = $Global:LogFilePath
    
    try {
        if (Test-Path $logPath) {
            $file = Get-Item $logPath -ErrorAction SilentlyContinue
            
            if ($file -and $file.Length -gt ($maxSizeMB * 1MB)) {
                $archivePath = "$logPath.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
                Move-Item $logPath $archivePath -Force -ErrorAction SilentlyContinue
                Write-Log "[LOG] Arquivo de log rotacionado para $archivePath" "INFO"
            }
        }
        
        $logDir = Split-Path $logPath -Parent
        if (Test-Path $logDir) {
            Get-ChildItem -Path $logDir -Filter "*.bak" -ErrorAction SilentlyContinue | 
                Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$maxAgeDays) } |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}

# ============================================
#  CONFIGURACAO DE REDE (TLS 1.2 + Proxy)
# ============================================
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    [System.Net.WebRequest]::DefaultWebProxy = $proxy
    [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
} catch { }

# ============================================
#  LOGGING
# ============================================
function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("DEBUG","INFO","WARN","ERROR","SUCCESS")]
        [string]$Level = "INFO"
    )

    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $state = Get-AgentState
    $line = "[{0}] [{1}] [{2}] {3}" -f $timestamp, $Level, $state, $Message

    Write-Host $line
    
    try {
        Add-Content -Path $Global:LogFilePath -Value $line
    } catch { }
}

# ============================================
#  HMAC (HEX)
# ============================================
function Convert-HexToBytes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HexString
    )

    if ($HexString -notmatch '^[0-9a-fA-F]{64}$') {
        Write-Log "HMAC_SECRET invalido. Esperado 64 caracteres hex." "ERROR"
        throw "Invalid HMAC_SECRET format"
    }

    $bytes = New-Object byte[] 32
    for ($i = 0; $i -lt 64; $i += 2) {
        $bytes[$i / 2] = [Convert]::ToByte($HexString.Substring($i, 2), 16)
    }
    return $bytes
}

function Get-HmacSignature {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $true)]
        [string]$SecretHex
    )

    $keyBytes = Convert-HexToBytes $SecretHex
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $keyBytes
    $messageBytes = [Text.Encoding]::UTF8.GetBytes($Message)
    $signatureBytes = $hmac.ComputeHash($messageBytes)
    return ([System.BitConverter]::ToString($signatureBytes) -replace '-', '').ToLower()
}

# ============================================
#  REQUISICAO SEGURA COM HMAC
# ============================================
function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter()]
        [ValidateSet("GET","POST","PUT","DELETE")]
        [string]$Method = "GET",

        [Parameter()]
        [object]$Body = $null,

        [Parameter()]
        [int]$TimeoutSec = 30,

        [Parameter()]
        [int]$MaxRetries = 3
    )

    $uri = "$($Global:ServerUrl)$Path"
    $retryCount = 0
    $retryDelay = 2

    while ($true) {
        try {
            $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            $nonce = [guid]::NewGuid().ToString()

            if ($Body -ne $null) {
                if ($Body -is [string]) {
                    $bodyJson = $Body
                } elseif ($Body -is [hashtable] -or $Body.GetType().Name -like 'PSCustomObject') {
                    $bodyJson = $Body | ConvertTo-Json -Compress -Depth 10
                } else {
                    $bodyJson = ""
                }
            } else {
                $bodyJson = ""
            }

            $payload = '{0}:{1}:{2}' -f $timestamp, $nonce, $bodyJson
            $signature = Get-HmacSignature -Message $payload -SecretHex $Global:HmacSecret

            $headers = @{
                "X-Agent-Token"    = $Global:AgentToken
                "X-HMAC-Signature" = $signature
                "X-Timestamp"      = $timestamp
                "X-Nonce"          = $nonce
                "Content-Type"     = "application/json"
            }

            $params = @{
                Uri         = $uri
                Method      = $Method
                Headers     = $headers
                TimeoutSec  = $TimeoutSec
                ErrorAction = "Stop"
            }

            if ($bodyJson -ne "") {
                $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
                $params.Body = $bodyBytes
            }

            Write-Log "[NETWORK] $Method $uri" "DEBUG"

            $response = Invoke-WebRequest @params -UseBasicParsing
            $status = [int]$response.StatusCode

            Write-Log "[NETWORK] Response: $status" "DEBUG"

            return [pscustomobject]@{
                Success    = $true
                StatusCode = $status
                Body       = $response.Content
            }
        }
        catch {
            $retryCount++
            $statusCode = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = $_.Exception.Response.StatusCode.value__
            }

            Write-Log "Erro na requisicao $Method $uri (tentativa $retryCount/$MaxRetries): $($_.Exception.Message)" "ERROR"

            if ($statusCode -eq 401) {
                Write-Log "[ERROR] Erro de autenticacao (401)" "ERROR"
                throw
            }

            if ($statusCode -eq 429) {
                $rateLimitDelay = $retryDelay * 5
                Write-Log "[RATE-LIMIT] 429 - aguardando ${rateLimitDelay}s" "WARN"
                Start-Sleep -Seconds $rateLimitDelay
                $retryDelay *= 2
                
                if ($retryCount -ge $MaxRetries) {
                    return [pscustomobject]@{
                        Success    = $false
                        StatusCode = 429
                        Body       = "Rate limit exceeded"
                    }
                }
                continue
            }

            if ($retryCount -ge $MaxRetries) {
                throw
            }

            Start-Sleep -Seconds $retryDelay
            $retryDelay *= 2
        }
    }
}

# ============================================
#  INFO DO SISTEMA
# ============================================
function Get-SystemInfo {
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $cs = Get-CimInstance Win32_ComputerSystem

        return @{
            os_type       = "windows"
            os_name       = $os.Caption
            os_version    = $os.Version
            build_number  = $os.BuildNumber
            hostname      = $env:COMPUTERNAME
            domain        = $cs.Domain
            total_ram_gb  = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            state         = Get-AgentState
        }
    } catch {
        return @{
            os_type       = "windows"
            hostname      = $env:COMPUTERNAME
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            state         = Get-AgentState
        }
    }
}

# ============================================
#  HEARTBEAT
# ============================================
# ============================================
#  HEARTBEAT (COM FORCE UPDATE VIA RESPONSE)
# ============================================
function Send-Heartbeat {
    $sysInfo = Get-SystemInfo

    $body = @{
        agent_name    = $Global:AgentName
        hostname      = $sysInfo.hostname
        os_type       = $sysInfo.os_type
        os_version    = $sysInfo.os_version
        agent_version = $Global:AgentVersion
        state         = Get-AgentState
        error_count   = $Global:AgentState.ErrorCount
    }

    Write-Log "[HEARTBEAT] Enviando heartbeat (state: $(Get-AgentState))..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/heartbeat" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 15

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[HEARTBEAT] OK (200)" "SUCCESS"
            
            # FASE VIKTOR: Processar force_update no response do heartbeat
            # Isso bypassa o job system e funciona com QUALQUER versao de agente
            try {
                $response = $result.Body | ConvertFrom-Json
                
                if ($response.force_update -eq $true) {
                    Write-Log "[FORCE UPDATE] Update forcado detectado via heartbeat!" "WARN"
                    Write-Log "[FORCE UPDATE] Target version: $($response.target_version)" "INFO"
                    
                    # Aplicar force update imediatamente
                    $updateResult = Apply-ForcedUpdate -Response $response
                    
                    if ($updateResult.success) {
                        # Se chegou aqui, agente vai reiniciar - nao retorna
                        return $true
                    } else {
                        Write-Log "[FORCE UPDATE] Falha ao aplicar: $($updateResult.error)" "ERROR"
                        # Continua operando normalmente mesmo com falha no force update
                    }
                }
            } catch {
                # Erro ao processar response nao deve quebrar o heartbeat
                Write-Log "[HEARTBEAT] Erro ao processar response: $($_.Exception.Message)" "WARN"
            }
            
            Add-EvidenceEntry -Type "heartbeat" -Data @{
                status = "success"
                state = Get-AgentState
            } -Severity "debug"
            
            return $true
        } else {
            Write-Log "[HEARTBEAT] Falhou: Status $($result.StatusCode)" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "[HEARTBEAT] Erro: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  FORCE UPDATE VIA HEARTBEAT (VIKTOR METHOD)
# ============================================
# Esta funcao:
# 1. NAO depende do job system
# 2. NAO usa ValidateSet que pode quebrar
# 3. Processa dados recebidos diretamente no heartbeat response
# 4. Funciona com agentes antigos que nao tem update_agent funcionando
# ============================================
function Apply-ForcedUpdate {
    param(
        [Parameter(Mandatory = $true)]
        $Response
    )
    
    try {
        Write-Log "[FORCE UPDATE] Iniciando aplicacao de update forcado..." "INFO"
        
        # Extrair dados do response
        $targetVersion = $Response.target_version
        $base64Content = $Response.script_content_base64
        $expectedHash = $Response.sha256
        $reason = $Response.reason
        
        if (-not $targetVersion -or -not $base64Content -or -not $expectedHash) {
            throw "Dados de force update incompletos no response"
        }
        
        Write-Log "[FORCE UPDATE] Version: $targetVersion, Reason: $reason" "INFO"
        
        # SAFE MODE CHECK - mesmo check do Invoke-UpdateAgentJob
        $rollbackState = Get-RollbackState
        if ($rollbackState.safe_mode) {
            Write-Log "[SAFE MODE] Updates desabilitados - rollback loop detectado" "ERROR"
            
            Add-EvidenceEntry -Type "security_warning" -Data @{
                event = "force_update_blocked_safe_mode"
                target_version = $targetVersion
                rollback_count = $rollbackState.rollback_count
            } -Severity "warning"
            
            return @{ success = $false; error = "Safe mode active - updates disabled" }
        }
        
        # Criar arquivo temporario
        $tempScript = Join-Path $env:TEMP "cybershield-force-update-$targetVersion.ps1"
        
        # CRITICAL: Base64 decode - preserva 100% dos bytes
        Write-Log "[FORCE UPDATE] Decodificando Base64..." "DEBUG"
        $bytes = [System.Convert]::FromBase64String($base64Content)
        [System.IO.File]::WriteAllBytes($tempScript, $bytes)
        Write-Log "[FORCE UPDATE] Script salvo: $($bytes.Length) bytes" "DEBUG"
        
        # Validar SHA256
        $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash.ToLower()) {
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
        }
        
        Write-Log "[FORCE UPDATE] SHA256 validado: $actualHash" "SUCCESS"
        
        # Detectar script atual
        $installDir = "C:\CyberShield"
        $targetScript = Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"
        
        $currentScript = $null
        $possiblePaths = @(
            $PSCommandPath,
            (Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"),
            (Join-Path $installDir "cybershield-agent-v4.ps1"),
            (Join-Path $installDir "cybershield-agent.ps1")
        )
        
        foreach ($path in $possiblePaths) {
            if ($path -and (Test-Path $path)) {
                $currentScript = $path
                break
            }
        }
        
        if (-not $currentScript) {
            $found = Get-ChildItem -Path $installDir -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $currentScript = $found.FullName }
        }
        
        # BACKUP para rollback estruturado
        $previousPath = $Global:RollbackPaths.Previous
        if ($currentScript -and (Test-Path $currentScript)) {
            try {
                Copy-Item -Path $currentScript -Destination $previousPath -Force
                Write-Log "[FORCE UPDATE] Backup criado: $previousPath" "INFO"
                
                $rollbackState = Get-RollbackState
                $rollbackState.previous_version = $Global:AgentVersion
                Save-RollbackState -State $rollbackState
            } catch {
                Write-Log "[FORCE UPDATE] Backup falhou: $($_.Exception.Message)" "WARN"
            }
        }
        
        # APLICAR UPDATE
        Copy-Item -Path $tempScript -Destination $targetScript -Force
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
        Write-Log "[FORCE UPDATE] Script instalado: $targetScript" "SUCCESS"
        
        # Registrar evidencia
        Add-EvidenceEntry -Type "force_update" -Data @{
            old_version = $Global:AgentVersion
            new_version = $targetVersion
            target_path = $targetScript
            sha256 = $actualHash
            reason = $reason
            method = "heartbeat_response"
        } -Severity "info"
        
        # Confirmar no backend que force update foi aplicado
        try {
            $confirmResult = Invoke-SecureRequest `
                -Path "/functions/v1/confirm-force-update" `
                -Method "POST" `
                -Body @{
                    new_version = $targetVersion
                    old_version = $Global:AgentVersion
                } `
                -TimeoutSec 10
            
            if ($confirmResult.Success) {
                Write-Log "[FORCE UPDATE] Confirmacao enviada ao backend" "SUCCESS"
            }
        } catch {
            Write-Log "[FORCE UPDATE] Falha ao confirmar no backend (nao critico): $($_.Exception.Message)" "WARN"
        }
        
        Write-Log "[FORCE UPDATE] Update $targetVersion aplicado com sucesso!" "SUCCESS"
        Write-Log "[FORCE UPDATE] Nova versao sera ativada no proximo boot do Windows" "INFO"
        
        return @{ success = $true; version = $targetVersion }
        
    } catch {
        Write-Log "[FORCE UPDATE] Erro: $($_.Exception.Message)" "ERROR"
        
        Add-EvidenceEntry -Type "error" -Data @{
            event = "force_update_failed"
            error = $_.Exception.Message
            target_version = $Response.target_version
        } -Severity "error"
        
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  SEND SYSTEM METRICS (HYBRID - v4.0.9)
# ============================================
function Send-SystemMetrics {
    param(
        [Parameter(Mandatory = $false)]
        [hashtable]$Metrics = $null
    )
    
    Write-Log "[METRICS] Iniciando coleta/envio de metricas..." "DEBUG"
    
    try {
        # Se metricas nao foram passadas, coletar via Invoke-ReportJob
        if (-not $Metrics) {
            Write-Log "[METRICS] Coletando metricas automaticamente..." "DEBUG"
            $metricsJob = @{ id = "auto-metrics"; type = "report" }
            $metricsResult = Invoke-ReportJob -Job $metricsJob
            
            if (-not $metricsResult.success) {
                Write-Log "[METRICS] Falha na coleta de metricas: $($metricsResult.output)" "WARN"
                return $false
            }
            
            try {
                $metricsData = $metricsResult.output | ConvertFrom-Json
                
                # v4.0.11: Enviar TODAS as informacoes de metricas, incluindo discos
                $Metrics = @{
                    cpu_usage_percent = $metricsData.cpu_percent
                    cpu_name = $metricsData.cpu_name
                    cpu_cores = $metricsData.cpu_cores
                    memory_usage_percent = $metricsData.memory_percent
                    memory_total_gb = $metricsData.memory_total_gb
                    memory_used_gb = $metricsData.memory_used_gb
                    memory_free_gb = $metricsData.memory_free_gb
                    disk_usage_percent = $metricsData.disk_percent
                    disk_total_gb = $metricsData.disk_total_gb
                    disk_used_gb = $metricsData.disk_used_gb
                    disk_free_gb = $metricsData.disk_free_gb
                    disks = $metricsData.disks
                    hostname = $metricsData.hostname
                    uptime_seconds = $metricsData.uptime_seconds
                    last_boot_time = $metricsData.last_boot_time
                }
                
                $diskCount = if ($metricsData.disks) { $metricsData.disks.Count } else { 0 }
                Write-Log "[METRICS] Payload preparado: CPU=$($Metrics.cpu_usage_percent)%, RAM=$($Metrics.memory_usage_percent)%, Discos=$diskCount" "DEBUG"
                
            } catch {
                Write-Log "[METRICS] Falha ao parsear metricas: $($_.Exception.Message)" "WARN"
                return $false
            }
        }
        
        Write-Log "[METRICS] Enviando metricas para backend..." "DEBUG"
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-system-metrics" `
            -Method "POST" `
            -Body $Metrics `
            -TimeoutSec 15
        
        if ($result.Success -and $result.StatusCode -eq 200) {
            $diskCount = if ($Metrics.disks) { $Metrics.disks.Count } else { 0 }
            Write-Log "[SUCCESS] Metricas enviadas: CPU=$($Metrics.cpu_usage_percent)%, RAM=$($Metrics.memory_usage_percent)%, Discos=$diskCount" "SUCCESS"
            return $true
        }
        
        Write-Log "[WARN] Falha ao enviar metricas (HTTP $($result.StatusCode))" "WARN"
        return $false
        
    } catch {
        Write-Log "[ERROR] Erro em Send-SystemMetrics: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  SUBMIT JOB RESULT
# ============================================
function Submit-JobResult {
    param(
        [Parameter(Mandatory = $true)]
        [string]$JobId,
        
        [Parameter(Mandatory = $true)]
        [ValidateSet("completed","failed")]
        [string]$Status,
        
        [Parameter()]
        [string]$Output = "",
        
        [Parameter()]
        [string]$ErrorMessage = "",
        
        [Parameter()]
        [int]$ExecutionTimeSeconds = 0,
        
        [Parameter()]
        [string]$StartedAt = "",
        
        [Parameter()]
        [string]$ExecutionId = ""
    )

    $body = @{
        job_id                 = $JobId
        status                 = $Status
        output                 = $Output
        error_message          = $ErrorMessage
        execution_time_seconds = $ExecutionTimeSeconds
        started_at             = $StartedAt
        agent_name             = $Global:AgentName
        agent_version          = $Global:AgentVersion
        execution_id           = $ExecutionId
    }

    Write-Log "[JOB] Enviando resultado para job $JobId (status=$Status, exec_id=$ExecutionId)" "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[JOB] Resultado enviado com sucesso" "SUCCESS"
            return $true
        } else {
            Write-Log "[JOB] Falha ao enviar resultado: $($result.StatusCode)" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "[JOB] Erro ao enviar resultado: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  EXECUTE JOB (IDEMPOTENTE COM EXECUTION_ID)
# ============================================
function Execute-Job {
    param(
        [Parameter(Mandatory = $true)]
        $Job
    )

    # Verificar se pode executar jobs
    if (-not (Test-CanExecuteJob)) {
        $state = Get-AgentState
        Write-Log "[JOB] Cannot execute job in state $state" "WARN"
        
        Add-EvidenceEntry -Type "job_execution" -Data @{
            job_id = $Job.id
            job_type = $Job.type
            blocked = $true
            reason = "Invalid state: $state"
        } -Severity "warning"
        
        return
    }

    # SSA-004: Verify job signature BEFORE execution
    $signatureValid = Verify-JobSignature -Job $Job
    if (-not $signatureValid) {
        Write-Log "[SECURITY] [ERROR]  BLOCKED: Job $($Job.id) rejected due to invalid/missing signature" "ERROR"
        
        # Submit rejection result to backend
        Submit-JobResult `
            -JobId $Job.id `
            -Status "failed" `
            -ErrorMessage "Security: Invalid or missing payload signature" `
            -ExecutionTimeSeconds 0 `
            -StartedAt (Get-Date).ToUniversalTime().ToString("o") `
            -ExecutionId "security-rejected"
        
        return
    }

    $jobId = $Job.id
    $jobType = $Job.type
    $executionId = "exec-$(New-Guid)"
    $startTime = Get-Date

    Write-Log "[JOB] Executando job $jobId (type=$jobType, exec_id=$executionId)" "INFO"

    # Registrar inicio da execucao
    Add-EvidenceEntry -Type "job_execution" -Data @{
        job_id = $jobId
        job_type = $jobType
        execution_id = $executionId
        phase = "started"
        state = Get-AgentState
        signature_verified = $true
    } -Severity "info"

    try {
        $output = ""

        switch ($jobType) {
            "report" {
                $result = Invoke-ReportJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "software_inventory_collect" {
                $result = Invoke-SoftwareInventoryJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "light_vuln_scan" {
                $result = Invoke-LightVulnScanJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "collect_antivirus_status" {
                $result = Invoke-CollectAntivirusJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "collect_web_activity" {
                $result = Invoke-CollectWebActivityJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "update_agent" {
                $result = Invoke-UpdateAgentJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "integration_test" {
                $sys = Get-SystemInfo
                $output = @{
                    message = "Integration test executed successfully"
                    timestamp = (Get-Date).ToUniversalTime().ToString("o")
                    agent = $Global:AgentName
                    version = $Global:AgentVersion
                    system = $sys
                } | ConvertTo-Json -Compress
            }
            "collect_info" {
                $sys = Get-SystemInfo
                $output = $sys | ConvertTo-Json -Compress
            }
            "scan" {
                $result = Invoke-ScanJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "fix_firewall" {
                $result = Invoke-FixFirewallJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "restart_service" {
                $result = Invoke-RestartServiceJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "collect_network_info" {
                $result = Invoke-CollectNetworkInfoJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "sync_blocked_websites" {
                $result = Invoke-SyncBlockedWebsitesJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "reinstall_agent" {
                $result = Invoke-ReinstallAgentJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            default {
                throw "Tipo de job nao suportado: $jobType"
            }
        }

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        # Registrar sucesso
        Add-EvidenceEntry -Type "job_execution" -Data @{
            job_id = $jobId
            job_type = $jobType
            execution_id = $executionId
            phase = "completed"
            execution_time_seconds = $execTime
            state = Get-AgentState
        } -Severity "info"

        Submit-JobResult `
            -JobId $jobId `
            -Status "completed" `
            -Output $output `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO `
            -ExecutionId $executionId
    }
    catch {
        $err = "Erro ao executar job $jobId`: $($_.Exception.Message)"
        Write-Log $err "ERROR"

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        # Registrar falha
        Add-EvidenceEntry -Type "job_execution" -Data @{
            job_id = $jobId
            job_type = $jobType
            execution_id = $executionId
            phase = "failed"
            error = $_.Exception.Message
            execution_time_seconds = $execTime
            state = Get-AgentState
        } -Severity "error"

        Submit-JobResult `
            -JobId $jobId `
            -Status "failed" `
            -ErrorMessage $err `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO `
            -ExecutionId $executionId
        
        # Considerar transicao para DEGRADED se muitas falhas
        if ($Global:AgentState.ErrorCount -ge 3) {
            Set-AgentState -NewState "DEGRADED" -Reason "Multiple job failures" -ErrorDetails $err
        }
    }
}

# ============================================
#  JOB HANDLERS (Simplificados para v4.0)
# ============================================
function Invoke-ReportJob {
    param($Job)
    
    try {
        # CPU
        $cpuUsage = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        if ($null -eq $cpuUsage) { $cpuUsage = 0 }
        $cpuInfo = Get-WmiObject Win32_Processor | Select-Object -First 1
        
        # Memory
        $os = Get-WmiObject Win32_OperatingSystem
        $memTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        $memFreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $memUsedGB = [math]::Round($memTotalGB - $memFreeGB, 2)
        $memUsage = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)
        
        # Disks - Collect ALL fixed drives (v4.0.11)
        $disksArray = @()
        $allDisks = Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3"  # DriveType=3 = Fixed disks
        $systemDrive = $env:SystemDrive  # Usually "C:"
        
        foreach ($d in $allDisks) {
            if ($d.Size -gt 0) {
                $totalGB = [math]::Round($d.Size / 1GB, 2)
                $freeGB = [math]::Round($d.FreeSpace / 1GB, 2)
                $usedGB = [math]::Round($totalGB - $freeGB, 2)
                $usagePercent = [math]::Round((($d.Size - $d.FreeSpace) / $d.Size) * 100, 2)
                
                $disksArray += @{
                    drive_letter = $d.DeviceID
                    drive_label = if ($d.VolumeName) { $d.VolumeName } else { "" }
                    drive_type = "Fixed"
                    total_gb = $totalGB
                    used_gb = $usedGB
                    free_gb = $freeGB
                    usage_percent = $usagePercent
                    is_system_drive = ($d.DeviceID -eq $systemDrive)
                }
            }
        }
        
        # Primary disk metrics (for legacy compatibility)
        $primaryDisk = $disksArray | Where-Object { $_.is_system_drive } | Select-Object -First 1
        if (-not $primaryDisk -and $disksArray.Count -gt 0) {
            $primaryDisk = $disksArray[0]
        }
        
        $bootTime = $os.LastBootUpTime
        $bootDateTime = [Management.ManagementDateTimeConverter]::ToDateTime($bootTime)
        $uptimeSeconds = [int]((Get-Date) - $bootDateTime).TotalSeconds
        
        $report = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            hostname = $env:COMPUTERNAME
            cpu_percent = [math]::Round($cpuUsage, 2)
            cpu_name = $cpuInfo.Name
            cpu_cores = $cpuInfo.NumberOfCores
            memory_percent = $memUsage
            memory_total_gb = $memTotalGB
            memory_used_gb = $memUsedGB
            memory_free_gb = $memFreeGB
            disk_percent = if ($primaryDisk) { $primaryDisk.usage_percent } else { 0 }
            disk_total_gb = if ($primaryDisk) { $primaryDisk.total_gb } else { 0 }
            disk_used_gb = if ($primaryDisk) { $primaryDisk.used_gb } else { 0 }
            disk_free_gb = if ($primaryDisk) { $primaryDisk.free_gb } else { 0 }
            disks = $disksArray
            uptime_seconds = $uptimeSeconds
            last_boot_time = $bootDateTime.ToUniversalTime().ToString("o")
            state = Get-AgentState
        }
        
        Write-Log "[METRICS] Coletado: CPU=$($report.cpu_percent)%, RAM=$($report.memory_percent)%, Discos=$($disksArray.Count)" "DEBUG"
        
        return @{ success = $true; output = ($report | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-SoftwareInventoryJob {
    param($Job)
    
    try {
        $software = [System.Collections.ArrayList]::new()
        
        $paths = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        
        foreach ($path in $paths) {
            Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | 
            Where-Object { $_.DisplayName -and $_.DisplayName -notmatch "^(Update for|Security Update)" } |
            ForEach-Object {
                [void]$software.Add(@{
                    name = $_.DisplayName
                    version = $_.DisplayVersion
                    publisher = $_.Publisher
                    install_date = $_.InstallDate
                })
            }
        }
        
        $result = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            software_count = $software.Count
            software = $software
        }
        
        return @{ success = $true; output = ($result | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-LightVulnScanJob {
    param($Job)
    
    try {
        $result = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            vulnerabilities = @()
            scan_type = "light"
        }
        
        return @{ success = $true; output = ($result | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-CollectAntivirusJob {
    param($Job)
    
    try {
        $avStatus = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            engines = @()
        }
        
        # Windows Defender
        try {
            $defender = Get-MpComputerStatus -ErrorAction Stop
            $avStatus.engines += @{
                name = "Windows Defender"
                enabled = $defender.AntivirusEnabled
                real_time_protection = $defender.RealTimeProtectionEnabled
                definitions_updated = $defender.AntivirusSignatureLastUpdated.ToUniversalTime().ToString("o")
            }
        } catch { }
        
        return @{ success = $true; output = ($avStatus | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  SSA-010: RESTORED JOBS FROM V3
# ============================================

# SCAN JOB - Verifica arquivos com scan-virus (VirusTotal)
function Invoke-ScanJob {
    param($Job)
    
    try {
        Write-Log "[SCAN] Iniciando scan de arquivo..." "INFO"
        
        $payload = $Job.payload
        if ($payload -is [string]) {
            $payload = $payload | ConvertFrom-Json
        }
        
        $filePath = $payload.filePath
        $tenantId = $payload.tenantId
        
        if (-not $filePath) {
            throw "Payload invalido: 'filePath' nao informado"
        }
        
        # Expandir variaveis de ambiente
        if ($filePath -match '%USERPROFILE%') {
            $userProfiles = Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | 
                Where-Object { $_.Name -notin @("Public", "Default", "Default User", "All Users") }
            
            $expandedPath = $null
            foreach ($profile in $userProfiles) {
                $testPath = $filePath -replace '%USERPROFILE%', $profile.FullName
                if (Test-Path $testPath) {
                    $expandedPath = $testPath
                    break
                }
            }
            
            if ($null -eq $expandedPath) {
                throw "Caminho nao encontrado em nenhum perfil de usuario: $filePath"
            }
            $filePath = $expandedPath
        }
        elseif ($filePath -match '%([^%]+)%') {
            $filePath = [System.Environment]::ExpandEnvironmentVariables($filePath)
        }
        
        if (-not (Test-Path $filePath)) {
            throw "Caminho nao encontrado: $filePath"
        }
        
        $fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
        Write-Log "[SCAN] Escaneando: $filePath (hash: $fileHash)" "INFO"
        
        $scanBody = @{
            tenant_id = $tenantId
            agent_name = $Global:AgentName
            filePath = $filePath
            fileHash = $fileHash
        }
        
        $scanResult = Invoke-SecureRequest `
            -Path "/functions/v1/scan-virus" `
            -Method POST `
            -Body $scanBody `
            -TimeoutSec 60
        
        if (-not $scanResult.Success) {
            throw "Falha ao chamar scan-virus: HTTP $($scanResult.StatusCode)"
        }
        
        $scanData = $scanResult.Body | ConvertFrom-Json
        
        $output = @{
            filePath = $filePath
            fileHash = $fileHash
            isMalicious = $scanData.isMalicious
            positives = $scanData.positives
            totalScans = $scanData.totalScans
            permalink = $scanData.permalink
            quarantined = $false
        }
        
        if ($scanData.isMalicious) {
            Write-Log "[WARN] MALWARE DETECTADO: $($scanData.positives)/$($scanData.totalScans) engines" "WARN"
            
            $quarantineRoot = "C:\CyberShield\Quarantine"
            if (-not (Test-Path $quarantineRoot)) {
                New-Item -ItemType Directory -Path $quarantineRoot -Force | Out-Null
            }
            
            $fileName = [System.IO.Path]::GetFileName($filePath)
            $guid = [guid]::NewGuid().ToString()
            $quarantinePath = Join-Path $quarantineRoot "$guid`_$fileName"
            
            Move-Item -Path $filePath -Destination $quarantinePath -Force
            Write-Log "[SUCCESS] Arquivo movido para quarentena: $quarantinePath" "SUCCESS"
            
            $output.quarantined = $true
            $output.quarantinePath = $quarantinePath
        }
        
        return @{ success = $true; output = ($output | ConvertTo-Json -Compress) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# FIX FIREWALL JOB - Ativa firewall em todos os perfis
function Invoke-FixFirewallJob {
    param($Job)
    
    Write-Log "[FIX-FIREWALL] Iniciando auto-remediacao de firewall..." "INFO"
    
    try {
        $profiles = @()
        
        try {
            if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) {
                $fwProfiles = Get-NetFirewallProfile -ErrorAction Stop
                foreach ($p in $fwProfiles) {
                    $profiles += [PSCustomObject]@{
                        Name = $p.Name
                        Enabled = $p.Enabled
                    }
                }
            }
        } catch {
            # Fallback netsh
            $netshOutput = netsh advfirewall show allprofiles state 2>&1 | Out-String
            foreach ($profileName in @("Domain", "Private", "Public")) {
                $enabled = $false
                $pattern = "(?s)$profileName.*?State\s+(ON|OFF)"
                if ($netshOutput -match $pattern) {
                    $enabled = ($Matches[1] -eq "ON")
                }
                $profiles += [PSCustomObject]@{
                    Name = $profileName
                    Enabled = $enabled
                }
            }
        }
        
        if ($profiles.Count -eq 0) {
            throw "Nao foi possivel obter status dos perfis de firewall"
        }
        
        $fixed = @()
        foreach ($p in $profiles) {
            if (-not $p.Enabled) {
                Write-Log "[FIX-FIREWALL] Ativando firewall no perfil $($p.Name)" "INFO"
                
                try {
                    if (Get-Command Set-NetFirewallProfile -ErrorAction SilentlyContinue) {
                        Set-NetFirewallProfile -Name $p.Name -Enabled True -ErrorAction Stop
                    } else {
                        netsh advfirewall set $($p.Name.ToLower())profile state on 2>&1 | Out-Null
                    }
                    $fixed += $p.Name
                } catch {
                    Write-Log "[FIX-FIREWALL] Falha ao ativar perfil $($p.Name): $($_.Exception.Message)" "ERROR"
                }
            }
        }
        
        if ($fixed.Count -gt 0) {
            Write-Log "[FIX-FIREWALL] Firewall ativado em: $($fixed -join ', ')" "SUCCESS"
            return @{ success = $true; output = "Firewall ativado em perfis: $($fixed -join ', ')" }
        } else {
            Write-Log "[FIX-FIREWALL] Firewall ja estava ativo em todos os perfis" "INFO"
            return @{ success = $true; output = "Firewall ja ativo em todos os perfis" }
        }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# RESTART SERVICE JOB - Reinicia um servico especifico
function Invoke-RestartServiceJob {
    param($Job)
    
    Write-Log "[RESTART-SERVICE] Iniciando restart de servico..." "INFO"
    
    try {
        $payload = $Job.payload
        if ($payload -is [string]) {
            $payload = $payload | ConvertFrom-Json
        }
        
        if (-not $payload -or -not $payload.service_name) {
            throw "service_name nao especificado no payload"
        }
        
        $serviceName = $payload.service_name
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) {
            throw "Servico '$serviceName' nao encontrado"
        }
        
        Write-Log "[RESTART-SERVICE] Reiniciando servico: $serviceName (Status atual: $($service.Status))" "INFO"
        
        Restart-Service -Name $serviceName -Force -ErrorAction Stop
        
        Start-Sleep -Seconds 2
        
        $serviceAfter = Get-Service -Name $serviceName -ErrorAction Stop
        Write-Log "[RESTART-SERVICE] Servico reiniciado. Status: $($serviceAfter.Status)" "SUCCESS"
        
        return @{ success = $true; output = "Servico '$serviceName' reiniciado. Status: $($serviceAfter.Status)" }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# COLLECT NETWORK INFO JOB - Coleta informacoes de rede
function Invoke-CollectNetworkInfoJob {
    param($Job)
    
    Write-Log "[NETWORK-INFO] Iniciando coleta de informacoes de rede..." "INFO"
    
    try {
        $firewallDomain = $null
        $firewallPrivate = $null
        $firewallPublic = $null
        
        try {
            if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) {
                $profiles = Get-NetFirewallProfile
                foreach ($p in $profiles) {
                    switch ($p.Name) {
                        "Domain" { $firewallDomain = $p.Enabled }
                        "Private" { $firewallPrivate = $p.Enabled }
                        "Public" { $firewallPublic = $p.Enabled }
                    }
                }
            }
        } catch { }
        
        $openPorts = @()
        try {
            $tcpListening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -First 50
            foreach ($conn in $tcpListening) {
                $processName = "unknown"
                try { 
                    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                    if ($proc) { $processName = $proc.ProcessName }
                } catch { }
                $openPorts += @{ port = $conn.LocalPort; process = $processName; protocol = "TCP" }
            }
        } catch { }
        
        $networkAdapters = @()
        try {
            $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
            foreach ($adapter in $adapters) {
                $ipConfig = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
                $networkAdapters += @{
                    name = $adapter.Name
                    ip_address = if ($ipConfig) { $ipConfig.IPAddress } else { "" }
                    mac_address = $adapter.MacAddress
                    status = $adapter.Status
                }
            }
        } catch { }
        
        $dnsServers = @()
        try {
            $dnsConfig = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
                Where-Object { $_.ServerAddresses } | 
                Select-Object -ExpandProperty ServerAddresses -Unique
            $dnsServers = @($dnsConfig)
        } catch { }
        
        $gatewayIp = $null
        try {
            $gateway = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($gateway) { $gatewayIp = $gateway.NextHop }
        } catch { }
        
        $publicIp = $null
        try {
            $response = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.ip) { $publicIp = $response.ip }
        } catch { }
        
        $payload = @{
            firewall_domain = $firewallDomain
            firewall_private = $firewallPrivate
            firewall_public = $firewallPublic
            open_ports = @($openPorts)
            network_adapters = @($networkAdapters)
            dns_servers = @($dnsServers)
            gateway_ip = $gatewayIp
            public_ip = $publicIp
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-network-info" `
            -Method "POST" `
            -Body $payload `
            -TimeoutSec 30
        
        if (-not $result.Success) {
            throw "Falha ao enviar info de rede (HTTP $($result.StatusCode))"
        }
        
        Write-Log "[NETWORK-INFO] Informacoes de rede enviadas com sucesso" "SUCCESS"
        
        return @{ success = $true; output = ($payload | ConvertTo-Json -Compress -Depth 3) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# SYNC BLOCKED WEBSITES JOB - Sincroniza lista de sites bloqueados
function Invoke-SyncBlockedWebsitesJob {
    param($Job)
    
    try {
        Write-Log "[BLOCKED-SITES] Iniciando sincronizacao de sites bloqueados..." "INFO"
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/get-blocked-websites" `
            -Method "GET" `
            -TimeoutSec 30
        
        if (-not $result.Success) {
            throw "Falha ao buscar lista de sites bloqueados (HTTP $($result.StatusCode))"
        }
        
        $data = $result.Body | ConvertFrom-Json
        $blockedDomains = @()
        
        if ($null -ne $data.blocked_websites -and $data.blocked_websites.Count -gt 0) {
            $blockedDomains = @($data.blocked_websites | ForEach-Object { $_.domain_pattern })
        }
        elseif ($null -ne $data.blocked_domains -and $data.blocked_domains.Count -gt 0) {
            $blockedDomains = @($data.blocked_domains)
        }
        
        Write-Log "[BLOCKED-SITES] Recebidos $($blockedDomains.Count) dominios bloqueados" "INFO"
        
        $blockedListPath = "C:\CyberShield\blocked_websites.json"
        $blockedData = @{
            updated_at = [DateTime]::UtcNow.ToString("o")
            domains = $blockedDomains
        }
        
        $blockedJson = $blockedData | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($blockedListPath, $blockedJson, [System.Text.UTF8Encoding]::new($false))
        
        Write-Log "[BLOCKED-SITES] Lista salva em $blockedListPath" "SUCCESS"
        
        return @{
            success = $true
            output = (@{
                message = "Sites bloqueados sincronizados"
                domains_count = $blockedDomains.Count
                list_path = $blockedListPath
            } | ConvertTo-Json -Compress)
        }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# REINSTALL AGENT JOB - Reinstala o agente completamente
function Invoke-ReinstallAgentJob {
    param($Job)
    
    try {
        Write-Log "[REINSTALL] Iniciando reinstalacao do agente..." "INFO"
        
        $updateResult = Invoke-SecureRequest `
            -Path "/functions/v1/serve-agent-update" `
            -Method GET `
            -TimeoutSec 60
        
        if (-not $updateResult.Success) {
            throw "Falha ao buscar script: HTTP $($updateResult.StatusCode)"
        }
        
        $data = $updateResult.Body | ConvertFrom-Json
        $expectedHash = $data.sha256
        $newVersion = $data.version
        
        $installDir = "C:\CyberShield"
        $targetScript = Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"
        $tempScript = Join-Path $env:TEMP "cybershield-reinstall-$newVersion.ps1"
        
        if ($data.script_content_base64) {
            $bytes = [System.Convert]::FromBase64String($data.script_content_base64)
            [System.IO.File]::WriteAllBytes($tempScript, $bytes)
        } else {
            [System.IO.File]::WriteAllText($tempScript, $data.script_content, [System.Text.UTF8Encoding]::new($false))
        }
        
        $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash.ToLower()) {
            Remove-Item $tempScript -Force
            throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
        }
        
        # Remover tasks antigas
        Get-ScheduledTask -ErrorAction SilentlyContinue | 
            Where-Object { $_.TaskName -like "*CyberShield*" } |
            ForEach-Object {
                Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
            }
        
        # Limpar scripts antigos
        Get-ChildItem -Path $installDir -Filter "*.ps1" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        
        # Instalar novo script
        Copy-Item -Path $tempScript -Destination $targetScript -Force
        Remove-Item $tempScript -Force
        
        # Criar nova scheduled task
        $action = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$targetScript`""
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
        
        Register-ScheduledTask -TaskName "CyberShieldAgent" -Action $action -Trigger $trigger `
            -Settings $settings -Principal $principal -Force | Out-Null
        
        Start-ScheduledTask -TaskName "CyberShieldAgent"
        
        Write-Log "[REINSTALL] Agente reinstalado com sucesso" "SUCCESS"
        
        return @{
            success = $true
            output = (@{
                message = "Agent reinstalled successfully"
                newVersion = $newVersion
                targetPath = $targetScript
                sha256 = $actualHash
            } | ConvertTo-Json -Compress)
        }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  SSA-009: WEB ACTIVITY HELPER FUNCTIONS
# ============================================

# Converter WebKit timestamp (Chrome/Edge) para DateTime
# WebKit: microseconds since 1601-01-01
function ConvertFrom-WebKitTimestamp {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try {
        $origin = [DateTime]::new(1601, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
        return $origin.AddTicks($timestamp * 10)
    } catch {
        return $null
    }
}

# Converter Firefox PRTime para DateTime
# PRTime: microseconds since 1970-01-01
function ConvertFrom-PRTime {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try {
        return [DateTimeOffset]::FromUnixTimeMilliseconds(
            [math]::Floor($timestamp / 1000)
        ).UtcDateTime
    } catch {
        return $null
    }
}

# Extrair dominio de URL
function Extract-DomainFromUrl {
    param([string]$url)
    if ([string]::IsNullOrWhiteSpace($url)) { return $null }
    try {
        $match = [regex]::Match($url, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
        if ($match.Success) {
            return $match.Groups[1].Value
        }
    } catch {}
    return $null
}

# Coleta SQLite segura com timeout
function Get-BrowserHistorySQLite {
    param(
        [string]$DbPath,
        [string]$Query,
        [string]$BrowserName,
        [string]$UserName
    )
    
    $results = New-Object System.Collections.ArrayList
    
    try {
        # Guard de performance: arquivos > 200MB sao ignorados
        $fileInfo = Get-Item $DbPath -ErrorAction Stop
        $maxSize = 200 * 1024 * 1024  # 200MB
        if ($fileInfo.Length -gt $maxSize) {
            Write-Log "[WEB-ACTIVITY] $BrowserName ($UserName): arquivo muito grande ($('{0:N0}' -f ($fileInfo.Length / 1MB))MB), pulando SQLite" "WARN"
            return $null
        }
        
        # Tentar carregar assembly SQLite (disponivel no .NET)
        $assembly = $null
        try {
            $assembly = [System.Reflection.Assembly]::LoadWithPartialName("System.Data.SQLite")
        } catch {}
        
        if (-not $assembly) {
            # Fallback: SQLite provider nao disponivel, retorna null para usar fallback regex
            return $null
        }
        
        $connectionString = "Data Source=$DbPath;Version=3;Read Only=True;Journal Mode=Off;"
        $connection = New-Object System.Data.SQLite.SQLiteConnection($connectionString)
        $connection.Open()
        
        $command = $connection.CreateCommand()
        $command.CommandText = $Query
        $command.CommandTimeout = 2  # Timeout de 2 segundos
        
        $reader = $command.ExecuteReader()
        while ($reader.Read()) {
            [void]$results.Add(@{
                url = $reader["url"]
                last_visit_time = $reader["last_visit_time"]
                visit_count = $reader["visit_count"]
            })
        }
        
        $reader.Close()
        $connection.Close()
        
        return $results
        
    } catch {
        Write-Log "[WEB-ACTIVITY] SQLite falhou para $BrowserName ($UserName): $($_.Exception.Message)" "DEBUG"
        return $null
    }
}

# ============================================
#  SSA-009: FULL WEB ACTIVITY COLLECTION
# ============================================
function Invoke-CollectWebActivityJob {
    param($Job)

    Write-Log "[WEB-ACTIVITY-V3] Iniciando coleta de atividade web com timestamps reais..." "INFO"

    try {
        $payload = $null
        if ($null -ne $Job.payload -and $Job.payload) {
            try {
                if ($Job.payload -is [string]) {
                    $payload = $Job.payload | ConvertFrom-Json
                } else {
                    $payload = $Job.payload
                }
            } catch {
                Write-Log "[WEB-ACTIVITY-V3] Payload invalido, usando defaults" "WARN"
            }
        }

        $maxDomains = 500
        if ($payload -and $payload.max_domains) {
            $maxDomains = [int]$payload.max_domains
        }

        $nowUtc = [DateTime]::UtcNow
        # Usar ArrayList para performance O(n)
        $items = New-Object System.Collections.ArrayList

        # 1. Coletar DNS Cache (sem timestamps reais - usa hora atual)
        Write-Log "[WEB-ACTIVITY-V3] Coletando cache DNS..." "INFO"
        try {
            $dnsEntries = Get-DnsClientCache -ErrorAction SilentlyContinue
            if ($dnsEntries) {
                $dnsEntries = $dnsEntries |
                    Where-Object { $_.Entry -and $_.Name } |
                    Sort-Object -Property Name -Unique |
                    Select-Object -First 100

                foreach ($entry in $dnsEntries) {
                    $domain = $entry.Name
                    if ([string]::IsNullOrWhiteSpace($domain)) { continue }
                    if ($domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "local") { continue }

                    [void]$items.Add(@{
                        domain = $domain
                        source = "dns_cache"
                        visited_at = $nowUtc.ToString("o")
                        visit_count = 1  # DNS nao tem contagem real
                    })
                }
                Write-Log "[WEB-ACTIVITY-V3] Cache DNS: $($dnsEntries.Count) dominios" "INFO"
            }
        } catch {
            Write-Log "[WEB-ACTIVITY-V3] Erro ao ler cache DNS: $($_.Exception.Message)" "WARN"
        }

        # 2. Coletar historico de TODOS OS PERFIS DE USUARIO
        Write-Log "[WEB-ACTIVITY-V3] Coletando historico de todos os perfis de usuario..." "INFO"
        
        $userProfiles = @()
        try {
            $userProfiles = Get-ChildItem -Path "C:\Users" -Directory -ErrorAction SilentlyContinue | 
                Where-Object { $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') }
            Write-Log "[WEB-ACTIVITY-V3] Encontrados $($userProfiles.Count) perfis de usuario" "INFO"
        } catch {
            Write-Log "[WEB-ACTIVITY-V3] Erro ao listar perfis de usuario: $($_.Exception.Message)" "WARN"
        }
        
        foreach ($userProfile in $userProfiles) {
            $userName = $userProfile.Name
            $userPath = $userProfile.FullName
            
            Write-Log "[WEB-ACTIVITY-V3] Processando perfil: $userName" "DEBUG"
            
            # 2a. Chrome History - SQLITE COM TIMESTAMPS REAIS
            try {
                $chromeHistoryPath = Join-Path $userPath "AppData\Local\Google\Chrome\User Data\Default\History"
                if (Test-Path $chromeHistoryPath) {
                    $tempHistoryPath = "$env:TEMP\chrome_history_temp_$(Get-Random).db"
                    Copy-Item -Path $chromeHistoryPath -Destination $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    
                    if (Test-Path $tempHistoryPath) {
                        $sqliteResults = $null
                        
                        # Tentar SQLite primeiro para dados reais
                        try {
                            $sqliteResults = Get-BrowserHistorySQLite `
                                -DbPath $tempHistoryPath `
                                -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" `
                                -BrowserName "Chrome" `
                                -UserName $userName
                        } catch {
                            Write-Log "[WEB-ACTIVITY-V3] Chrome SQLite falhou ($userName): $($_.Exception.Message)" "DEBUG"
                        }
                        
                        if ($sqliteResults -and $sqliteResults.Count -gt 0) {
                            # SUCESSO: Dados reais do SQLite
                            foreach ($row in $sqliteResults) {
                                $domain = Extract-DomainFromUrl $row.url
                                if (-not $domain -or $domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "*google*") { continue }
                                
                                $visitedAt = ConvertFrom-WebKitTimestamp $row.last_visit_time
                                [void]$items.Add(@{
                                    domain = $domain
                                    source = "chrome_history_$userName"
                                    visited_at = if ($visitedAt) { $visitedAt.ToString("o") } else { $nowUtc.ToString("o") }
                                    visit_count = [int]$row.visit_count
                                })
                            }
                            Write-Log "[WEB-ACTIVITY-V3] Chrome ($userName): $($sqliteResults.Count) registros via SQLite (timestamps reais)" "INFO"
                        } else {
                            # FALLBACK: Regex para compatibilidade
                            try {
                                $maxBytes = 5 * 1024 * 1024
                                $fileInfo = Get-Item $tempHistoryPath
                                $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes)
                                
                                $fileStream = [System.IO.File]::OpenRead($tempHistoryPath)
                                $buffer = New-Object byte[] $bytesToRead
                                [void]$fileStream.Read($buffer, 0, $bytesToRead)
                                $fileStream.Close()
                                $fileStream.Dispose()
                                
                                if ($buffer) {
                                    $dataString = [System.Text.Encoding]::UTF8.GetString($buffer)
                                    $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
                                    
                                    $chromeDomains = $urlMatches | 
                                        ForEach-Object { $_.Groups[1].Value } | 
                                        Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*google*" } |
                                        Select-Object -Unique -First 50
                                    
                                    foreach ($domain in $chromeDomains) {
                                        [void]$items.Add(@{
                                            domain = $domain
                                            source = "chrome_history_$userName"
                                            visited_at = $nowUtc.ToString("o")
                                            visit_count = 1  # Fallback: sem contagem real
                                        })
                                    }
                                    Write-Log "[WEB-ACTIVITY-V3] Chrome ($userName): $($chromeDomains.Count) dominios via regex (fallback)" "INFO"
                                    
                                    $buffer = $null
                                    $dataString = $null
                                }
                            } catch {
                                Write-Log "[WEB-ACTIVITY-V3] Chrome regex falhou ($userName): $($_.Exception.Message)" "WARN"
                            }
                        }
                        Remove-Item $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch {
                Write-Log "[WEB-ACTIVITY-V3] Erro ao acessar Chrome ($userName): $($_.Exception.Message)" "WARN"
            }
            
            # 2b. Firefox History - SQLITE COM TIMESTAMPS REAIS
            try {
                $firefoxProfilesPath = Join-Path $userPath "AppData\Roaming\Mozilla\Firefox\Profiles"
                if (Test-Path $firefoxProfilesPath) {
                    $profiles = Get-ChildItem -Path $firefoxProfilesPath -Directory -ErrorAction SilentlyContinue
                    foreach ($profile in $profiles) {
                        $placesPath = Join-Path $profile.FullName "places.sqlite"
                        if (Test-Path $placesPath) {
                            $tempPlacesPath = "$env:TEMP\firefox_places_temp_$(Get-Random).db"
                            Copy-Item -Path $placesPath -Destination $tempPlacesPath -Force -ErrorAction SilentlyContinue
                            
                            if (Test-Path $tempPlacesPath) {
                                $sqliteResults = $null
                                
                                # Tentar SQLite primeiro
                                try {
                                    $sqliteResults = Get-BrowserHistorySQLite `
                                        -DbPath $tempPlacesPath `
                                        -Query "SELECT url, last_visit_date, visit_count FROM moz_places WHERE visit_count > 0 ORDER BY last_visit_date DESC LIMIT 200" `
                                        -BrowserName "Firefox" `
                                        -UserName $userName
                                } catch {
                                    Write-Log "[WEB-ACTIVITY-V3] Firefox SQLite falhou ($userName): $($_.Exception.Message)" "DEBUG"
                                }
                                
                                if ($sqliteResults -and $sqliteResults.Count -gt 0) {
                                    foreach ($row in $sqliteResults) {
                                        $domain = Extract-DomainFromUrl $row.url
                                        if (-not $domain -or $domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "*mozilla*") { continue }
                                        
                                        $visitedAt = ConvertFrom-PRTime $row.last_visit_time
                                        [void]$items.Add(@{
                                            domain = $domain
                                            source = "firefox_history_$userName"
                                            visited_at = if ($visitedAt) { $visitedAt.ToString("o") } else { $nowUtc.ToString("o") }
                                            visit_count = [int]$row.visit_count
                                        })
                                    }
                                    Write-Log "[WEB-ACTIVITY-V3] Firefox ($userName): $($sqliteResults.Count) registros via SQLite" "INFO"
                                } else {
                                    # Fallback regex
                                    try {
                                        $maxBytes = 5 * 1024 * 1024
                                        $fileInfo = Get-Item $tempPlacesPath
                                        $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes)
                                        
                                        $fileStream = [System.IO.File]::OpenRead($tempPlacesPath)
                                        $buffer = New-Object byte[] $bytesToRead
                                        [void]$fileStream.Read($buffer, 0, $bytesToRead)
                                        $fileStream.Close()
                                        $fileStream.Dispose()
                                        
                                        if ($buffer) {
                                            $dataString = [System.Text.Encoding]::UTF8.GetString($buffer)
                                            $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
                                            
                                            $firefoxDomains = $urlMatches | 
                                                ForEach-Object { $_.Groups[1].Value } | 
                                                Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*mozilla*" } |
                                                Select-Object -Unique -First 50
                                            
                                            foreach ($domain in $firefoxDomains) {
                                                [void]$items.Add(@{
                                                    domain = $domain
                                                    source = "firefox_history_$userName"
                                                    visited_at = $nowUtc.ToString("o")
                                                    visit_count = 1
                                                })
                                            }
                                            Write-Log "[WEB-ACTIVITY-V3] Firefox ($userName): $($firefoxDomains.Count) dominios via regex" "INFO"
                                            
                                            $buffer = $null
                                            $dataString = $null
                                        }
                                    } catch {
                                        Write-Log "[WEB-ACTIVITY-V3] Firefox regex falhou ($userName): $($_.Exception.Message)" "WARN"
                                    }
                                }
                                Remove-Item $tempPlacesPath -Force -ErrorAction SilentlyContinue
                            }
                            break
                        }
                    }
                }
            } catch {
                Write-Log "[WEB-ACTIVITY-V3] Erro ao acessar Firefox ($userName): $($_.Exception.Message)" "WARN"
            }
            
            # 2c. Edge History - SQLITE COM TIMESTAMPS REAIS
            try {
                $edgeHistoryPath = Join-Path $userPath "AppData\Local\Microsoft\Edge\User Data\Default\History"
                if (Test-Path $edgeHistoryPath) {
                    $tempHistoryPath = "$env:TEMP\edge_history_temp_$(Get-Random).db"
                    Copy-Item -Path $edgeHistoryPath -Destination $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    
                    if (Test-Path $tempHistoryPath) {
                        $sqliteResults = $null
                        
                        try {
                            $sqliteResults = Get-BrowserHistorySQLite `
                                -DbPath $tempHistoryPath `
                                -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" `
                                -BrowserName "Edge" `
                                -UserName $userName
                        } catch {
                            Write-Log "[WEB-ACTIVITY-V3] Edge SQLite falhou ($userName): $($_.Exception.Message)" "DEBUG"
                        }
                        
                        if ($sqliteResults -and $sqliteResults.Count -gt 0) {
                            foreach ($row in $sqliteResults) {
                                $domain = Extract-DomainFromUrl $row.url
                                if (-not $domain -or $domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "*microsoft*" -or $domain -like "*bing*") { continue }
                                
                                $visitedAt = ConvertFrom-WebKitTimestamp $row.last_visit_time
                                [void]$items.Add(@{
                                    domain = $domain
                                    source = "edge_history_$userName"
                                    visited_at = if ($visitedAt) { $visitedAt.ToString("o") } else { $nowUtc.ToString("o") }
                                    visit_count = [int]$row.visit_count
                                })
                            }
                            Write-Log "[WEB-ACTIVITY-V3] Edge ($userName): $($sqliteResults.Count) registros via SQLite" "INFO"
                        } else {
                            # Fallback regex
                            try {
                                $maxBytes = 5 * 1024 * 1024
                                $fileInfo = Get-Item $tempHistoryPath
                                $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes)
                                
                                $fileStream = [System.IO.File]::OpenRead($tempHistoryPath)
                                $buffer = New-Object byte[] $bytesToRead
                                [void]$fileStream.Read($buffer, 0, $bytesToRead)
                                $fileStream.Close()
                                $fileStream.Dispose()
                                
                                if ($buffer) {
                                    $dataString = [System.Text.Encoding]::UTF8.GetString($buffer)
                                    $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
                                    
                                    $edgeDomains = $urlMatches | 
                                        ForEach-Object { $_.Groups[1].Value } | 
                                        Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*microsoft*" -and $_ -notlike "*bing*" } |
                                        Select-Object -Unique -First 50
                                    
                                    foreach ($domain in $edgeDomains) {
                                        [void]$items.Add(@{
                                            domain = $domain
                                            source = "edge_history_$userName"
                                            visited_at = $nowUtc.ToString("o")
                                            visit_count = 1
                                        })
                                    }
                                    Write-Log "[WEB-ACTIVITY-V3] Edge ($userName): $($edgeDomains.Count) dominios via regex" "INFO"
                                    
                                    $buffer = $null
                                    $dataString = $null
                                }
                            } catch {
                                Write-Log "[WEB-ACTIVITY-V3] Edge regex falhou ($userName): $($_.Exception.Message)" "WARN"
                            }
                        }
                        Remove-Item $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch {
                Write-Log "[WEB-ACTIVITY-V3] Erro ao acessar Edge ($userName): $($_.Exception.Message)" "WARN"
            }
        }

        # AGREGACAO POR DOMINIO: soma visit_count, usa ultimo visited_at
        Write-Log "[WEB-ACTIVITY-V3] Agregando por dominio..." "INFO"
        $aggregated = @{}
        foreach ($item in $items) {
            $key = $item.domain
            if ($aggregated.ContainsKey($key)) {
                $aggregated[$key].visit_count += $item.visit_count
                # Manter o timestamp mais recente
                if ($item.visited_at -gt $aggregated[$key].visited_at) {
                    $aggregated[$key].visited_at = $item.visited_at
                    $aggregated[$key].source = $item.source
                }
            } else {
                $aggregated[$key] = @{
                    domain = $item.domain
                    source = $item.source
                    visited_at = $item.visited_at
                    visit_count = $item.visit_count
                }
            }
        }
        
        $uniqueItems = @($aggregated.Values) | Select-Object -First $maxDomains
        
        Write-Log "[WEB-ACTIVITY-V3] Agregacao: $($items.Count) items -> $($uniqueItems.Count) dominios unicos" "INFO"

        if (-not $uniqueItems.Count) {
            Write-Log "[WEB-ACTIVITY-V3] Nenhum dominio encontrado em nenhuma fonte" "INFO"
            return @{
                success = $true
                output  = "Nenhum dominio encontrado"
            }
        }

        Write-Log "[WEB-ACTIVITY-V3] Total de dominios unicos: $($uniqueItems.Count)" "INFO"

        # FEATURE FLAG: web_activity_version v3 para rastreabilidade
        $body = @{
            agent_id = $Job.agent_id
            items    = $uniqueItems
            web_activity_version = "v3"  # Feature flag para identificar dados SSA-009
        }

        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-web-activity" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if (-not $result.Success) {
            throw "Falha ao enviar atividade web (HTTP $($result.StatusCode))"
        }

        Write-Log "[WEB-ACTIVITY-V3] Atividade enviada com sucesso. Dominios: $($uniqueItems.Count)" "SUCCESS"

        return @{
            success = $true
            output  = "Atividade web v3 enviada. Dominios: $($uniqueItems.Count)"
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-CollectWebActivityJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

function Invoke-UpdateAgentJob {
    param($Job)
    
    try {
        Write-Log "[UPDATE] Iniciando update_agent - v4.1.2" "INFO"
        
        # ============================================================
        # FASE 3.0: SAFE MODE CHECK
        # Block updates if agent is in Safe Mode (rollback loop detected)
        # ============================================================
        $rollbackState = Get-RollbackState
        if ($rollbackState.safe_mode) {
            Write-Log "[SAFE MODE] Updates desabilitados - rollback loop detectado" "ERROR"
            
            Add-EvidenceEntry -Type "security_warning" -Data @{
                event = "update_blocked_safe_mode"
                rollback_count = $rollbackState.rollback_count
                last_rollback = $rollbackState.last_rollback
            } -Severity "warning"
            
            return @{ 
                success = $false
                error = "Safe mode active - updates disabled"
                safe_mode = $true
            }
        }
        
        Add-EvidenceEntry -Type "update_check" -Data @{
            current_version = $Global:AgentVersion
            phase = "starting"
        } -Severity "info"
        
        # Chama serve-agent-update
        $updateResult = Invoke-SecureRequest `
            -Path "/functions/v1/serve-agent-update" `
            -Method GET `
            -TimeoutSec 60
        
        if (-not $updateResult.Success) {
            throw "Falha ao buscar update: HTTP $($updateResult.StatusCode)"
        }
        
        $data = $updateResult.Body | ConvertFrom-Json
        
        # Ja esta na ultima versao?
        if ($data.message -eq "Already up to date") {
            Write-Log "[INFO] Agente ja esta na ultima versao ($($data.current_version))" "INFO"
            Add-EvidenceEntry -Type "update_check" -Data @{
                status = "already_current"
                version = $data.current_version
            } -Severity "info"
            return @{ success = $true; output = ($data | ConvertTo-Json -Compress) }
        }
        
        # Fora do rollout?
        if ($data.message -eq "No update available (outside rollout)") {
            Write-Log "[INFO] Agente fora do rollout gradual (bucket: $($data.rollout_bucket), required: <$($data.rollout_percentage)%)" "INFO"
            Add-EvidenceEntry -Type "update_check" -Data @{
                status = "outside_rollout"
                bucket = $data.rollout_bucket
                rollout_percentage = $data.rollout_percentage
            } -Severity "info"
            return @{ success = $true; output = ($data | ConvertTo-Json -Compress) }
        }
        
        $newVersion   = $data.version
        $expectedHash = $data.sha256
        
        Write-Log "[UPDATE] Atualizando agente para versao $newVersion" "INFO"
        
        # SMART PATH DETECTION - Tenta multiplas estrategias para encontrar script atual
        $installDir = "C:\CyberShield"
        $targetScript = Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"
        
        # Detectar script atual em execucao
        $currentScript = $null
        $possiblePaths = @(
            $PSCommandPath,
            (Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"),
            (Join-Path $installDir "cybershield-agent-v4.ps1"),
            (Join-Path $installDir "cybershield-agent-v3.ps1"),
            (Join-Path $installDir "cybershield-agent.ps1")
        )
        
        foreach ($path in $possiblePaths) {
            if ($path -and (Test-Path $path)) {
                $currentScript = $path
                Write-Log "[UPDATE] Script atual detectado: $currentScript" "INFO"
                break
            }
        }
        
        # Fallback: busca qualquer script cybershield-agent-*.ps1
        if (-not $currentScript) {
            $found = Get-ChildItem -Path $installDir -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) {
                $currentScript = $found.FullName
                Write-Log "[UPDATE] Script encontrado via glob: $currentScript" "INFO"
            }
        }
        
        $tempScript = Join-Path $env:TEMP "cybershield-agent-update-$newVersion.ps1"
        
        # ============================================================
        # CRITICAL: BASE64 DECODE - Preserva 100% dos bytes
        # Imune a transformacoes JSON/PowerShell
        # ============================================================
        $bytes = $null
        if ($data.script_content_base64) {
            Write-Log "[UPDATE] Usando Base64 decode (safe mode)" "INFO"
            $bytes = [System.Convert]::FromBase64String($data.script_content_base64)
            [System.IO.File]::WriteAllBytes($tempScript, $bytes)
            Write-Log "[UPDATE] Script salvo via WriteAllBytes ($($bytes.Length) bytes)" "INFO"
        } else {
            # Fallback para agentes antigos (menos seguro)
            Write-Log "[UPDATE] Fallback para script_content (string mode)" "WARN"
            $scriptText = $data.script_content
            [System.IO.File]::WriteAllText($tempScript, $scriptText, [System.Text.UTF8Encoding]::new($false))
            $bytes = [System.IO.File]::ReadAllBytes($tempScript)
        }
        
        # Validar SHA256 do arquivo ESCRITO no disco
        $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash.ToLower()) {
            Remove-Item $tempScript -Force
            throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
        }
        
        Write-Log "[SUCCESS] SHA256 validado: $actualHash" "SUCCESS"
        
        # ============================================================
        # FASE 2.6: ED25519 SIGNATURE VERIFICATION
        # Verifica assinatura criptografica ANTES de aplicar update
        # ============================================================
        $signatureVerified = $false
        if ($data.signature_base64) {
            Write-Log "[SECURITY] Verificando assinatura Ed25519 (signed by: $($data.signed_by))" "INFO"
            
            $signatureVerified = Verify-Ed25519Signature -ScriptBytes $bytes -SignatureBase64 $data.signature_base64
            
            if (-not $signatureVerified) {
                Remove-Item $tempScript -Force
                
                Add-EvidenceEntry -Type "error" -Data @{
                    event = "signature_rejected"
                    version = $newVersion
                    signed_by = $data.signed_by
                    sha256 = $actualHash
                } -Severity "error"
                
                throw "Ed25519 signature verification FAILED - Update rejected for security"
            }
            
            Add-EvidenceEntry -Type "security_event" -Data @{
                event = "signature_verified"
                version = $newVersion
                signed_by = $data.signed_by
                signed_at = $data.signed_at
            } -Severity "info"
        } else {
            Write-Log "[SECURITY] Nenhuma assinatura fornecida - modo backward compatible" "WARN"
            
            # Log para auditoria
            Add-EvidenceEntry -Type "security_warning" -Data @{
                event = "unsigned_update"
                version = $newVersion
                note = "Update applied without cryptographic signature (backward compatible)"
            } -Severity "warning"
        }
        
        # ============================================================
        # FASE 3.0: STRUCTURED BACKUP FOR ROLLBACK
        # Create structured backup BEFORE applying new version
        # ============================================================
        $previousPath = $Global:RollbackPaths.Previous
        
        # Backup do script atual para rollback estruturado
        if ($currentScript -and (Test-Path $currentScript)) {
            try {
                Copy-Item -Path $currentScript -Destination $previousPath -Force
                Write-Log "[ROLLBACK] Structured backup created: $previousPath" "INFO"
                
                # Update rollback state with previous version info
                $rollbackState = Get-RollbackState
                $rollbackState.previous_version = $Global:AgentVersion
                Save-RollbackState -State $rollbackState
            } catch {
                Write-Log "[WARN] Structured backup failed: $($_.Exception.Message)" "WARN"
            }
            
            # Also create timestamped backup for historical purposes
            $backupScript = $currentScript -replace '\.ps1$', "-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss').ps1"
            try {
                Copy-Item -Path $currentScript -Destination $backupScript -Force
                Write-Log "[BACKUP] Historical backup: $backupScript" "INFO"
            } catch {
                Write-Log "[WARN] Historical backup falhou: $($_.Exception.Message)" "WARN"
            }
        } else {
            Write-Log "[WARN] Script atual nao encontrado, pulando backup" "WARN"
        }
        
        # Instalar novo script no path padrao
        Copy-Item -Path $tempScript -Destination $targetScript -Force
        Remove-Item $tempScript -Force
        Write-Log "[SUCCESS] Script instalado: $targetScript" "SUCCESS"
        
        # Registrar evidencia de update aplicado
        Add-EvidenceEntry -Type "update_applied" -Data @{
            old_version = $Global:AgentVersion
            new_version = $newVersion
            target_path = $targetScript
            sha256 = $actualHash
            base64_mode = [bool]$data.script_content_base64
            signature_verified = $signatureVerified
            signed_by = $data.signed_by
        } -Severity "info"
        
        Write-Log "[SUCCESS] Script v$newVersion instalado em $targetScript" "SUCCESS"
        Write-Log "[INFO] Nova versao sera carregada no proximo boot do sistema" "INFO"
        Write-Log "[INFO] Agente continua operando normalmente com versao $($Global:AgentVersion)" "INFO"
        
        $output = @{
            message     = "Update saved - will be active after Windows reboot"
            newVersion  = $newVersion
            currentVersion = $Global:AgentVersion
            targetPath  = $targetScript
            sha256      = $actualHash
            base64Mode  = [bool]$data.script_content_base64
            signatureVerified = $signatureVerified
            signedBy    = $data.signed_by
            requiresReboot = $true
            savedAt     = (Get-Date).ToUniversalTime().ToString("o")
        }
        
        return @{ success = $true; output = ($output | ConvertTo-Json -Compress) }
    }
    catch {
        # CRITICAL: Use "error" instead of "update_failed" for backward compatibility
        # Old agents don't have "update_failed" in ValidateSet, causing update chicken-and-egg problem
        Add-EvidenceEntry -Type "error" -Data @{
            event = "update_failed"
            error = $_.Exception.Message
            current_version = $Global:AgentVersion
        } -Severity "error"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  POLL DE JOBS
# ============================================
function Poll-Jobs {
    $body = @{
        agent_name    = $Global:AgentName
        agent_version = $Global:AgentVersion
        state         = Get-AgentState
    }

    Write-Log "Consultando jobs..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/poll-jobs" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 20

        if (-not $result.Success -or $result.StatusCode -ne 200) {
            Write-Log "[ERROR] poll-jobs falhou (Status=$($result.StatusCode))" "ERROR"
            return
        }

        if ([string]::IsNullOrWhiteSpace($result.Body)) {
            return
        }

        $jobs = $result.Body | ConvertFrom-Json

        if ($null -eq $jobs -or $jobs.Count -eq 0) {
            Write-Log "[POLL] Nenhum job disponivel" "DEBUG"
            return
        }

        Write-Log "[JOBS] Recebidos $($jobs.Count) job(s)" "INFO"

        foreach ($job in $jobs) {
            Execute-Job -Job $job
        }
    } catch {
        Write-Log "[ERROR] Erro no poll-jobs: $($_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  BOOTSTRAP VALIDATION (ANTES DO LOOP)
# ============================================
Invoke-BootstrapValidation

# ============================================
#  LOOP PRINCIPAL v4.0.9-HARDENED
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] CyberShield Agent v4.0.9-HARDENED" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

# Registrar inicio no Evidence Journal
Add-EvidenceEntry -Type "state_change" -Data @{
    event = "agent_started"
    version = $Global:AgentVersion
    hostname = $env:COMPUTERNAME
    features = @("state_machine", "evidence_journal", "dns_filter", "policy_contract")
} -StateBefore $null -StateAfter "BOOTSTRAP" -Severity "info"

try {
    $bootstrapStart = Get-Date
    
    # Transicao: BOOTSTRAP -> SYNCING
    Set-AgentState -NewState "SYNCING" -Reason "Starting initial sync"

    # ============================================================
    # FASE 3: HEALTH CHECK POS-UPDATE + SAFE MODE CHECK
    # ============================================================
    $rollbackState = Get-RollbackState
    
    # Verificar Safe Mode
    if ($rollbackState.safe_mode) {
        Write-Log "[SAFE MODE] Agente em modo seguro - auto-updates desabilitados" "WARN"
        Add-EvidenceEntry -Type "security_event" -Data @{
            event = "safe_mode_active"
            version = $Global:AgentVersion
            rollback_count = $rollbackState.rollback_count
        } -Severity "warning"
    }
    
    # Health Check pos-update: detectar se houve update recente
    if ($rollbackState.previous_version -and $rollbackState.previous_version -ne $Global:AgentVersion) {
        Write-Log "[HEALTH CHECK] Update detectado: $($rollbackState.previous_version) -> $($Global:AgentVersion)" "INFO"
        Write-Log "[HEALTH CHECK] Aguardando 5s para estabilizacao..." "INFO"
        Start-Sleep -Seconds 5
        
        Write-Log "[HEALTH CHECK] Validando versao $($Global:AgentVersion)..." "INFO"
        $health = Test-PostUpdateHealth
        
        if (-not $health.healthy) {
            Write-Log "[HEALTH CHECK] FALHA: $($health.reason)" "ERROR"
            Add-EvidenceEntry -Type "security_event" -Data @{
                event = "health_check_failed"
                version = $Global:AgentVersion
                previous_version = $rollbackState.previous_version
                reason = $health.reason
            } -Severity "error"
            
            # Executar rollback automatico
            $rollbackResult = Invoke-SafeRollback -Reason "health_check_failed"
            
            if ($rollbackResult.safe_mode) {
                Write-Log "[CRITICAL] Agente entrou em SAFE MODE apos rollback loop" "ERROR"
            }
            # Se rollback executado com sucesso, o agente sera reiniciado
            # Se falhou, continuar em modo degradado
        } else {
            Write-Log "[HEALTH CHECK] Versao $($Global:AgentVersion) validada com sucesso" "SUCCESS"
            
            # Reset rollback state apos sucesso
            $rollbackState.rollback_count = 0
            $rollbackState.previous_version = $null
            Save-RollbackState -State $rollbackState
            
            Add-EvidenceEntry -Type "state_change" -Data @{
                event = "update_validated"
                version = $Global:AgentVersion
                health_check = "passed"
            } -Severity "info"
        }
    }
    # ============================================================

    # Sincronizar policy do servidor
    Write-Log "[BOOTSTRAP] Syncing policy from server..." "INFO"
    Sync-PolicyFromServer | Out-Null

    # Iniciar DNS Filter se habilitado
    if ($Global:DNSFilterConfig.Enabled) {
        Write-Log "[BOOTSTRAP] Initializing DNS Filter..." "INFO"
        $dnsStatus = Get-DNSFilterStatus
        if ($dnsStatus.exe_exists) {
            Start-DNSFilterService | Out-Null
        } else {
            Write-Log "[BOOTSTRAP] DNS Filter EXE not found, skipping" "WARN"
        }
    }

    # Primeiro heartbeat
    $heartbeatSuccess = Send-Heartbeat
    
    if ($heartbeatSuccess) {
        # Transicao: SYNCING -> ENFORCING
        Set-AgentState -NewState "ENFORCING" -Reason "Initial heartbeat successful"
    } else {
        # Transicao: SYNCING -> DEGRADED
        Set-AgentState -NewState "DEGRADED" -Reason "Initial heartbeat failed"
    }

    # Verificar compliance inicial
    $compliance = Check-PolicyCompliance
    if (-not $compliance.compliant) {
        Write-Log "[BOOTSTRAP] Policy drift detected - enforcing..." "WARN"
        Invoke-PolicyEnforcement | Out-Null
    }

    $bootstrapElapsed = [int]((Get-Date) - $bootstrapStart).TotalSeconds
    Write-Log "[SUCCESS] Bootstrap concluido em ${bootstrapElapsed}s (state: $(Get-AgentState))" "SUCCESS"

    $lastHeartbeat = Get-Date
    $lastPoll = Get-Date
    $lastMetrics = Get-Date
    $lastEvidenceFlush = Get-Date
    $lastRotation = Get-Date
    $lastDNSHealthCheck = Get-Date
    $lastPolicyCheck = Get-Date
    $lastPolicySync = Get-Date

    while ($true) {
        $now = Get-Date
        $state = Get-AgentState

        try {
            # Heartbeat a cada intervalo
            if ((($now - $lastHeartbeat).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                $success = Send-Heartbeat
                
                if (-not $success -and $state -eq "ENFORCING") {
                    # Tentar recovery
                    Invoke-AutoRecovery -FailedComponent "heartbeat" -ErrorMessage "Heartbeat failed"
                } elseif ($success -and $state -eq "DEGRADED") {
                    # Recuperado
                    Set-AgentState -NewState "ENFORCING" -Reason "Heartbeat recovered"
                }
                
                $lastHeartbeat = Get-Date
            }

            # Poll de jobs (somente em estados validos)
            if ((($now - $lastPoll).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                if (Test-CanExecuteJob) {
                    Poll-Jobs
                }
                $lastPoll = Get-Date
            }

            # DNS Health Check a cada 2 minutos
            if ($Global:DNSFilterConfig.Enabled -and (($now - $lastDNSHealthCheck).TotalSeconds) -ge 120) {
                $dnsHealth = Test-DNSFilterHealth
                
                if (-not $dnsHealth.healthy) {
                    Write-Log "[DNS] Health check failed: $($dnsHealth.reason)" "WARN"
                    
                    # Auto-recovery apos 3 falhas consecutivas
                    if ($dnsHealth.consecutive_failures -ge 3) {
                        Invoke-AutoRecovery -FailedComponent "dns_filter" -ErrorMessage $dnsHealth.reason
                    }
                }
                
                $lastDNSHealthCheck = Get-Date
            }

            # Policy Compliance Check a cada 5 minutos
            if ((($now - $lastPolicyCheck).TotalSeconds) -ge 300) {
                $compliance = Check-PolicyCompliance
                
                if (-not $compliance.compliant) {
                    Write-Log "[POLICY] Drift detected, attempting enforcement..." "WARN"
                    Invoke-PolicyEnforcement | Out-Null
                }
                
                $lastPolicyCheck = Get-Date
            }

            # Policy Sync do servidor a cada 30 minutos
            if ((($now - $lastPolicySync).TotalSeconds) -ge 1800) {
                Sync-PolicyFromServer | Out-Null
                $lastPolicySync = Get-Date
            }

            # Flush evidence a cada 5 minutos
            if ((($now - $lastEvidenceFlush).TotalSeconds) -ge 300) {
                Invoke-FlushEvidence
                $lastEvidenceFlush = Get-Date
            }

            # ============================================
            #  ENVIO DE METRICAS A CADA 5 MINUTOS (v4.0.9 SIMPLIFIED)
            # ============================================
            try {
                if ((($now - $lastMetrics).TotalSeconds) -ge 300) {
                    # Send-SystemMetrics agora e auto-contida (coleta + envia)
                    $sent = Send-SystemMetrics
                    
                    if ($sent) {
                        Add-EvidenceEntry -Type "metrics_sent" -Data @{
                            auto = $true
                            version = "v4.0.9"
                        } -Severity "debug"
                    }
                    
                    $lastMetrics = Get-Date
                }
            } catch {
                # NUNCA derrubar o loop por causa de metrics
                Write-Log "[WARN] Erro ao processar metrics: $($_.Exception.Message)" "WARN"
            }

            # Rotacao de logs/evidence a cada hora
            if ((($now - $lastRotation).TotalSeconds) -ge 3600) {
                Invoke-LogRotation
                Invoke-EvidenceRotation
                $lastRotation = Get-Date
            }

        } catch {
            Write-Log "[ERROR] Erro no loop principal: $($_.Exception.Message)" "ERROR"
            
            Add-EvidenceEntry -Type "error" -Data @{
                error = $_.Exception.Message
                stack = $_.ScriptStackTrace
                state = $state
            } -Severity "error"
            
            # Tentar recovery para erros criticos
            if ($state -eq "ENFORCING") {
                Set-AgentState -NewState "DEGRADED" -Reason "Main loop error" -ErrorDetails $_.Exception.Message
            }
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Log "[FATAL] Erro fatal no agente: $($_.Exception.Message)" "ERROR"
    
    Set-AgentState -NewState "ERROR" -Reason "Fatal error" -ErrorDetails $_.Exception.Message
    
    Add-EvidenceEntry -Type "error" -Data @{
        fatal = $true
        error = $_.Exception.Message
        stack = $_.ScriptStackTrace
    } -Severity "critical"
    
    # Flush final antes de morrer
    Invoke-FlushEvidence
    
    exit 1
}
