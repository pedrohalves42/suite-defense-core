<#
    CyberShield Agent - Windows v3.10.23-NETSH-FALLBACK
    
    Funcionalidades:
    - HMAC SHA256 com secret em HEX (64 chars -> 32 bytes)
    - Heartbeat periodico
    - Poll de jobs
    - Execucao de jobs (scan + report + security features)
    - Envio de resultado (submit-job-result)
    - Evento de post_installation
    - Suporte a jobs tipo REPORT (metricas do sistema)
    - Inventario de software (software_inventory_collect)
    - Scanner de vulnerabilidades leve (light_vuln_scan)
    - Coleta de status de antivirus (collect_antivirus_status)
    - Atividade web de TODOS OS PERFIS DE USUARIO (collect_web_activity)
    - Auto-remediacao basica (fix_firewall, restart_service)
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows-v3.ps1 `
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
    [string]$AgentVersion = "v3.10.23-NETSH-FALLBACK"
)

$ErrorActionPreference = "Stop"

# ============================================
#  TRAP GLOBAL PARA ERROS NAO TRATADOS
# ============================================
trap {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = "FATAL ERROR: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)"
    $stack = $_.ScriptStackTrace

    $logDir = "C:\CyberShield\logs"
    $logPath = Join-Path $logDir "cybershield-agent-v3.log"

    # Log em arquivo se a pasta existir
    if (Test-Path $logDir) {
        try {
            "$ts [FATAL] $msg" | Out-File -FilePath $logPath -Append -Encoding UTF8
            "$ts [FATAL] Stack: $stack" | Out-File -FilePath $logPath -Append -Encoding UTF8
        } catch {
            # se ate gravar log falhar, nao fazer mais nada aqui
        }
    }

    # Fallback para EventLog (source ja registrada pelo instalador)
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -EntryType Error -Message "$msg`n$stack" -ErrorAction SilentlyContinue

    throw
}

# ============================================
#  VARIAVEIS GLOBAIS
# ============================================
$Global:ServerUrl    = $ServerUrl.TrimEnd('/')
$Global:AgentToken   = $AgentToken
$Global:HmacSecret   = $HmacSecret
$Global:AgentName    = $AgentName
$Global:AgentVersion = $AgentVersion

# Diretorio de log
$logDir = Join-Path -Path $PSScriptRoot -ChildPath "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$Global:LogFilePath = Join-Path -Path $logDir -ChildPath "cybershield-agent-v3.log"

# Intervalos
$Global:PollIntervalSeconds = 30

# ============================================
#  CONFIGURACAO DE REDE (TLS 1.2 + Proxy)
# ============================================
# Forcar TLS 1.2 para compatibilidade com Supabase/Cloudflare
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Configurar proxy do sistema (para ambientes corporativos)
try {
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    [System.Net.WebRequest]::DefaultWebProxy = $proxy
    [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
} catch {
    # Ignorar erro de proxy - continuar sem proxy configurado
}

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
    $line = "[{0}] [{1}] {2}" -f $timestamp, $Level, $Message

    Write-Host $line
    
    try {
        Add-Content -Path $Global:LogFilePath -Value $line
    } catch {
        # Ignorar erro de escrita no log para nao quebrar o agente
    }
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
        Write-Log "HMAC_SECRET invalido. Esperado 64 caracteres hex (32 bytes). Length: $($HexString.Length)" "ERROR"
        throw "Invalid HMAC_SECRET format. Expected 64 hex characters, got: $($HexString.Length)"
    }

    try {
        $bytes = New-Object byte[] 32
        for ($i = 0; $i -lt 64; $i += 2) {
            $bytes[$i / 2] = [Convert]::ToByte($HexString.Substring($i, 2), 16)
        }
        return $bytes
    } catch {
        Write-Log "Falha ao converter HMAC_SECRET de HEX para bytes: $($_.Exception.Message)" "ERROR"
        throw "HMAC_SECRET conversion failed: $($_.Exception.Message)"
    }
}

# ============================================
#  P0 FIX: FIREWALL PROFILES COM FALLBACK NETSH
#  Resolve FUNC-01: Get-NetFirewallProfile falta em alguns Windows
# ============================================
function Get-FirewallProfilesSafe {
    <#
    .SYNOPSIS
    Obtem status dos perfis de firewall com fallback para netsh em sistemas mais antigos.
    
    .DESCRIPTION
    Tenta usar Get-NetFirewallProfile (modulo NetSecurity) primeiro.
    Se nao disponivel, faz fallback para netsh advfirewall.
    #>
    
    $profiles = @()
    
    # Tentativa 1: Get-NetFirewallProfile (modulo NetSecurity)
    try {
        if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) {
            $fwProfiles = Get-NetFirewallProfile -ErrorAction Stop
            foreach ($p in $fwProfiles) {
                $profiles += [PSCustomObject]@{
                    Name    = $p.Name
                    Enabled = $p.Enabled
                }
            }
            Write-Log "[FIREWALL] Obtido via Get-NetFirewallProfile: $($profiles.Count) perfis" "DEBUG"
            return $profiles
        }
    } catch {
        Write-Log "[FIREWALL] Get-NetFirewallProfile falhou: $($_.Exception.Message), tentando netsh..." "WARN"
    }
    
    # Tentativa 2: Fallback para netsh advfirewall
    try {
        $netshOutput = netsh advfirewall show allprofiles state 2>&1
        
        if ($LASTEXITCODE -eq 0 -and $netshOutput) {
            $outputText = $netshOutput | Out-String
            
            # Parsear output do netsh para cada perfil
            foreach ($profileName in @("Domain", "Private", "Public")) {
                $enabled = $false
                
                # Procurar padrao "Profile Settings:" ou "<ProfileName> Profile Settings:"
                # seguido de "State" e "ON" ou "OFF"
                $pattern = "(?s)$profileName.*?State\s+(ON|OFF)"
                if ($outputText -match $pattern) {
                    $enabled = ($Matches[1] -eq "ON")
                }
                
                $profiles += [PSCustomObject]@{
                    Name    = $profileName
                    Enabled = $enabled
                }
            }
            Write-Log "[FIREWALL] Obtido via netsh: $($profiles.Count) perfis" "DEBUG"
        }
    } catch {
        Write-Log "[FIREWALL] netsh fallback falhou: $($_.Exception.Message)" "WARN"
    }
    
    # Se nenhum metodo funcionou, retornar array vazio
    if ($profiles.Count -eq 0) {
        Write-Log "[FIREWALL] Nao foi possivel obter perfis de firewall por nenhum metodo" "WARN"
    }
    
    return $profiles
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

    $messageBytes   = [Text.Encoding]::UTF8.GetBytes($Message)
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

    $uri        = "$($Global:ServerUrl)$Path"
    $retryCount = 0
    $retryDelay = 2

    while ($true) {
        try {
            $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            $nonce     = [guid]::NewGuid().ToString()

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

            $payload   = '{0}:{1}:{2}' -f $timestamp, $nonce, $bodyJson
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
                # CRITICAL: Forcar UTF-8 encoding para garantir consistencia HMAC
                $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
                $params.Body = $bodyBytes
            }

            Write-Log "[NETWORK] $Method $uri" "INFO"
            Write-Log "DEBUG: $Method $uri (body_length=$($bodyJson.Length))" "DEBUG"

            $response = Invoke-WebRequest @params -UseBasicParsing
            $status   = [int]$response.StatusCode

            Write-Log "[NETWORK] Response: $status from $uri" "INFO"
            Write-Log "DEBUG: Resposta $status de $uri" "DEBUG"

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
                Write-Log "[ERROR] Erro de autenticacao (401). Verifique AgentToken / HmacSecret / clock." "ERROR"
                throw
            }

            if ($retryCount -ge $MaxRetries) {
                Write-Log "[ERROR] Falha definitiva apos $MaxRetries tentativas em $uri" "ERROR"
                throw
            }

            Write-Log "WARN: Aguardando $retryDelay segundos para tentar de novo..." "WARN"
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
            os_type      = "Windows"
            os_name      = $os.Caption
            os_version   = $os.Version
            build_number = $os.BuildNumber
            hostname     = $env:COMPUTERNAME
            domain       = $cs.Domain
            total_ram_gb = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
            agent_name   = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
    } catch {
        Write-Log "Erro ao coletar informacoes do sistema: $($_.Exception.Message)" "WARN"
        return @{
            os_type      = "Windows"
            hostname     = $env:COMPUTERNAME
            agent_name   = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
    }
}

# ============================================
#  REPORT JOB (METRICAS DO SISTEMA)
# ============================================
function Invoke-ReportJob {
    param(
        $Job
    )

    $report = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        hostname  = $env:COMPUTERNAME
    }

    try {
        # CPU - tentar Get-Counter primeiro, depois WMI fallback
        try {
            $cpuSample = Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop
            $cpuUsage  = $cpuSample.CounterSamples.CookedValue
        } catch {
            Write-Log "[METRICS] Get-Counter CPU falhou, usando WMI fallback" "WARN"
            $cpuUsage = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
            if ($null -eq $cpuUsage) { $cpuUsage = 0 }
        }

        # Memoria - usar WMI (mais confiavel)
        $os = Get-WmiObject Win32_OperatingSystem
        $memUsage = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)

        # Disco (C:) - tentar Get-PSDrive primeiro, depois WMI
        try {
            $cDrive = Get-PSDrive -Name C -ErrorAction Stop
            $diskPercent = 0
            if (($cDrive.Used + $cDrive.Free) -gt 0) {
                $diskPercent = [math]::Round(($cDrive.Used / ($cDrive.Used + $cDrive.Free)) * 100, 2)
            }
        } catch {
            Write-Log "[METRICS] Get-PSDrive falhou, usando WMI fallback" "WARN"
            $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
            if ($disk -and $disk.Size -gt 0) {
                $diskPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 2)
            } else {
                $diskPercent = 0
            }
        }

        $report.cpu_percent    = [math]::Round($cpuUsage, 2)
        $report.memory_percent = $memUsage
        $report.disk_percent   = $diskPercent

        Write-Log "[REPORT] Metricas coletadas: CPU=$($report.cpu_percent)%, MEM=$($report.memory_percent)%, DISK=$($report.disk_percent)%" "INFO"

        return @{
            success = $true
            output  = ($report | ConvertTo-Json -Compress)
        }
    } catch {
        $errorMsg = "Falha ao coletar metrics do report: {0}" -f $_.Exception.Message
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            output  = $errorMsg
        }
    }
}

# ============================================
#  SOFTWARE INVENTORY JOB
# ============================================
function Invoke-SoftwareInventoryJob {
    param(
        $Job
    )

    Write-Log "[SOFTWARE-INVENTORY] Iniciando coleta de inventario de software..." "INFO"

    $items = @()

    try {
        $keys = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )

        foreach ($keyPath in $keys) {
            $apps = Get-ItemProperty -Path $keyPath -ErrorAction SilentlyContinue
            foreach ($app in $apps) {
                if ([string]::IsNullOrWhiteSpace($app.DisplayName)) {
                    continue
                }

                $items += @{
                    name = $app.DisplayName
                    version = $app.DisplayVersion
                    vendor = $app.Publisher
                    install_location = $app.InstallLocation
                }
            }
        }

        Write-Log "[SOFTWARE-INVENTORY] Coletados $($items.Count) itens" "SUCCESS"

        $body = @{
            agent_id = $Job.agent_id
            items    = $items
        }

        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-software-inventory" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if (-not $result.Success) {
            throw "Falha ao enviar inventario (HTTP $($result.StatusCode))"
        }

        return @{
            success = $true
            output  = "Inventario enviado. Itens: $($items.Count)"
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-SoftwareInventoryJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  LIGHT VULN SCAN JOB
# ============================================
function Invoke-LightVulnScanJob {
    param(
        $Job
    )

    Write-Log "[VULN-SCAN] Iniciando light vuln scan..." "INFO"

    $findings = @()

    try {
        # Check 1: Firewall (usando funcao com fallback netsh)
        $firewallProfiles = Get-FirewallProfilesSafe
        if ($firewallProfiles) {
            foreach ($p in $firewallProfiles) {
                if (-not $p.Enabled) {
                    $findings += @{
                        severity = "high"
                        check_key = "firewall_disabled_$($p.Name)"
                        title = "Firewall desativado no perfil $($p.Name)"
                        description = "Firewall deve permanecer habilitado em todos os perfis."
                        remediation = "Ativar firewall para o perfil $($p.Name)."
                    }
                }
            }
        }

        # Check 2: RDP
        $rdpKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server"
        $fDenyTSConn = Get-ItemProperty -Path $rdpKey -Name "fDenyTSConnections" -ErrorAction SilentlyContinue

        if ($fDenyTSConn -and $fDenyTSConn.fDenyTSConnections -eq 0) {
            $findings += @{
                severity = "medium"
                check_key = "rdp_enabled"
                title = "RDP habilitado"
                description = "RDP habilitado aumenta a superficie de ataque."
                remediation = "Desabilitar RDP se nao for necessario."
            }
        }

        # Check 3: SMBv1
        try {
            $smbv1 = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue
            if ($smbv1 -and $smbv1.State -eq "Enabled") {
                $findings += @{
                    severity = "high"
                    check_key = "smbv1_enabled"
                    title = "SMBv1 habilitado"
                    description = "SMBv1 e vulneravel e deve ser desabilitado."
                    remediation = "Desabilitar SMBv1 via Windows Features."
                }
            }
        } catch {
            Write-Log "[VULN-SCAN] Nao foi possivel verificar SMBv1" "WARN"
        }

        Write-Log "[VULN-SCAN] Encontrados $($findings.Count) findings" "INFO"

        if ($findings.Count -gt 0) {
            $body = @{
                agent_id = $Job.agent_id
                findings = $findings
            }

            $result = Invoke-SecureRequest `
                -Path "/functions/v1/submit-vuln-findings" `
                -Method "POST" `
                -Body $body `
                -TimeoutSec 30

            if (-not $result.Success) {
                throw "Falha ao enviar findings (HTTP $($result.StatusCode))"
            }
        }

        return @{
            success = $true
            output  = "Light vuln scan concluido. Findings: $($findings.Count)"
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-LightVulnScanJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  ANTIVIRUS STATUS JOB
# ============================================
function Invoke-CollectAntivirusStatusJob {
    param(
        $Job
    )

    Write-Log "[AV-STATUS] Coletando status de antivirus..." "INFO"

    try {
        $statusList = @()

        try {
            $avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName "AntiVirusProduct" -ErrorAction SilentlyContinue
            foreach ($av in $avProducts) {
                $statusList += @{
                    engine_name = $av.displayName
                    engine_version = $av.productState.ToString()
                    status = "active"
                }
            }
        } catch {
            Write-Log "[AV-STATUS] Erro ao ler SecurityCenter2: $($_.Exception.Message)" "WARN"
        }

        if (-not $statusList.Count) {
            Write-Log "[AV-STATUS] Nenhum produto de antivirus detectado" "INFO"
            
            return @{
                success = $true
                output  = "Nenhum produto de antivirus detectado"
            }
        }

        $body = @{
            agent_id = $Job.agent_id
            items    = $statusList
        }

        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-antivirus-status" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if (-not $result.Success) {
            throw "Falha ao enviar status AV (HTTP $($result.StatusCode))"
        }

        Write-Log "[AV-STATUS] Status enviado. Produtos: $($statusList.Count)" "SUCCESS"

        return @{
            success = $true
            output  = "Status AV enviado. Produtos: $($statusList.Count)"
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-CollectAntivirusStatusJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  WEB ACTIVITY JOB (SITES ACESSADOS)
# ============================================
function Invoke-WebActivityJob {
    param(
        $Job
    )

    Write-Log "[WEB-ACTIVITY] Iniciando coleta de atividade web..." "INFO"

    try {
        $payload = $null
        if ($null -ne $Job.payload -and $Job.payload) {
            try {
                $payload = $Job.payload | ConvertFrom-Json
            } catch {
                Write-Log "[WEB-ACTIVITY] Payload invalido, usando defaults" "WARN"
            }
        }

        $maxDomains = 500
        if ($payload -and $payload.max_domains) {
            $maxDomains = [int]$payload.max_domains
        }

        $nowUtc = [DateTime]::UtcNow
        $items = @()

        # 1. Coletar DNS Cache
        Write-Log "[WEB-ACTIVITY] Coletando cache DNS..." "INFO"
        try {
            $dnsEntries = Get-DnsClientCache -ErrorAction SilentlyContinue
            if ($dnsEntries) {
                $dnsEntries = $dnsEntries |
                    Where-Object { $_.Entry -and $_.Name } |
                    Sort-Object -Property Name -Unique |
                    Select-Object -First 100

                foreach ($entry in $dnsEntries) {
                    $domain = $entry.Name
                    if ([string]::IsNullOrWhiteSpace($domain)) {
                        continue
                    }

                    if ($domain -like "localhost*" -or
                        $domain -like "*.local" -or
                        $domain -like "local") {
                        continue
                    }

                    $items += @{
                        domain = $domain
                        source = "dns_cache"
                        visited_at = $nowUtc.ToString("o")
                    }
                }
                Write-Log "[WEB-ACTIVITY] Cache DNS: $($dnsEntries.Count) dominios coletados" "INFO"
            }
        } catch {
            Write-Log "[WEB-ACTIVITY] Erro ao ler cache DNS: $($_.Exception.Message)" "WARN"
        }

        # 2. Coletar historico de TODOS OS PERFIS DE USUARIO
        # O agente roda como SYSTEM, entao precisamos iterar C:\Users\*
        Write-Log "[WEB-ACTIVITY] Coletando historico de todos os perfis de usuario..." "INFO"
        
        $userProfiles = @()
        try {
            $userProfiles = Get-ChildItem -Path "C:\Users" -Directory -ErrorAction SilentlyContinue | 
                Where-Object { $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') }
            Write-Log "[WEB-ACTIVITY] Encontrados $($userProfiles.Count) perfis de usuario" "INFO"
        } catch {
            Write-Log "[WEB-ACTIVITY] Erro ao listar perfis de usuario: $($_.Exception.Message)" "WARN"
        }
        
        foreach ($userProfile in $userProfiles) {
            $userName = $userProfile.Name
            $userPath = $userProfile.FullName
            
            Write-Log "[WEB-ACTIVITY] Processando perfil: $userName" "INFO"
            
            # 2a. Chrome History para este usuario
            try {
                $chromeHistoryPath = Join-Path $userPath "AppData\Local\Google\Chrome\User Data\Default\History"
                if (Test-Path $chromeHistoryPath) {
                    $tempHistoryPath = "$env:TEMP\chrome_history_temp_$(Get-Random).db"
                    Copy-Item -Path $chromeHistoryPath -Destination $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    
                    if (Test-Path $tempHistoryPath) {
                        try {
                            $chromeData = Get-Content $tempHistoryPath -Encoding Byte -ReadCount 0 -ErrorAction SilentlyContinue
                            if ($chromeData) {
                                $dataString = [System.Text.Encoding]::UTF8.GetString($chromeData)
                                $urlMatches = [regex]::Matches($dataString, 'https?://([^/\s\x00]+)')
                                
                                $chromeDomains = $urlMatches | 
                                    ForEach-Object { $_.Groups[1].Value } | 
                                    Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*google*" } |
                                    Select-Object -Unique -First 50
                                
                                foreach ($domain in $chromeDomains) {
                                    $items += @{
                                        domain = $domain
                                        source = "chrome_history_$userName"
                                        visited_at = $nowUtc.ToString("o")
                                    }
                                }
                                Write-Log "[WEB-ACTIVITY] Chrome ($userName): $($chromeDomains.Count) dominios" "INFO"
                            }
                        } catch {
                            Write-Log "[WEB-ACTIVITY] Erro ao ler Chrome ($userName): $($_.Exception.Message)" "WARN"
                        }
                        Remove-Item $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch {
                Write-Log "[WEB-ACTIVITY] Erro ao acessar Chrome ($userName): $($_.Exception.Message)" "WARN"
            }
            
            # 2b. Firefox History para este usuario
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
                                try {
                                    $firefoxData = Get-Content $tempPlacesPath -Encoding Byte -ReadCount 0 -ErrorAction SilentlyContinue
                                    if ($firefoxData) {
                                        $dataString = [System.Text.Encoding]::UTF8.GetString($firefoxData)
                                        $urlMatches = [regex]::Matches($dataString, 'https?://([^/\s\x00]+)')
                                        
                                        $firefoxDomains = $urlMatches | 
                                            ForEach-Object { $_.Groups[1].Value } | 
                                            Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*mozilla*" } |
                                            Select-Object -Unique -First 50
                                        
                                        foreach ($domain in $firefoxDomains) {
                                            $items += @{
                                                domain = $domain
                                                source = "firefox_history_$userName"
                                                visited_at = $nowUtc.ToString("o")
                                            }
                                        }
                                        Write-Log "[WEB-ACTIVITY] Firefox ($userName): $($firefoxDomains.Count) dominios" "INFO"
                                    }
                                } catch {
                                    Write-Log "[WEB-ACTIVITY] Erro ao ler Firefox ($userName): $($_.Exception.Message)" "WARN"
                                }
                                Remove-Item $tempPlacesPath -Force -ErrorAction SilentlyContinue
                            }
                            break
                        }
                    }
                }
            } catch {
                Write-Log "[WEB-ACTIVITY] Erro ao acessar Firefox ($userName): $($_.Exception.Message)" "WARN"
            }
            
            # 2c. Edge History para este usuario
            try {
                $edgeHistoryPath = Join-Path $userPath "AppData\Local\Microsoft\Edge\User Data\Default\History"
                if (Test-Path $edgeHistoryPath) {
                    $tempHistoryPath = "$env:TEMP\edge_history_temp_$(Get-Random).db"
                    Copy-Item -Path $edgeHistoryPath -Destination $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    
                    if (Test-Path $tempHistoryPath) {
                        try {
                            $edgeData = Get-Content $tempHistoryPath -Encoding Byte -ReadCount 0 -ErrorAction SilentlyContinue
                            if ($edgeData) {
                                $dataString = [System.Text.Encoding]::UTF8.GetString($edgeData)
                                $urlMatches = [regex]::Matches($dataString, 'https?://([^/\s\x00]+)')
                                
                                $edgeDomains = $urlMatches | 
                                    ForEach-Object { $_.Groups[1].Value } | 
                                    Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*microsoft*" -and $_ -notlike "*bing*" } |
                                    Select-Object -Unique -First 50
                                
                                foreach ($domain in $edgeDomains) {
                                    $items += @{
                                        domain = $domain
                                        source = "edge_history_$userName"
                                        visited_at = $nowUtc.ToString("o")
                                    }
                                }
                                Write-Log "[WEB-ACTIVITY] Edge ($userName): $($edgeDomains.Count) dominios" "INFO"
                            }
                        } catch {
                            Write-Log "[WEB-ACTIVITY] Erro ao ler Edge ($userName): $($_.Exception.Message)" "WARN"
                        }
                        Remove-Item $tempHistoryPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch {
                Write-Log "[WEB-ACTIVITY] Erro ao acessar Edge ($userName): $($_.Exception.Message)" "WARN"
            }
        }

        # Deduplicate and limit
        $uniqueItems = $items | Sort-Object -Property domain -Unique | Select-Object -First $maxDomains

        if (-not $uniqueItems.Count) {
            Write-Log "[WEB-ACTIVITY] Nenhum dominio encontrado em nenhuma fonte" "INFO"

            return @{
                success = $true
                output  = "Nenhum dominio encontrado"
            }
        }

        Write-Log "[WEB-ACTIVITY] Total de dominios unicos coletados: $($uniqueItems.Count)" "INFO"

        $body = @{
            agent_id = $Job.agent_id
            items    = $uniqueItems  # FIX v3.10.22: Usar lista deduplicada ao inves de $items
        }

        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-web-activity" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if (-not $result.Success) {
            throw "Falha ao enviar atividade web (HTTP $($result.StatusCode))"
        }

        Write-Log "[WEB-ACTIVITY] Atividade enviada. Dominios unicos: $($uniqueItems.Count)" "SUCCESS"

        return @{
            success = $true
            output  = "Atividade web enviada. Dominios unicos: $($uniqueItems.Count)"
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-WebActivityJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  FIX FIREWALL JOB (AUTO-REMEDIACAO)
# ============================================
function Invoke-FixFirewallJob {
    param(
        $Job
    )

    Write-Log "[FIX-FIREWALL] Iniciando auto-remediacao de firewall..." "INFO"

    try {
        # Usar funcao com fallback para detectar status
        $profiles = Get-FirewallProfilesSafe
        
        if ($profiles.Count -eq 0) {
            throw "Nao foi possivel obter status dos perfis de firewall"
        }
        
        $fixed = @()
        foreach ($p in $profiles) {
            if (-not $p.Enabled) {
                Write-Log "[FIX-FIREWALL] Ativando firewall no perfil $($p.Name)" "INFO"
                
                # Tentar Set-NetFirewallProfile primeiro, fallback para netsh
                try {
                    if (Get-Command Set-NetFirewallProfile -ErrorAction SilentlyContinue) {
                        Set-NetFirewallProfile -Name $p.Name -Enabled True -ErrorAction Stop
                    } else {
                        # Fallback: netsh advfirewall
                        $result = netsh advfirewall set $($p.Name.ToLower())profile state on 2>&1
                        if ($LASTEXITCODE -ne 0) {
                            throw "netsh falhou: $result"
                        }
                    }
                    $fixed += $p.Name
                } catch {
                    Write-Log "[FIX-FIREWALL] Falha ao ativar perfil $($p.Name): $($_.Exception.Message)" "ERROR"
                }
            }
        }

        if ($fixed.Count -gt 0) {
            Write-Log "[FIX-FIREWALL] Firewall ativado em: $($fixed -join ', ')" "SUCCESS"
            return @{
                success = $true
                output  = "Firewall ativado em perfis: $($fixed -join ', ')"
            }
        } else {
            Write-Log "[FIX-FIREWALL] Firewall ja estava ativo em todos os perfis" "INFO"
            return @{
                success = $true
                output  = "Firewall ja ativo em todos os perfis"
            }
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-FixFirewallJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  RESTART SERVICE JOB (AUTO-REMEDIACAO)
# ============================================
function Invoke-RestartServiceJob {
    param(
        $Job
    )

    Write-Log "[RESTART-SERVICE] Iniciando restart de servico..." "INFO"

    try {
        $payload = $null
        if ($null -ne $Job.payload -and $Job.payload) {
            try {
                $payload = $Job.payload | ConvertFrom-Json
            } catch {
                throw "Payload invalido"
            }
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

        return @{
            success = $true
            output  = "Servico '$serviceName' reiniciado com sucesso. Status: $($serviceAfter.Status)"
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-RestartServiceJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  COLLECT NETWORK INFO JOB
# ============================================
function Invoke-CollectNetworkInfoJob {
    param(
        $Job
    )

    Write-Log "[NETWORK-INFO] Iniciando coleta de informacoes de rede..." "INFO"

    try {
        # 1. Windows Firewall Status
        $firewallDomain = $null
        $firewallPrivate = $null
        $firewallPublic = $null
        
        try {
            # Usar funcao com fallback netsh
            $profiles = Get-FirewallProfilesSafe
            foreach ($p in $profiles) {
                switch ($p.Name) {
                    "Domain" { $firewallDomain = $p.Enabled }
                    "Private" { $firewallPrivate = $p.Enabled }
                    "Public" { $firewallPublic = $p.Enabled }
                }
            }
            Write-Log "[NETWORK-INFO] Firewall: Domain=$firewallDomain, Private=$firewallPrivate, Public=$firewallPublic" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter firewall: $($_.Exception.Message)" "WARN"
        }

        # 2. Open Ports (listening) - Using Get-NetTCPConnection/Get-NetUDPEndpoint (more reliable than netstat)
        $openPorts = @()
        try {
            # TCP Listening ports
            $tcpListening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
            foreach ($conn in $tcpListening) {
                $processName = "unknown"
                try { 
                    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                    if ($proc) { $processName = $proc.ProcessName }
                } catch { }
                $openPorts += @{
                    port = $conn.LocalPort
                    process = $processName
                    protocol = "TCP"
                }
            }
            
            # UDP Endpoints
            $udpEndpoints = Get-NetUDPEndpoint -ErrorAction SilentlyContinue
            foreach ($endpoint in $udpEndpoints) {
                $processName = "unknown"
                try { 
                    $proc = Get-Process -Id $endpoint.OwningProcess -ErrorAction SilentlyContinue
                    if ($proc) { $processName = $proc.ProcessName }
                } catch { }
                $openPorts += @{
                    port = $endpoint.LocalPort
                    process = $processName
                    protocol = "UDP"
                }
            }
            
            # Deduplicate and limit
            $openPorts = $openPorts | Sort-Object { $_.port } -Unique | Select-Object -First 100
            Write-Log "[NETWORK-INFO] Portas abertas: $($openPorts.Count)" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter portas: $($_.Exception.Message)" "WARN"
        }

        # 3. Active Connections (established)
        $activeConnections = @()
        try {
            $established = netstat -ano 2>$null | Select-String "ESTABLISHED"
            $activeConnections = $established | ForEach-Object {
                $parts = ($_.Line -split '\s+').Where({ $_ -ne '' })
                if ($parts.Count -ge 5) {
                    $foreignAddress = $parts[2]
                    $remoteAddr = ""
                    $remotePort = 0
                    if ($foreignAddress -match '^(.+):(\d+)$') {
                        $remoteAddr = $Matches[1]
                        $remotePort = [int]$Matches[2]
                    }
                    @{
                        remote_address = $remoteAddr
                        remote_port = $remotePort
                        state = "ESTABLISHED"
                    }
                }
            } | Where-Object { $_.remote_port -gt 0 } | Select-Object -First 100
            Write-Log "[NETWORK-INFO] Conexoes ativas: $($activeConnections.Count)" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter conexoes: $($_.Exception.Message)" "WARN"
        }

        # 4. Network Adapters
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
            Write-Log "[NETWORK-INFO] Adaptadores: $($networkAdapters.Count)" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter adaptadores: $($_.Exception.Message)" "WARN"
        }

        # 5. DNS Servers
        $dnsServers = @()
        try {
            $dnsConfig = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
                Where-Object { $_.ServerAddresses } | 
                Select-Object -ExpandProperty ServerAddresses -Unique
            $dnsServers = @($dnsConfig)
            Write-Log "[NETWORK-INFO] DNS Servers: $($dnsServers -join ', ')" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter DNS: $($_.Exception.Message)" "WARN"
        }

        # 6. Gateway IP
        $gatewayIp = $null
        try {
            $gateway = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($gateway) {
                $gatewayIp = $gateway.NextHop
            }
            Write-Log "[NETWORK-INFO] Gateway: $gatewayIp" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter gateway: $($_.Exception.Message)" "WARN"
        }

        # 7. Public IP
        $publicIp = $null
        try {
            $response = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.ip) {
                $publicIp = $response.ip
            }
            Write-Log "[NETWORK-INFO] IP Publico: $publicIp" "DEBUG"
        } catch {
            Write-Log "[NETWORK-INFO] Erro ao obter IP publico: $($_.Exception.Message)" "WARN"
        }

        # 8. DNS Test
        $dnsTestSuccess = $null
        try {
            $dnsTest = Resolve-DnsName -Name "google.com" -Type A -DnsOnly -ErrorAction SilentlyContinue
            $dnsTestSuccess = ($null -ne $dnsTest)
            Write-Log "[NETWORK-INFO] DNS Test: $dnsTestSuccess" "DEBUG"
        } catch {
            $dnsTestSuccess = $false
        }

        # 9. HTTPS Test
        $httpsTestSuccess = $null
        try {
            $httpsTest = Test-NetConnection -ComputerName "google.com" -Port 443 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
            $httpsTestSuccess = $httpsTest.TcpTestSucceeded
            Write-Log "[NETWORK-INFO] HTTPS Test: $httpsTestSuccess" "DEBUG"
        } catch {
            $httpsTestSuccess = $false
        }

        # Monta payload
        $payload = @{
            firewall_domain = $firewallDomain
            firewall_private = $firewallPrivate
            firewall_public = $firewallPublic
            open_ports = @($openPorts)
            active_connections = @($activeConnections)
            network_adapters = @($networkAdapters)
            dns_servers = @($dnsServers)
            gateway_ip = $gatewayIp
            public_ip = $publicIp
            dns_test_success = $dnsTestSuccess
            https_test_success = $httpsTestSuccess
        }

        # Envia para backend
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-network-info" `
            -Method "POST" `
            -Body $payload `
            -TimeoutSec 30

        if (-not $result.Success) {
            throw "Falha ao enviar info de rede (HTTP $($result.StatusCode))"
        }

        Write-Log "[NETWORK-INFO] Informacoes de rede enviadas com sucesso" "SUCCESS"

        return @{
            success = $true
            output  = @{
                message = "Informacoes de rede coletadas e enviadas"
                firewall = @{
                    domain = $firewallDomain
                    private = $firewallPrivate
                    public = $firewallPublic
                }
                open_ports_count = $openPorts.Count
                connections_count = $activeConnections.Count
                adapters_count = $networkAdapters.Count
                dns_servers = $dnsServers
                gateway = $gatewayIp
                public_ip = $publicIp
                dns_test = $dnsTestSuccess
                https_test = $httpsTestSuccess
            }
        }
    }
    catch {
        $errorMsg = "Erro em Invoke-CollectNetworkInfoJob: $($_.Exception.Message)"
        Write-Log "[ERROR] $errorMsg" "ERROR"
        return @{
            success = $false
            error   = $errorMsg
        }
    }
}

# ============================================
#  POST INSTALLATION
# ============================================
function Send-PostInstallationEvent {
    param(
        [bool]$Success = $true,
        [string]$ErrorMessage = "",
        [int]$InstallationTimeSeconds = 0
    )

    $sys = Get-SystemInfo

    # PowerShell 5.1 compatibility: calculate event_type outside hashtable
    $eventType = if ($Success) { 
        "post_installation" 
    } else { 
        "post_installation_unverified" 
    }

    $body = @{
        agent_name                = $Global:AgentName
        event_type                = $eventType
        platform                  = "windows"
        installation_method       = "one_click"
        success                   = $Success
        installation_time_seconds = $InstallationTimeSeconds
        error_message             = $ErrorMessage
        agent_version             = $Global:AgentVersion
        network_connectivity      = $true
        metadata                  = $sys
    }

    Write-Log "Enviando post_installation..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/track-installation-event" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 20

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] post_installation registrado com sucesso" "SUCCESS"
        } else {
            Write-Log "[WARN] Falha ao registrar post_installation (Status=$($result.StatusCode))" "WARN"
        }
    } catch {
        Write-Log "[WARN] Erro ao enviar post_installation: $($_.Exception.Message)" "WARN"
    }
}

# ============================================
#  HEARTBEAT
# ============================================
function Send-Heartbeat {
    $sys = Get-SystemInfo

    $body = @{
        agent_name    = $Global:AgentName
        platform      = "windows"
        os_name       = $sys.os_name
        os_version    = $sys.os_version
        hostname      = $sys.hostname
        agent_version = $Global:AgentVersion
    }

    Write-Log "Enviando heartbeat..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/heartbeat" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 15

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Heartbeat OK (200)" "SUCCESS"
        } else {
            Write-Log "[ERROR] Heartbeat falhou (Status=$($result.StatusCode))" "ERROR"
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar heartbeat: $($_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  SEND SYSTEM METRICS
# ============================================
function Send-SystemMetrics {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Metrics
    )
    
    Write-Log "[METRICS] Enviando metricas para backend..." "DEBUG"
    
    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-system-metrics" `
            -Method "POST" `
            -Body $Metrics `
            -TimeoutSec 15
        
        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Metricas enviadas com sucesso" "SUCCESS"
            return $true
        } else {
            Write-Log "[WARN] Falha ao enviar metricas (HTTP $($result.StatusCode))" "WARN"
            return $false
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar metricas: $($_.Exception.Message)" "ERROR"
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
        
        [Parameter(Mandatory = $false)]
        [object]$Output = @{},
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorMessage = "",
        
        [Parameter(Mandatory = $false)]
        [int]$ExecutionTimeSeconds = 0,
        
        [Parameter(Mandatory = $false)]
        [string]$StartedAt = ""
    )

    $body = @{
        job_id                 = $JobId
        agent_name             = $Global:AgentName
        status                 = $Status
        output                 = $Output
        error_message          = $ErrorMessage
        execution_time_seconds = $ExecutionTimeSeconds
        started_at             = $StartedAt
        finished_at            = (Get-Date).ToUniversalTime().ToString("o")
    }

    Write-Log "Enviando resultado do job $JobId (status=$Status, started_at=$StartedAt)..." "INFO"
    
    # Log detalhado do payload para debug
    $bodyJson = $body | ConvertTo-Json -Depth 10 -Compress
    Write-Log "Payload: $bodyJson" "DEBUG"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Resultado do job $JobId enviado com sucesso" "SUCCESS"
            return $true
        } else {
            Write-Log "[ERROR] Falha ao enviar resultado (Status=$($result.StatusCode))" "ERROR"
            Write-Log "Response body: $($result.Body)" "ERROR"
            return $false
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar resultado do job ${JobId}: $($_.Exception.Message)" "ERROR"
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
        return $false
    }
}

# ============================================
#  EXECUCAO DE JOB
# ============================================
function Execute-Job {
    param(
        [Parameter(Mandatory = $true)]
        $Job
    )

    $jobId   = $Job.id
    $jobType = $Job.type
    $payload = $Job.payload

    $startTime = Get-Date

    Write-Log "[JOB] Executando job $jobId (type=$jobType)" "INFO"

    try {
        $output = @{}

        switch ($jobType) {
            "integration_test" {
                $sys = Get-SystemInfo
                
                $output = @{
                    message   = "Integration test executed successfully"
                    timestamp = (Get-Date).ToUniversalTime().ToString("o")
                    agent     = $Global:AgentName
                    version   = $Global:AgentVersion
                    system    = $sys
                }
            }
            "collect_info" {
                $sys = Get-SystemInfo
                $output = $sys
            }
            "report" {
                Write-Log "[REPORT] Job type 'report' recebido" "INFO"
                
                $reportResult = Invoke-ReportJob -Job $Job
                
                if ($reportResult.success) {
                    $output = $reportResult.output | ConvertFrom-Json
                    Write-Log "[SUCCESS] Report job concluido com sucesso" "SUCCESS"
                } else {
                    throw $reportResult.output
                }
            }
            "scan" {
                try {
                    Write-Log "[SCAN] Job type 'scan' recebido" "INFO"

                    # Payload esperado: { "filePath": "C:\\path\\file.exe", "tenantId": "uuid" }
                    $filePath = $payload.filePath
                    $tenantId = $payload.tenantId

                    if (-not $filePath) {
                        throw "Payload invalido: 'filePath' nao informado"
                    }

                    # Expandir variaveis de ambiente estilo Windows (%VAR%)
                    # CRITICAL FIX v3.10.18: %USERPROFILE% expande para todos os usuarios reais, nao SYSTEM
                    if ($filePath -match '%USERPROFILE%') {
                        Write-Log "[SCAN] Detectado %USERPROFILE%, expandindo para usuarios reais..." "DEBUG"
                        
                        # Listar perfis de usuarios reais (excluir SYSTEM, Public, Default)
                        $userProfiles = Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | 
                            Where-Object { $_.Name -notin @("Public", "Default", "Default User", "All Users") }
                        
                        $expandedPath = $null
                        foreach ($profile in $userProfiles) {
                            $testPath = $filePath -replace '%USERPROFILE%', $profile.FullName
                            if (Test-Path $testPath) {
                                $expandedPath = $testPath
                                Write-Log "[SCAN] Encontrado path valido em: $expandedPath" "DEBUG"
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
                        Write-Log "[SCAN] Caminho expandido: $filePath" "DEBUG"
                    }

                    if (-not (Test-Path $filePath)) {
                        throw "Caminho nao encontrado: $filePath"
                    }

                    # Verificar se e diretorio - com fallback para pastas protegidas (ex: C:\ProgramData)
                    $isDirectory = $false
                    try {
                        $item = Get-Item $filePath -Force -ErrorAction Stop
                        $isDirectory = $item.PSIsContainer
                    } catch {
                        # Fallback: Get-Item pode falhar em pastas com atributos especiais
                        # Se Test-Path passou, assume que e diretorio
                        Write-Log "[SCAN] Get-Item falhou para $filePath, usando fallback Test-Path" "DEBUG"
                        if (Test-Path $filePath -PathType Container) {
                            $isDirectory = $true
                        } elseif (Test-Path $filePath -PathType Leaf) {
                            $isDirectory = $false
                        } else {
                            throw "Caminho inacessivel: $filePath - $($_.Exception.Message)"
                        }
                    }

                    if ($isDirectory) {
                        Write-Log "[SCAN] Caminho e diretorio, listando arquivos executaveis..." "INFO"
                        
                        # Escanear arquivos executaveis no diretorio (nao recursivo)
                        # CRITICAL FIX v3.10.18: Usar -Force para acessar itens ocultos/sistema
                        $files = Get-ChildItem -Path $filePath -File -Force -ErrorAction SilentlyContinue | 
                                 Where-Object { $_.Extension -match '\.(exe|dll|bat|ps1|vbs|js|msi|scr|com)$' } |
                                 Select-Object -First 10  # Limitar a 10 arquivos por diretorio
                        
                        if ($null -eq $files -or $files.Count -eq 0) {
                            # Diretorio sem executaveis - retornar sucesso informativo
                            $output = @{
                                filePath = $filePath
                                isDirectory = $true
                                filesScanned = 0
                                message = "Nenhum arquivo executavel encontrado no diretorio"
                                isMalicious = $false
                            }
                            Write-Log "[SCAN] Diretorio sem executaveis: $filePath" "INFO"
                            return $output
                        } else {
                            # Processar primeiro arquivo executavel
                            $filePath = $files[0].FullName
                            Write-Log "[SCAN] Escaneando primeiro executavel: $filePath" "INFO"
                        }
                    }

                    # Calcular SHA256 do arquivo
                    $fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
                    Write-Log "[SCAN] Escaneando: $filePath (hash: $fileHash)" "INFO"

                    # Monta body para backend (NAO converte pra JSON aqui)
                    # CRITICAL: Edge Function espera camelCase (filePath, fileHash)
                    $scanBody = @{
                        tenant_id  = $tenantId
                        agent_name = $Global:AgentName
                        filePath   = $filePath
                        fileHash   = $fileHash
                    }

                    # Chama backend scan-virus
                    $scanResult = Invoke-SecureRequest `
                        -Path "/functions/v1/scan-virus" `
                        -Method POST `
                        -Body $scanBody `
                        -TimeoutSec 60

                    if (-not $scanResult.Success) {
                        throw "Falha ao chamar scan-virus: HTTP $($scanResult.StatusCode)"
                    }

                    $scanData = $scanResult.Body | ConvertFrom-Json

                    # Monta output base
                    $output = @{
                        filePath    = $filePath
                        fileHash    = $fileHash
                        isMalicious = $scanData.isMalicious
                        positives   = $scanData.positives
                        totalScans  = $scanData.totalScans
                        permalink   = $scanData.permalink
                        scannerUsed = $scanData.scannerUsed
                        fromCache   = $scanData.fromCache
                        quarantined = $false
                    }

                    # QUARENTENA FISICA (necessaria pois backend nao tem acesso ao filesystem)
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
                    } else {
                        Write-Log "[SUCCESS] Arquivo limpo" "SUCCESS"
                    }
                }
                catch {
                    throw $_.Exception.Message
                }
            }
            "update_agent" {
                try {
                    Write-Log "[INFO] Job 'update_agent' recebido" "INFO"

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
                        $output = $data
                        break
                    }

                    $newVersion   = $data.version
                    $scriptText   = $data.script_content
                    $expectedHash = $data.sha256

                    Write-Log "[UPDATE] Atualizando agente para versao $newVersion" "INFO"

                    # CRITICAL FIX: Usa caminho com $AgentName dinamico (instalador salva como cybershield-agent-$AgentName.ps1)
                    $currentScript = "C:\CyberShield\cybershield-agent-$($Global:AgentName).ps1"
                    $backupScript  = $currentScript -replace '\.ps1$', "-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss').ps1"
                    $tempScript    = Join-Path $env:TEMP "cybershield-agent-update-$newVersion.ps1"

                    # Salvar script novo (UTF8 sem BOM para compatibilidade SHA256)
                    [System.IO.File]::WriteAllText($tempScript, $scriptText, [System.Text.UTF8Encoding]::new($false))

                    # Validar SHA256
                    $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
                    if ($actualHash -ne $expectedHash.ToLower()) {
                        Remove-Item $tempScript -Force
                        throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
                    }

                    Write-Log "[SUCCESS] SHA256 validado: $actualHash" "SUCCESS"

                    # Backup do script atual
                    Copy-Item -Path $currentScript -Destination $backupScript -Force
                    Write-Log "[BACKUP] Backup criado em: $backupScript" "INFO"

                    # Trocar script
                    Copy-Item -Path $tempScript -Destination $currentScript -Force
                    Remove-Item $tempScript -Force

                    Write-Log "[SUCCESS] Script atualizado para $newVersion" "SUCCESS"

                    # Reiniciar task
                    Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                    Start-ScheduledTask -TaskName "CyberShield Agent"

                    $output = @{
                        message     = "Agent updated successfully"
                        newVersion  = $newVersion
                        sha256      = $actualHash
                        restartedAt = (Get-Date).ToUniversalTime().ToString("o")
                    }
                    break
                }
                catch {
                    throw $_.Exception.Message
                }
            }
            "software_inventory_collect" {
                $result = Invoke-SoftwareInventoryJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            "light_vuln_scan" {
                $result = Invoke-LightVulnScanJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            "collect_antivirus_status" {
                $result = Invoke-CollectAntivirusStatusJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            "collect_web_activity" {
                $result = Invoke-WebActivityJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            "fix_firewall" {
                $result = Invoke-FixFirewallJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            "restart_service" {
                $result = Invoke-RestartServiceJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            "collect_network_info" {
                $result = Invoke-CollectNetworkInfoJob -Job $job
                if ($result.success) {
                    $output = $result.output
                } else {
                    throw $result.error
                }
            }
            
            default {
                throw "Tipo de job nao suportado: $jobType"
            }
        }

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        Submit-JobResult `
            -JobId $jobId `
            -Status "completed" `
            -Output $output `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO
    }
    catch {
        $err = "Erro ao executar job $jobId`: $($_.Exception.Message)"
        Write-Log $err "ERROR"

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        Submit-JobResult `
            -JobId $jobId `
            -Status "failed" `
            -ErrorMessage $err `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO
    }
}

# ============================================
#  POLL DE JOBS
# ============================================
function Poll-Jobs {
    $body = @{
        agent_name    = $Global:AgentName
        agent_version = $Global:AgentVersion
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
            Write-Log "[WARN] Resposta de poll-jobs vazia" "WARN"
            return
        }

        $jobs = $result.Body | ConvertFrom-Json

        if ($null -eq $jobs -or $jobs.Count -eq 0) {
            Write-Log "[POLL] Nenhum job disponivel" "INFO"
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
#  LOOP PRINCIPAL
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] Iniciando CyberShield Agent - Windows v$Global:AgentVersion" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

try {
    $bootstrapStart = Get-Date

    # 1) Enviar evento de post_installation
    Send-PostInstallationEvent -Success $true -InstallationTimeSeconds 0

    # 2) Primeiro heartbeat
    Send-Heartbeat

    $bootstrapElapsed = [int]((Get-Date) - $bootstrapStart).TotalSeconds
    Write-Log "[SUCCESS] Bootstrap concluido em ${bootstrapElapsed}s" "SUCCESS"

    Write-Log "[INFO] Entrando no loop principal (intervalo=$($Global:PollIntervalSeconds)s)" "INFO"

    $lastHeartbeat = Get-Date
    $lastPoll      = Get-Date
    $lastMetrics   = Get-Date  # FASE 2: Controle de metricas
    $lastUpdateCheck = Get-Date  # FASE 2 AUTO-UPDATE: Controle de verificacao de updates

    while ($true) {
        $now = Get-Date

        try {
            # Heartbeat a cada intervalo
            if ((($now - $lastHeartbeat).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                Send-Heartbeat
                $lastHeartbeat = Get-Date
            }

            # FASE 2 AUTO-UPDATE: Verificar updates a cada 24 horas
            try {
                if ((($now - $lastUpdateCheck).TotalHours) -ge 24) {
                    Write-Log "[UPDATE] Verificando atualizacoes disponiveis..." "INFO"
                    
                    $updateResult = Invoke-SecureRequest `
                        -Path "/functions/v1/check-agent-updates" `
                        -Method "GET" `
                        -TimeoutSec 30
                    
                    if ($updateResult.Success -and $updateResult.StatusCode -eq 200) {
                        try {
                            $updateInfo = $updateResult.Body | ConvertFrom-Json
                            
                            if ($updateInfo.has_update -and $updateInfo.version -ne $Global:AgentVersion) {
                                Write-Log "[UPDATE] Nova versao disponivel: $($updateInfo.version) (atual: $Global:AgentVersion)" "INFO"
                                Write-Log "[UPDATE] Aplicando atualizacao automaticamente..." "INFO"
                                
                                # Auto-trigger update_agent job
                                $updateJob = @{ 
                                    id = "auto-update-$(Get-Date -Format 'yyyyMMddHHmmss')"
                                    type = "update_agent"
                                }
                                
                                try {
                                    Execute-Job -Job $updateJob
                                    Write-Log "[SUCCESS] Script do agente atualizado em disco." "SUCCESS"
                                    Write-Log "[INFO] A nova versao sera carregada no proximo boot ou restart do agente." "INFO"
                                    Write-Log "[INFO] Continuando execucao com a versao atual ate o proximo restart." "INFO"
                                    # NAO fazer exit - agente continua rodando com versao atual
                                    # Nova versao sera usada quando sistema reiniciar ou task for recriada
                                } catch {
                                    Write-Log "[ERROR] Falha no auto-update: $($_.Exception.Message). Continuando com versao atual." "ERROR"
                                    # NAO fazer exit - agente continua funcionando
                                }
                            } else {
                                Write-Log "[UPDATE] Agente ja esta atualizado (versao $Global:AgentVersion)" "INFO"
                            }
                        } catch {
                            Write-Log "[WARN] Falha ao processar resposta de update: $($_.Exception.Message)" "WARN"
                        }
                    } else {
                        Write-Log "[WARN] Verificacao de update retornou status $($updateResult.StatusCode)" "WARN"
                    }
                    
                    $lastUpdateCheck = Get-Date
                }
            } catch {
                Write-Log "[WARN] Erro ao verificar updates (nao critico): $($_.Exception.Message)" "WARN"
                $lastUpdateCheck = Get-Date  # Reset para evitar loop infinito
            }

            # FASE 2: Enviar metricas a cada 5 minutos
            try {
                if ((($now - $lastMetrics).TotalSeconds) -ge 300) {
                    Write-Log "[METRICS] Coletando metricas de sistema..." "INFO"
                    $metricsJob = @{ id = "auto-metrics"; type = "report" }
                    $metricsResult = Invoke-ReportJob -Job $metricsJob
                    
                    if ($metricsResult.success) {
                        # Parsear JSON e enviar para backend
                        try {
                            $metricsData = $metricsResult.output | ConvertFrom-Json
                            
                            $payload = @{
                                cpu_usage_percent = $metricsData.cpu_percent
                                memory_usage_percent = $metricsData.memory_percent
                                disk_usage_percent = $metricsData.disk_percent
                                hostname = $metricsData.hostname
                            }
                            
                            $sent = Send-SystemMetrics -Metrics $payload
                            if ($sent) {
                                Write-Log "[SUCCESS] Metricas enviadas: CPU=$($metricsData.cpu_percent)%, RAM=$($metricsData.memory_percent)%, Disco=$($metricsData.disk_percent)%" "SUCCESS"
                            }
                        } catch {
                            Write-Log "[WARN] Falha ao parsear metricas: $($_.Exception.Message)" "WARN"
                        }
                    } else {
                        Write-Log "[WARN] Falha ao coletar metricas (nao critico): $($metricsResult.output)" "WARN"
                    }
                    
                    $lastMetrics = Get-Date
                }
            } catch {
                # NUNCA derrubar o loop por causa de metrics
                Write-Log "[WARN] Erro ao processar metrics: $($_.Exception.Message)" "WARN"
            }

            # Poll de jobs a cada intervalo
            if ((($now - $lastPoll).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                Poll-Jobs
                $lastPoll = Get-Date
            }
        } catch {
            Write-Log "[ERROR] Erro no loop principal: $($_.Exception.Message)" "ERROR"
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Log "[FATAL] Erro fatal no agente: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    exit 1
}
