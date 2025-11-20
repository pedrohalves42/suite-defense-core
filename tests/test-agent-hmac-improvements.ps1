# Script de teste manual
# Salvar como: test-agent-hmac-improvements.ps1

param(
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co",
    [string]$AgentToken = "",
    [string]$HmacSecret = ""
)

if (-not $AgentToken -or -not $HmacSecret) {
    Write-Host "Uso: .\test-agent-hmac-improvements.ps1 -AgentToken SEU_TOKEN -HmacSecret SEU_SECRET" -ForegroundColor Red
    exit 1
}

# Funcao simplificada de HMAC
function Get-TestHmacSignature {
    param([string]$Data, [string]$Secret)
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
    $dataBytes = [System.Text.Encoding]::UTF8.GetBytes($Data)
    $hashBytes = $hmac.ComputeHash($dataBytes)
    $signature = [BitConverter]::ToString($hashBytes).Replace('-', '').ToLower()
    return $signature
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Teste de Melhorias do Agent HMAC" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Teste 1: Health check com assinatura valida
Write-Host "`n[Teste 1] Health check com HMAC valido..." -ForegroundColor Yellow
try {
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $nonce = [guid]::NewGuid().ToString()
    $bodyJson = "{}"
    $dataToSign = "${timestamp}:${nonce}:${bodyJson}"
    $signature = Get-TestHmacSignature -Data $dataToSign -Secret $HmacSecret
    
    $headers = @{
        "Content-Type" = "application/json"
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp
        "X-Nonce" = $nonce
    }
    
    $response = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/agent-health-check" `
        -Method POST `
        -Headers $headers `
        -Body $bodyJson `
        -UseBasicParsing
    
    $result = $response.Content | ConvertFrom-Json
    
    if ($result.status -eq "ok") {
        Write-Host "[OK]  PASSOU: Health check retornou OK" -ForegroundColor Green
        Write-Host "   Agent: $($result.agent.name)" -ForegroundColor Gray
        Write-Host "   Server Time: $($result.server.timestamp)" -ForegroundColor Gray
    } else {
        Write-Host "[ERROR]  FALHOU: Status inesperado" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR]  ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

# Teste 2: Health check com assinatura invalida (deve retornar codigo estruturado)
Write-Host "`n[Teste 2] Health check com HMAC invalido..." -ForegroundColor Yellow
try {
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $nonce = [guid]::NewGuid().ToString()
    $bodyJson = "{}"
    $signature = "assinatura_invalida_proposital"
    
    $headers = @{
        "Content-Type" = "application/json"
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp
        "X-Nonce" = $nonce
    }
    
    $response = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/agent-health-check" `
        -Method POST `
        -Headers $headers `
        -Body $bodyJson `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "[ERROR]  FALHOU: Deveria ter retornado 401" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    if ($statusCode -eq 401) {
        try {
            $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
            
            if ($errorBody.code) {
                Write-Host "[OK]  PASSOU: Retornou 401 com codigo estruturado" -ForegroundColor Green
                Write-Host "   Codigo: $($errorBody.code)" -ForegroundColor Gray
                Write-Host "   Mensagem: $($errorBody.message)" -ForegroundColor Gray
                Write-Host "   Transitorio: $($errorBody.transient)" -ForegroundColor Gray
            } else {
                Write-Host "[WARN] ?  PARCIAL: Retornou 401 mas sem campo 'code'" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "[WARN] ?  PARCIAL: Retornou 401 mas JSON invalido" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[ERROR]  FALHOU: Status code incorreto: $statusCode" -ForegroundColor Red
    }
}

# Teste 3: Timestamp expirado (clock skew)
Write-Host "`n[Teste 3] Clock skew (timestamp antigo)..." -ForegroundColor Yellow
try {
    $oldTimestamp = [DateTimeOffset]::UtcNow.AddMinutes(-10).ToUnixTimeMilliseconds()
    $nonce = [guid]::NewGuid().ToString()
    $bodyJson = "{}"
    $dataToSign = "${oldTimestamp}:${nonce}:${bodyJson}"
    $signature = Get-TestHmacSignature -Data $dataToSign -Secret $HmacSecret
    
    $headers = @{
        "Content-Type" = "application/json"
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $oldTimestamp
        "X-Nonce" = $nonce
    }
    
    $response = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/agent-health-check" `
        -Method POST `
        -Headers $headers `
        -Body $bodyJson `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "[ERROR]  FALHOU: Deveria ter rejeitado timestamp antigo" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    if ($statusCode -eq 401) {
        try {
            $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
            
            if ($errorBody.code -eq "AUTH_TIMESTAMP_OUT_OF_RANGE" -and $errorBody.transient -eq $true) {
                Write-Host "[OK]  PASSOU: Rejeitou timestamp antigo com codigo correto e flag transient" -ForegroundColor Green
                Write-Host "   Codigo: $($errorBody.code)" -ForegroundColor Gray
                Write-Host "   Transitorio: $($errorBody.transient)" -ForegroundColor Gray
            } else {
                Write-Host "[WARN] ?  PARCIAL: Rejeitou mas codigo/flags incorretos" -ForegroundColor Yellow
                Write-Host "   Codigo: $($errorBody.code)" -ForegroundColor Gray
                Write-Host "   Transitorio: $($errorBody.transient)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "[WARN] ?  PARCIAL: Retornou 401 mas JSON invalido" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[ERROR]  FALHOU: Status code incorreto: $statusCode" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Testes concluidos!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
