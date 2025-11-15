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

# Função simplificada de HMAC
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

# Teste 1: Health check com assinatura válida
Write-Host "`n[Teste 1] Health check com HMAC válido..." -ForegroundColor Yellow
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
        Write-Host "✅ PASSOU: Health check retornou OK" -ForegroundColor Green
        Write-Host "   Agent: $($result.agent.name)" -ForegroundColor Gray
        Write-Host "   Server Time: $($result.server.timestamp)" -ForegroundColor Gray
    } else {
        Write-Host "❌ FALHOU: Status inesperado" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

# Teste 2: Health check com assinatura inválida (deve retornar código estruturado)
Write-Host "`n[Teste 2] Health check com HMAC inválido..." -ForegroundColor Yellow
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
    
    Write-Host "❌ FALHOU: Deveria ter retornado 401" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    if ($statusCode -eq 401) {
        try {
            $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
            
            if ($errorBody.code) {
                Write-Host "✅ PASSOU: Retornou 401 com código estruturado" -ForegroundColor Green
                Write-Host "   Código: $($errorBody.code)" -ForegroundColor Gray
                Write-Host "   Mensagem: $($errorBody.message)" -ForegroundColor Gray
                Write-Host "   Transitório: $($errorBody.transient)" -ForegroundColor Gray
            } else {
                Write-Host "⚠️  PARCIAL: Retornou 401 mas sem campo 'code'" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "⚠️  PARCIAL: Retornou 401 mas JSON inválido" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ FALHOU: Status code incorreto: $statusCode" -ForegroundColor Red
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
    
    Write-Host "❌ FALHOU: Deveria ter rejeitado timestamp antigo" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    if ($statusCode -eq 401) {
        try {
            $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
            
            if ($errorBody.code -eq "AUTH_TIMESTAMP_OUT_OF_RANGE" -and $errorBody.transient -eq $true) {
                Write-Host "✅ PASSOU: Rejeitou timestamp antigo com código correto e flag transient" -ForegroundColor Green
                Write-Host "   Código: $($errorBody.code)" -ForegroundColor Gray
                Write-Host "   Transitório: $($errorBody.transient)" -ForegroundColor Gray
            } else {
                Write-Host "⚠️  PARCIAL: Rejeitou mas código/flags incorretos" -ForegroundColor Yellow
                Write-Host "   Código: $($errorBody.code)" -ForegroundColor Gray
                Write-Host "   Transitório: $($errorBody.transient)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "⚠️  PARCIAL: Retornou 401 mas JSON inválido" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ FALHOU: Status code incorreto: $statusCode" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Testes concluídos!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
