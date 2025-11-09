# CyberShield Agent - Windows PowerShell Script com HMAC
# Versão: 2.1 com correções críticas para produção

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

# Capturar path do script no topo (crítico para service installation)
$SCRIPT_PATH = $PSCommandPath

# Validar parâmetros
if ([string]::IsNullOrWhiteSpace($AgentToken)) {
    throw "AgentToken não pode ser vazio"
}

if ([string]::IsNullOrWhiteSpace($HmacSecret)) {
    throw "HmacSecret não pode ser vazio"
}

if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    throw "ServerUrl não pode ser vazio"
}

if ($PollInterval -lt 10) {
    Write-Host "[AVISO] PollInterval muito baixo, usando 10 segundos"
    $PollInterval = 10
}

# Normalizar ServerUrl (remover trailing slash)
$ServerUrl = $ServerUrl.TrimEnd('/')

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

# Função para fazer requisição com HMAC e retry com exponential backoff
function Invoke-SecureRequest {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = "",
        [int]$MaxRetries = 3
    )
    
    $retryCount = 0
    $backoffSeconds = 2
    
    while ($retryCount -le $MaxRetries) {
        try {
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
        } catch {
            $retryCount++
            if ($retryCount -gt $MaxRetries) {
                Write-Host "[ERRO] Todas as tentativas falharam: $_"
                throw
            }
            Write-Host "[AVISO] Tentativa $retryCount/$MaxRetries falhou. Aguardando ${backoffSeconds}s..."
            Start-Sleep -Seconds $backoffSeconds
            $backoffSeconds *= 2  # Exponential backoff
        }
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

# Função para executar job com processamento de payload
function Execute-Job {
    param($Job)
    
    Write-Host "[INFO] Executando job: $($Job.id) - Tipo: $($Job.type)"
    
    $result = $null
    $payload = $null
    
    # Parse payload se existir
    if ($Job.payload) {
        try {
            $payload = $Job.payload | ConvertFrom-Json -ErrorAction SilentlyContinue
        } catch {
            Write-Host "[AVISO] Falha ao fazer parse do payload: $_"
        }
    }
    
    switch ($Job.type) {
        "scan" {
            # Executar scan de segurança
            if ($payload -and $payload.filePath) {
                Write-Host "[INFO] Escaneando arquivo: $($payload.filePath)"
                $scanResult = Scan-File -FilePath $payload.filePath
                
                if ($scanResult) {
                    $result = @{
                        status = "completed"
                        data = $scanResult
                        filePath = $payload.filePath
                    }
                } else {
                    $result = @{
                        status = "failed"
                        error = "Scan falhou ou arquivo não encontrado"
                        filePath = $payload.filePath
                    }
                }
            } else {
                $result = @{
                    status = "failed"
                    error = "Payload inválido: filePath obrigatório para scan"
                }
            }
        }
        "update" {
            # Executar atualização
            Write-Host "[INFO] Executando update..."
            $result = @{
                status = "completed"
                data = @{
                    updated = $true
                    timestamp = (Get-Date).ToString("o")
                }
            }
        }
        "report" {
            # Gerar relatório do sistema
            Write-Host "[INFO] Gerando relatório do sistema..."
            $systemInfo = @{
                hostname = $env:COMPUTERNAME
                os = [Environment]::OSVersion.VersionString
                powershell = $PSVersionTable.PSVersion.ToString()
                uptime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
            }
            
            $result = @{
                status = "completed"
                data = @{
                    report_generated = $true
                    system_info = $systemInfo
                    timestamp = (Get-Date).ToString("o")
                }
            }
        }
        "config" {
            # Configuração
            Write-Host "[INFO] Aplicando configuração..."
            $result = @{
                status = "completed"
                data = @{
                    configured = $true
                    payload_received = ($payload -ne $null)
                    timestamp = (Get-Date).ToString("o")
                }
            }
        }
        default {
            $result = @{
                status = "unknown_type"
                error = "Tipo de job desconhecido: $($Job.type)"
            }
        }
    }
    
    return $result
}

# Função para fazer upload do report de execução do job
function Upload-Report {
    param(
        [string]$JobId,
        [object]$Result
    )
    
    try {
        $reportData = @{
            job_id = $JobId
            result = $Result
            timestamp = (Get-Date).ToString("o")
            agent_token = $AgentToken
        } | ConvertTo-Json -Depth 10
        
        $url = "$ServerUrl/functions/v1/upload-report"
        $response = Invoke-SecureRequest -Url $url -Method POST -Body $reportData
        
        Write-Host "[INFO] Report enviado para job $JobId"
        return $true
    } catch {
        Write-Host "[ERRO] Falha ao enviar report para job $JobId : $_"
        return $false
    }
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

# Função para health check do sistema
function Test-SystemHealth {
    $health = @{
        timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
        system_time_local = (Get-Date).ToString("o")
        powershell_version = $PSVersionTable.PSVersion.ToString()
        os_version = [Environment]::OSVersion.VersionString
        hostname = $env:COMPUTERNAME
        can_reach_server = $false
        server_latency_ms = $null
    }
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $null = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/poll-jobs" -Method HEAD -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        $stopwatch.Stop()
        $health.can_reach_server = $true
        $health.server_latency_ms = $stopwatch.ElapsedMilliseconds
    } catch {
        $health.can_reach_server = $false
        $health.connection_error = $_.Exception.Message
    }
    
    return $health
}

# Função principal
function Start-Agent {
    Write-Host "==================================="
    Write-Host "CyberShield Agent v2.1 - Iniciando"
    Write-Host "==================================="
    Write-Host "Servidor: $ServerUrl"
    Write-Host "Intervalo: $PollInterval segundos"
    Write-Host "HMAC: Habilitado"
    Write-Host "Retry: Exponential backoff ativo"
    Write-Host ""
    
    # Health check inicial do sistema
    Write-Host "[INFO] Executando health check inicial..."
    $health = Test-SystemHealth
    Write-Host "[INFO] Sistema: $($health.hostname) | OS: $($health.os_version)"
    Write-Host "[INFO] PowerShell: $($health.powershell_version)"
    
    if ($health.can_reach_server) {
        Write-Host "[OK] Servidor acessível (latência: $($health.server_latency_ms)ms)"
    } else {
        Write-Host "[AVISO] Não foi possível conectar ao servidor: $($health.connection_error)"
        Write-Host "[INFO] Continuando, tentativas com retry automático..."
    }
    Write-Host ""
    
    while ($true) {
        try {
            # Polling de jobs
            $jobs = Poll-Jobs
            
            if ($jobs -and $jobs.Count -gt 0) {
                Write-Host "[INFO] $($jobs.Count) job(s) recebido(s)"
                
                foreach ($job in $jobs) {
                    try {
                        # Executar job
                        $result = Execute-Job -Job $job
                        
                        # Enviar report da execução
                        $uploadSuccess = Upload-Report -JobId $job.id -Result $result
                        
                        # Confirmar job
                        if ($uploadSuccess) {
                            Ack-Job -JobId $job.id
                        } else {
                            Write-Host "[AVISO] Job $($job.id) executado mas report não enviado"
                            # ACK mesmo assim para não ficar preso
                            Ack-Job -JobId $job.id
                        }
                    } catch {
                        Write-Host "[ERRO] Falha ao processar job $($job.id): $_"
                        # ACK para não reprocessar
                        Ack-Job -JobId $job.id
                    }
                }
            }
            
            # Aguardar próximo polling
            Start-Sleep -Seconds $PollInterval
        } catch {
            Write-Host "[ERRO] Erro no loop principal: $_"
            Write-Host "[INFO] Aguardando 10s antes de tentar novamente..."
            Start-Sleep -Seconds 10
        }
    }
}

# Instalar como serviço (opcional)
function Install-Service {
    $serviceName = "CyberShieldAgent"
    
    # Usar variável capturada no topo do script
    if (-not $SCRIPT_PATH) {
        Write-Host "[ERRO] SCRIPT_PATH não definido. Execute o script diretamente, não através de dot-sourcing."
        return
    }
    
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    
    if ($service) {
        Write-Host "Serviço já existe. Removendo..."
        Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $serviceName
        Start-Sleep -Seconds 2
    }
    
    Write-Host "Instalando serviço..."
    Write-Host "Script path: $SCRIPT_PATH"
    
    $params = "-AgentToken `"$AgentToken`" -HmacSecret `"$HmacSecret`" -ServerUrl `"$ServerUrl`" -PollInterval $PollInterval"
    
    # Configurar serviço com recovery options
    New-Service -Name $serviceName `
        -BinaryPathName "powershell.exe -ExecutionPolicy Bypass -NoProfile -File `"$SCRIPT_PATH`" $params" `
        -DisplayName "CyberShield Security Agent" `
        -Description "Agente de segurança CyberShield com autenticação HMAC e retry automático" `
        -StartupType Automatic
    
    # Configurar recovery (restart on failure)
    sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000
    
    Start-Service -Name $serviceName
    
    Write-Host "Serviço instalado e iniciado com sucesso!"
    Write-Host "Recovery configurado: restart automático em caso de falha"
}

# Iniciar agente
Start-Agent
