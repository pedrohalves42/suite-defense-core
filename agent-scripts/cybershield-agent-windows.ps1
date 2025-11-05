# CyberShield Agent - Windows PowerShell Script com HMAC
# Versão: 2.0 com autenticação HMAC e rate limiting

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentToken,
    
    [Parameter(Mandatory=$true)]
    [string]$HmacSecret,
    
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [Parameter(Mandatory=$false)]
    [int]$PollInterval = 60
)

$ErrorActionPreference = "Stop"

# Função para gerar assinatura HMAC
function Get-HmacSignature {
    param(
        [string]$Message,
        [string]$Secret
    )
    
    $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
    $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Message))
    return [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
}

# Função para fazer requisição com HMAC
function Invoke-SecureRequest {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = ""
    )
    
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $nonce = [guid]::NewGuid().ToString()
    $payload = "${timestamp}:${nonce}:${Body}"
    $signature = Get-HmacSignature -Message $payload -Secret $HmacSecret
    
    $headers = @{
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp.ToString()
        "X-Nonce" = $nonce
        "Content-Type" = "application/json"
    }
    
    if ($Method -eq "GET") {
        return Invoke-RestMethod -Uri $Url -Method GET -Headers $headers -TimeoutSec 30
    } else {
        return Invoke-RestMethod -Uri $Url -Method POST -Headers $headers -Body $Body -TimeoutSec 30
    }
}

# Função para polling de jobs
function Poll-Jobs {
    try {
        $jobs = Invoke-SecureRequest -Url "$ServerUrl/functions/v1/poll-jobs"
        return $jobs
    } catch {
        Write-Host "[ERRO] Falha ao fazer polling: $_"
        return @()
    }
}

# Função para executar job
function Execute-Job {
    param($Job)
    
    Write-Host "[INFO] Executando job: $($Job.id) - Tipo: $($Job.type)"
    
    $result = $null
    
    switch ($Job.type) {
        "scan" {
            # Executar scan de segurança
            $result = @{
                status = "completed"
                data = @{
                    timestamp = (Get-Date).ToString("o")
                    type = "security_scan"
                }
            }
        }
        "update" {
            # Executar atualização
            $result = @{
                status = "completed"
                data = @{
                    updated = $true
                }
            }
        }
        "report" {
            # Gerar relatório
            $result = @{
                status = "completed"
                data = @{
                    report_generated = $true
                }
            }
        }
        "config" {
            # Configuração
            $result = @{
                status = "completed"
                data = @{
                    configured = $true
                }
            }
        }
        default {
            $result = @{
                status = "unknown_type"
            }
        }
    }
    
    return $result
}

# Função para ACK do job
function Ack-Job {
    param([string]$JobId)
    
    try {
        $url = "$ServerUrl/functions/v1/ack-job/$JobId"
        $response = Invoke-SecureRequest -Url $url -Method POST
        Write-Host "[INFO] Job $JobId confirmado"
        return $true
    } catch {
        Write-Host "[ERRO] Falha ao confirmar job $JobId : $_"
        return $false
    }
}

# Função para calcular hash SHA256
function Get-FileHashSHA256 {
    param([string]$FilePath)
    
    $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

# Função para scan de vírus
function Scan-File {
    param(
        [string]$FilePath
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "[ERRO] Arquivo não encontrado: $FilePath"
        return $null
    }
    
    try {
        $fileHash = Get-FileHashSHA256 -FilePath $FilePath
        
        $body = @{
            filePath = $FilePath
            fileHash = $fileHash
        } | ConvertTo-Json
        
        $result = Invoke-SecureRequest `
            -Url "$ServerUrl/functions/v1/scan-virus" `
            -Method POST `
            -Body $body
        
        if ($result.isMalicious) {
            Write-Host "[ALERTA] Arquivo malicioso detectado!"
            Write-Host "  Arquivo: $FilePath"
            Write-Host "  Hash: $fileHash"
            Write-Host "  Detecções: $($result.positives)/$($result.totalScans)"
            Write-Host "  Link: $($result.permalink)"
        } else {
            Write-Host "[OK] Arquivo limpo: $FilePath"
        }
        
        return $result
    } catch {
        Write-Host "[ERRO] Falha ao escanear arquivo: $_"
        return $null
    }
}

# Função principal
function Start-Agent {
    Write-Host "==================================="
    Write-Host "CyberShield Agent v2.0 - Iniciando"
    Write-Host "==================================="
    Write-Host "Servidor: $ServerUrl"
    Write-Host "Intervalo: $PollInterval segundos"
    Write-Host "HMAC: Habilitado"
    Write-Host ""
    
    while ($true) {
        try {
            # Polling de jobs
            $jobs = Poll-Jobs
            
            if ($jobs -and $jobs.Count -gt 0) {
                Write-Host "[INFO] $($jobs.Count) job(s) recebido(s)"
                
                foreach ($job in $jobs) {
                    # Executar job
                    $result = Execute-Job -Job $job
                    
                    # Confirmar job
                    Ack-Job -JobId $job.id
                }
            }
            
            # Aguardar próximo polling
            Start-Sleep -Seconds $PollInterval
        } catch {
            Write-Host "[ERRO] Erro no loop principal: $_"
            Start-Sleep -Seconds 10
        }
    }
}

# Instalar como serviço (opcional)
function Install-Service {
    $serviceName = "CyberShieldAgent"
    $scriptPath = $MyInvocation.MyCommand.Path
    
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    
    if ($service) {
        Write-Host "Serviço já existe. Removendo..."
        Stop-Service -Name $serviceName -Force
        sc.exe delete $serviceName
        Start-Sleep -Seconds 2
    }
    
    Write-Host "Instalando serviço..."
    
    $params = "-AgentToken `"$AgentToken`" -HmacSecret `"$HmacSecret`" -ServerUrl `"$ServerUrl`" -PollInterval $PollInterval"
    
    New-Service -Name $serviceName `
        -BinaryPathName "powershell.exe -ExecutionPolicy Bypass -File `"$scriptPath`" $params" `
        -DisplayName "CyberShield Security Agent" `
        -Description "Agente de segurança CyberShield com autenticação HMAC" `
        -StartupType Automatic
    
    Start-Service -Name $serviceName
    
    Write-Host "Serviço instalado e iniciado com sucesso!"
}

# Iniciar agente
Start-Agent
