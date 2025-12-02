/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-windows-v3.ps1
 * Versao: v3.10.16-MULTIUSER-WEB-ACTIVITY
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = `<#
    CyberShield Agent - Windows v3.10.16-MULTIUSER-WEB-ACTIVITY
    
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
    powershell.exe -ExecutionPolicy Bypass -File .\\\\cybershield-agent-windows-v3.ps1 \\\`
        -ServerUrl "https://seu-projeto.supabase.co" \\\`
        -AgentToken "AGENT_TOKEN_AQUI" \\\`
        -HmacSecret "64_HEX_CHARS_AQUI" \\\`
        -AgentName "meu-servidor-01"
#>

param(
    [Parameter(Mandatory = \\\$true)]
    [string]\\\$ServerUrl,

    [Parameter(Mandatory = \\\$true)]
    [string]\\\$AgentToken,

    [Parameter(Mandatory = \\\$true)]
    [string]\\\$HmacSecret,

    [Parameter(Mandatory = \\\$false)]
    [string]\\\$AgentName = \\\$env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = \\\$false)]
    [string]\\\$AgentVersion = "3.10.16-MULTIUSER-WEB-ACTIVITY"
)

\\\$ErrorActionPreference = "Stop"

# ============================================
#  TRAP GLOBAL PARA ERROS NAO TRATADOS
# ============================================
trap {
    \\\$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    \\\$msg = "FATAL ERROR: \\\$(\\\$_.Exception.Message) at line \\\$(\\\$_.InvocationInfo.ScriptLineNumber)"
    \\\$stack = \\\$_.ScriptStackTrace

    \\\$logDir = "C:\\\\CyberShield\\\\logs"
    \\\$logPath = Join-Path \\\$logDir "cybershield-agent-v3.log"

    if (Test-Path \\\$logDir) {
        try {
            "\\\$ts [FATAL] \\\$msg" | Out-File -FilePath \\\$logPath -Append -Encoding UTF8
            "\\\$ts [FATAL] Stack: \\\$stack" | Out-File -FilePath \\\$logPath -Append -Encoding UTF8
        } catch {}
    }

    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -EntryType Error -Message "\\\$msg\\\`n\\\$stack" -ErrorAction SilentlyContinue

    throw
}

# ============================================
#  VARIAVEIS GLOBAIS
# ============================================
\\\$Global:ServerUrl    = \\\$ServerUrl.TrimEnd('/')
\\\$Global:AgentToken   = \\\$AgentToken
\\\$Global:HmacSecret   = \\\$HmacSecret
\\\$Global:AgentName    = \\\$AgentName
\\\$Global:AgentVersion = \\\$AgentVersion

\\\$logDir = Join-Path -Path \\\$PSScriptRoot -ChildPath "logs"
if (-not (Test-Path \\\$logDir)) {
    New-Item -ItemType Directory -Path \\\$logDir -Force | Out-Null
}
\\\$Global:LogFilePath = Join-Path -Path \\\$logDir -ChildPath "cybershield-agent-v3.log"

\\\$Global:PollIntervalSeconds = 30

# ============================================
#  CONFIGURACAO DE REDE (TLS 1.2 + Proxy)
# ============================================
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    \\\$proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    [System.Net.WebRequest]::DefaultWebProxy = \\\$proxy
    [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
} catch {}

# ============================================
#  LOGGING
# ============================================
function Write-Log {
    param(
        [Parameter(Mandatory = \\\$true)]
        [string]\\\$Message,
        
        [Parameter(Mandatory = \\\$false)]
        [ValidateSet("DEBUG","INFO","WARN","ERROR","SUCCESS")]
        [string]\\\$Level = "INFO"
    )

    \\\$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    \\\$line = "[{0}] [{1}] {2}" -f \\\$timestamp, \\\$Level, \\\$Message

    Write-Host \\\$line
    
    try {
        Add-Content -Path \\\$Global:LogFilePath -Value \\\$line
    } catch {}
}

# ============================================
#  HMAC (HEX)
# ============================================
function Convert-HexToBytes {
    param([Parameter(Mandatory = \\\$true)][string]\\\$HexString)

    if (\\\$HexString -notmatch '^[0-9a-fA-F]{64}\\\$') {
        Write-Log "HMAC_SECRET invalido. Length: \\\$(\\\$HexString.Length)" "ERROR"
        throw "Invalid HMAC_SECRET format"
    }

    try {
        \\\$bytes = New-Object byte[] 32
        for (\\\$i = 0; \\\$i -lt 64; \\\$i += 2) {
            \\\$bytes[\\\$i / 2] = [Convert]::ToByte(\\\$HexString.Substring(\\\$i, 2), 16)
        }
        return \\\$bytes
    } catch {
        throw "HMAC_SECRET conversion failed: \\\$(\\\$_.Exception.Message)"
    }
}

function Get-HmacSignature {
    param(
        [Parameter(Mandatory = \\\$true)][string]\\\$Message,
        [Parameter(Mandatory = \\\$true)][string]\\\$SecretHex
    )

    \\\$keyBytes = Convert-HexToBytes \\\$SecretHex
    \\\$hmac = New-Object System.Security.Cryptography.HMACSHA256
    \\\$hmac.Key = \\\$keyBytes
    \\\$messageBytes = [Text.Encoding]::UTF8.GetBytes(\\\$Message)
    \\\$signatureBytes = \\\$hmac.ComputeHash(\\\$messageBytes)
    return ([System.BitConverter]::ToString(\\\$signatureBytes) -replace '-', '').ToLower()
}

# ============================================
#  REQUISICAO SEGURA COM HMAC
# ============================================
function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory = \\\$true)][string]\\\$Path,
        [Parameter()][ValidateSet("GET","POST","PUT","DELETE")][string]\\\$Method = "GET",
        [Parameter()][object]\\\$Body = \\\$null,
        [Parameter()][int]\\\$TimeoutSec = 30,
        [Parameter()][int]\\\$MaxRetries = 3
    )

    \\\$uri = "\\\$(\\\$Global:ServerUrl)\\\$Path"
    \\\$retryCount = 0
    \\\$retryDelay = 2

    while (\\\$true) {
        try {
            \\\$timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            \\\$nonce = [guid]::NewGuid().ToString()

            if (\\\$Body -ne \\\$null) {
                if (\\\$Body -is [string]) { \\\$bodyJson = \\\$Body }
                elseif (\\\$Body -is [hashtable] -or \\\$Body.GetType().Name -like 'PSCustomObject') { \\\$bodyJson = \\\$Body | ConvertTo-Json -Compress -Depth 10 }
                else { \\\$bodyJson = "" }
            } else { \\\$bodyJson = "" }

            \\\$payload = '{0}:{1}:{2}' -f \\\$timestamp, \\\$nonce, \\\$bodyJson
            \\\$signature = Get-HmacSignature -Message \\\$payload -SecretHex \\\$Global:HmacSecret

            \\\$headers = @{
                "X-Agent-Token" = \\\$Global:AgentToken
                "X-HMAC-Signature" = \\\$signature
                "X-Timestamp" = \\\$timestamp
                "X-Nonce" = \\\$nonce
                "Content-Type" = "application/json"
            }

            \\\$params = @{ Uri = \\\$uri; Method = \\\$Method; Headers = \\\$headers; TimeoutSec = \\\$TimeoutSec; ErrorAction = "Stop" }
            if (\\\$bodyJson -ne "") {
                \\\$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes(\\\$bodyJson)
                \\\$params.Body = \\\$bodyBytes
            }

            Write-Log "[NETWORK] \\\$Method \\\$uri" "INFO"
            \\\$response = Invoke-WebRequest @params -UseBasicParsing
            \\\$status = [int]\\\$response.StatusCode
            Write-Log "[NETWORK] Response: \\\$status from \\\$uri" "INFO"

            return [pscustomobject]@{ Success = \\\$true; StatusCode = \\\$status; Body = \\\$response.Content }
        }
        catch {
            \\\$retryCount++
            \\\$statusCode = \\\$null
            if (\\\$_.Exception.Response -and \\\$_.Exception.Response.StatusCode) { \\\$statusCode = \\\$_.Exception.Response.StatusCode.value__ }
            Write-Log "Erro \\\$Method \\\$uri (tentativa \\\$retryCount/\\\$MaxRetries): \\\$(\\\$_.Exception.Message)" "ERROR"
            if (\\\$statusCode -eq 401) { throw }
            if (\\\$retryCount -ge \\\$MaxRetries) { throw }
            Start-Sleep -Seconds \\\$retryDelay
            \\\$retryDelay *= 2
        }
    }
}

function Get-SystemInfo {
    try {
        \\\$os = Get-CimInstance Win32_OperatingSystem
        \\\$cs = Get-CimInstance Win32_ComputerSystem
        return @{ os_type = "Windows"; os_name = \\\$os.Caption; os_version = \\\$os.Version; build_number = \\\$os.BuildNumber; hostname = \\\$env:COMPUTERNAME; domain = \\\$cs.Domain; total_ram_gb = [Math]::Round(\\\$cs.TotalPhysicalMemory / 1GB, 2); agent_name = \\\$Global:AgentName; agent_version = \\\$Global:AgentVersion }
    } catch {
        return @{ os_type = "Windows"; hostname = \\\$env:COMPUTERNAME; agent_name = \\\$Global:AgentName; agent_version = \\\$Global:AgentVersion }
    }
}

function Invoke-ReportJob { param(\\\$Job)
    \\\$report = @{ timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); hostname = \\\$env:COMPUTERNAME }
    try {
        try { \\\$cpuSample = Get-Counter '\\\\Processor(_Total)\\\\% Processor Time' -ErrorAction Stop; \\\$cpuUsage = \\\$cpuSample.CounterSamples.CookedValue }
        catch { \\\$cpuUsage = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; if (\\\$null -eq \\\$cpuUsage) { \\\$cpuUsage = 0 } }
        \\\$os = Get-WmiObject Win32_OperatingSystem
        \\\$memUsage = [math]::Round(((\\\$os.TotalVisibleMemorySize - \\\$os.FreePhysicalMemory) / \\\$os.TotalVisibleMemorySize) * 100, 2)
        try { \\\$cDrive = Get-PSDrive -Name C -ErrorAction Stop; \\\$diskPercent = 0; if ((\\\$cDrive.Used + \\\$cDrive.Free) -gt 0) { \\\$diskPercent = [math]::Round((\\\$cDrive.Used / (\\\$cDrive.Used + \\\$cDrive.Free)) * 100, 2) } }
        catch { \\\$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"; if (\\\$disk -and \\\$disk.Size -gt 0) { \\\$diskPercent = [math]::Round(((\\\$disk.Size - \\\$disk.FreeSpace) / \\\$disk.Size) * 100, 2) } else { \\\$diskPercent = 0 } }
        \\\$report.cpu_percent = [math]::Round(\\\$cpuUsage, 2); \\\$report.memory_percent = \\\$memUsage; \\\$report.disk_percent = \\\$diskPercent
        Write-Log "[REPORT] CPU=\\\$(\\\$report.cpu_percent)%, MEM=\\\$(\\\$report.memory_percent)%, DISK=\\\$(\\\$report.disk_percent)%" "INFO"
        return @{ success = \\\$true; output = (\\\$report | ConvertTo-Json -Compress) }
    } catch { return @{ success = \\\$false; output = "Falha: \\\$(\\\$_.Exception.Message)" } }
}

function Invoke-SoftwareInventoryJob { param(\\\$Job)
    Write-Log "[SOFTWARE-INVENTORY] Iniciando..." "INFO"
    \\\$items = @()
    try {
        \\\$keys = @("HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\*","HKLM:\\\\SOFTWARE\\\\WOW6432Node\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\*")
        foreach (\\\$keyPath in \\\$keys) {
            \\\$apps = Get-ItemProperty -Path \\\$keyPath -ErrorAction SilentlyContinue
            foreach (\\\$app in \\\$apps) { if (-not [string]::IsNullOrWhiteSpace(\\\$app.DisplayName)) { \\\$items += @{ name = \\\$app.DisplayName; version = \\\$app.DisplayVersion; vendor = \\\$app.Publisher; install_location = \\\$app.InstallLocation } } }
        }
        Write-Log "[SOFTWARE-INVENTORY] Coletados \\\$(\\\$items.Count) itens" "SUCCESS"
        \\\$body = @{ agent_id = \\\$Job.agent_id; items = \\\$items }
        \\\$result = Invoke-SecureRequest -Path "/functions/v1/submit-software-inventory" -Method "POST" -Body \\\$body -TimeoutSec 30
        if (-not \\\$result.Success) { throw "HTTP \\\$(\\\$result.StatusCode)" }
        return @{ success = \\\$true; output = "Inventario enviado. Itens: \\\$(\\\$items.Count)" }
    } catch { return @{ success = \\\$false; error = "Erro: \\\$(\\\$_.Exception.Message)" } }
}

function Invoke-LightVulnScanJob { param(\\\$Job)
    Write-Log "[VULN-SCAN] Iniciando..." "INFO"
    \\\$findings = @()
    try {
        \\\$firewallProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
        if (\\\$firewallProfiles) { foreach (\\\$p in \\\$firewallProfiles) { if (-not \\\$p.Enabled) { \\\$findings += @{ severity = "high"; check_key = "firewall_disabled_\\\$(\\\$p.Name)"; title = "Firewall desativado"; description = "Firewall deve permanecer habilitado."; remediation = "Ativar firewall." } } } }
        \\\$rdpKey = "HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Control\\\\Terminal Server"
        \\\$fDenyTSConn = Get-ItemProperty -Path \\\$rdpKey -Name "fDenyTSConnections" -ErrorAction SilentlyContinue
        if (\\\$fDenyTSConn -and \\\$fDenyTSConn.fDenyTSConnections -eq 0) { \\\$findings += @{ severity = "medium"; check_key = "rdp_enabled"; title = "RDP habilitado"; description = "RDP aumenta superficie de ataque."; remediation = "Desabilitar RDP." } }
        try { \\\$smbv1 = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue; if (\\\$smbv1 -and \\\$smbv1.State -eq "Enabled") { \\\$findings += @{ severity = "high"; check_key = "smbv1_enabled"; title = "SMBv1 habilitado"; description = "SMBv1 e vulneravel."; remediation = "Desabilitar SMBv1." } } } catch {}
        Write-Log "[VULN-SCAN] Encontrados \\\$(\\\$findings.Count) findings" "INFO"
        if (\\\$findings.Count -gt 0) { \\\$body = @{ agent_id = \\\$Job.agent_id; findings = \\\$findings }; \\\$result = Invoke-SecureRequest -Path "/functions/v1/submit-vuln-findings" -Method "POST" -Body \\\$body -TimeoutSec 30 }
        return @{ success = \\\$true; output = "Vuln scan concluido. Findings: \\\$(\\\$findings.Count)" }
    } catch { return @{ success = \\\$false; error = "Erro: \\\$(\\\$_.Exception.Message)" } }
}

function Invoke-CollectAntivirusStatusJob { param(\\\$Job)
    Write-Log "[AV-STATUS] Coletando..." "INFO"
    try {
        \\\$statusList = @()
        try { \\\$avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName "AntiVirusProduct" -ErrorAction SilentlyContinue; foreach (\\\$av in \\\$avProducts) { \\\$statusList += @{ engine_name = \\\$av.displayName; engine_version = \\\$av.productState.ToString(); status = "active" } } } catch {}
        if (-not \\\$statusList.Count) { return @{ success = \\\$true; output = "Nenhum AV detectado" } }
        \\\$body = @{ agent_id = \\\$Job.agent_id; items = \\\$statusList }
        \\\$result = Invoke-SecureRequest -Path "/functions/v1/submit-antivirus-status" -Method "POST" -Body \\\$body -TimeoutSec 30
        return @{ success = \\\$true; output = "Status AV enviado. Produtos: \\\$(\\\$statusList.Count)" }
    } catch { return @{ success = \\\$false; error = "Erro: \\\$(\\\$_.Exception.Message)" } }
}

function Invoke-WebActivityJob { param(\\\$Job)
    Write-Log "[WEB-ACTIVITY] Iniciando coleta de todos os perfis..." "INFO"
    try {
        \\\$maxDomains = 500; \\\$nowUtc = [DateTime]::UtcNow; \\\$items = @()
        try { \\\$dnsEntries = Get-DnsClientCache -ErrorAction SilentlyContinue
            if (\\\$dnsEntries) { \\\$dnsEntries = \\\$dnsEntries | Where-Object { \\\$_.Entry -and \\\$_.Name } | Sort-Object -Property Name -Unique | Select-Object -First 100
                foreach (\\\$entry in \\\$dnsEntries) { \\\$domain = \\\$entry.Name; if (-not [string]::IsNullOrWhiteSpace(\\\$domain) -and \\\$domain -notlike "localhost*" -and \\\$domain -notlike "*.local") { \\\$items += @{ domain = \\\$domain; source = "dns_cache"; visited_at = \\\$nowUtc.ToString("o") } } } } } catch {}
        \\\$userProfiles = @(); try { \\\$userProfiles = Get-ChildItem -Path "C:\\\\Users" -Directory -ErrorAction SilentlyContinue | Where-Object { \\\$_.Name -notin @('Public', 'Default', 'Default User', 'All Users') } } catch {}
        foreach (\\\$userProfile in \\\$userProfiles) { \\\$userName = \\\$userProfile.Name; \\\$userPath = \\\$userProfile.FullName
            try { \\\$chromeHistoryPath = Join-Path \\\$userPath "AppData\\\\Local\\\\Google\\\\Chrome\\\\User Data\\\\Default\\\\History"
                if (Test-Path \\\$chromeHistoryPath) { \\\$tempPath = "\\\$env:TEMP\\\\chrome_temp_\\\$(Get-Random).db"; Copy-Item -Path \\\$chromeHistoryPath -Destination \\\$tempPath -Force -ErrorAction SilentlyContinue
                    if (Test-Path \\\$tempPath) { try { \\\$data = Get-Content \\\$tempPath -Encoding Byte -ReadCount 0 -ErrorAction SilentlyContinue
                        if (\\\$data) { \\\$dataString = [System.Text.Encoding]::UTF8.GetString(\\\$data); \\\$urlMatches = [regex]::Matches(\\\$dataString, 'https?://([^/\\\\s\\\\x00]+)')
                            \\\$domains = \\\$urlMatches | ForEach-Object { \\\$_.Groups[1].Value } | Where-Object { \\\$_ -notlike "localhost*" -and \\\$_ -notlike "*.local" -and \\\$_ -notlike "*google*" } | Select-Object -Unique -First 50
                            foreach (\\\$domain in \\\$domains) { \\\$items += @{ domain = \\\$domain; source = "chrome_history_\\\$userName"; visited_at = \\\$nowUtc.ToString("o") } } } } catch {}
                        Remove-Item \\\$tempPath -Force -ErrorAction SilentlyContinue } } } catch {}
            try { \\\$edgeHistoryPath = Join-Path \\\$userPath "AppData\\\\Local\\\\Microsoft\\\\Edge\\\\User Data\\\\Default\\\\History"
                if (Test-Path \\\$edgeHistoryPath) { \\\$tempPath = "\\\$env:TEMP\\\\edge_temp_\\\$(Get-Random).db"; Copy-Item -Path \\\$edgeHistoryPath -Destination \\\$tempPath -Force -ErrorAction SilentlyContinue
                    if (Test-Path \\\$tempPath) { try { \\\$data = Get-Content \\\$tempPath -Encoding Byte -ReadCount 0 -ErrorAction SilentlyContinue
                        if (\\\$data) { \\\$dataString = [System.Text.Encoding]::UTF8.GetString(\\\$data); \\\$urlMatches = [regex]::Matches(\\\$dataString, 'https?://([^/\\\\s\\\\x00]+)')
                            \\\$domains = \\\$urlMatches | ForEach-Object { \\\$_.Groups[1].Value } | Where-Object { \\\$_ -notlike "localhost*" -and \\\$_ -notlike "*.local" -and \\\$_ -notlike "*microsoft*" } | Select-Object -Unique -First 50
                            foreach (\\\$domain in \\\$domains) { \\\$items += @{ domain = \\\$domain; source = "edge_history_\\\$userName"; visited_at = \\\$nowUtc.ToString("o") } } } } catch {}
                        Remove-Item \\\$tempPath -Force -ErrorAction SilentlyContinue } } } catch {}
            try { \\\$firefoxPath = Join-Path \\\$userPath "AppData\\\\Roaming\\\\Mozilla\\\\Firefox\\\\Profiles"
                if (Test-Path \\\$firefoxPath) { \\\$profiles = Get-ChildItem -Path \\\$firefoxPath -Directory -ErrorAction SilentlyContinue
                    foreach (\\\$profile in \\\$profiles) { \\\$placesPath = Join-Path \\\$profile.FullName "places.sqlite"
                        if (Test-Path \\\$placesPath) { \\\$tempPath = "\\\$env:TEMP\\\\firefox_temp_\\\$(Get-Random).db"; Copy-Item -Path \\\$placesPath -Destination \\\$tempPath -Force -ErrorAction SilentlyContinue
                            if (Test-Path \\\$tempPath) { try { \\\$data = Get-Content \\\$tempPath -Encoding Byte -ReadCount 0 -ErrorAction SilentlyContinue
                                if (\\\$data) { \\\$dataString = [System.Text.Encoding]::UTF8.GetString(\\\$data); \\\$urlMatches = [regex]::Matches(\\\$dataString, 'https?://([^/\\\\s\\\\x00]+)')
                                    \\\$domains = \\\$urlMatches | ForEach-Object { \\\$_.Groups[1].Value } | Where-Object { \\\$_ -notlike "localhost*" -and \\\$_ -notlike "*.local" -and \\\$_ -notlike "*mozilla*" } | Select-Object -Unique -First 50
                                    foreach (\\\$domain in \\\$domains) { \\\$items += @{ domain = \\\$domain; source = "firefox_history_\\\$userName"; visited_at = \\\$nowUtc.ToString("o") } } } } catch {}
                                Remove-Item \\\$tempPath -Force -ErrorAction SilentlyContinue; break } } } } } catch {} }
        \\\$uniqueItems = \\\$items | Sort-Object -Property domain -Unique | Select-Object -First \\\$maxDomains
        if (-not \\\$uniqueItems.Count) { return @{ success = \\\$true; output = "Nenhum dominio encontrado" } }
        Write-Log "[WEB-ACTIVITY] Total dominios: \\\$(\\\$uniqueItems.Count)" "INFO"
        \\\$body = @{ agent_id = \\\$Job.agent_id; items = \\\$items }
        \\\$result = Invoke-SecureRequest -Path "/functions/v1/submit-web-activity" -Method "POST" -Body \\\$body -TimeoutSec 30
        return @{ success = \\\$true; output = "Atividade web enviada. Dominios: \\\$(\\\$items.Count)" }
    } catch { return @{ success = \\\$false; error = "Erro: \\\$(\\\$_.Exception.Message)" } }
}

function Invoke-FixFirewallJob { param(\\\$Job)
    Write-Log "[FIX-FIREWALL] Iniciando..." "INFO"
    try { \\\$profiles = Get-NetFirewallProfile -ErrorAction Stop; \\\$fixed = @()
        foreach (\\\$p in \\\$profiles) { if (-not \\\$p.Enabled) { Set-NetFirewallProfile -Name \\\$p.Name -Enabled True -ErrorAction Stop; \\\$fixed += \\\$p.Name } }
        if (\\\$fixed.Count -gt 0) { return @{ success = \\\$true; output = "Firewall ativado em: \\\$(\\\$fixed -join ', ')" } }
        else { return @{ success = \\\$true; output = "Firewall ja ativo em todos os perfis" } }
    } catch { return @{ success = \\\$false; error = "Erro: \\\$(\\\$_.Exception.Message)" } }
}

function Invoke-RestartServiceJob { param(\\\$Job)
    Write-Log "[RESTART-SERVICE] Iniciando..." "INFO"
    try { \\\$payload = \\\$null; if (\\\$null -ne \\\$Job.payload) { try { \\\$payload = \\\$Job.payload | ConvertFrom-Json } catch { throw "Payload invalido" } }
        if (-not \\\$payload -or -not \\\$payload.service_name) { throw "service_name nao especificado" }
        \\\$serviceName = \\\$payload.service_name; \\\$service = Get-Service -Name \\\$serviceName -ErrorAction SilentlyContinue
        if (-not \\\$service) { throw "Servico '\\\$serviceName' nao encontrado" }
        Restart-Service -Name \\\$serviceName -Force -ErrorAction Stop; Start-Sleep -Seconds 2
        \\\$serviceAfter = Get-Service -Name \\\$serviceName -ErrorAction Stop
        return @{ success = \\\$true; output = "Servico '\\\$serviceName' reiniciado. Status: \\\$(\\\$serviceAfter.Status)" }
    } catch { return @{ success = \\\$false; error = "Erro: \\\$(\\\$_.Exception.Message)" } }
}

function Send-PostInstallationEvent { param([bool]\\\$Success = \\\$true, [string]\\\$ErrorMessage = "", [int]\\\$InstallationTimeSeconds = 0)
    \\\$sys = Get-SystemInfo; \\\$eventType = if (\\\$Success) { "post_installation" } else { "post_installation_unverified" }
    \\\$body = @{ agent_name = \\\$Global:AgentName; event_type = \\\$eventType; platform = "windows"; installation_method = "one_click"; success = \\\$Success; installation_time_seconds = \\\$InstallationTimeSeconds; error_message = \\\$ErrorMessage; agent_version = \\\$Global:AgentVersion; network_connectivity = \\\$true; metadata = \\\$sys }
    Write-Log "Enviando post_installation..." "INFO"
    try { \\\$result = Invoke-SecureRequest -Path "/functions/v1/track-installation-event" -Method "POST" -Body \\\$body -TimeoutSec 20
        if (\\\$result.Success -and \\\$result.StatusCode -eq 200) { Write-Log "[SUCCESS] post_installation registrado" "SUCCESS" } } catch {}
}

function Send-Heartbeat {
    \\\$sys = Get-SystemInfo; \\\$body = @{ agent_name = \\\$Global:AgentName; platform = "windows"; os_name = \\\$sys.os_name; os_version = \\\$sys.os_version; hostname = \\\$sys.hostname; agent_version = \\\$Global:AgentVersion }
    Write-Log "Enviando heartbeat..." "INFO"
    try { \\\$result = Invoke-SecureRequest -Path "/functions/v1/heartbeat" -Method "POST" -Body \\\$body -TimeoutSec 15
        if (\\\$result.Success -and \\\$result.StatusCode -eq 200) { Write-Log "[SUCCESS] Heartbeat OK" "SUCCESS" } else { Write-Log "[ERROR] Heartbeat falhou" "ERROR" }
    } catch { Write-Log "[ERROR] Erro ao enviar heartbeat: \\\$(\\\$_.Exception.Message)" "ERROR" }
}

function Send-SystemMetrics { param([Parameter(Mandatory = \\\$true)][hashtable]\\\$Metrics)
    try { \\\$result = Invoke-SecureRequest -Path "/functions/v1/submit-system-metrics" -Method "POST" -Body \\\$Metrics -TimeoutSec 15
        if (\\\$result.Success -and \\\$result.StatusCode -eq 200) { Write-Log "[SUCCESS] Metricas enviadas" "SUCCESS"; return \\\$true } else { return \\\$false }
    } catch { Write-Log "[ERROR] Erro ao enviar metricas: \\\$(\\\$_.Exception.Message)" "ERROR"; return \\\$false }
}

function Submit-JobResult { param([Parameter(Mandatory = \\\$true)][string]\\\$JobId, [Parameter(Mandatory = \\\$true)][ValidateSet("completed","failed")][string]\\\$Status, [Parameter(Mandatory = \\\$false)][object]\\\$Output = @{}, [Parameter(Mandatory = \\\$false)][string]\\\$ErrorMessage = "", [Parameter(Mandatory = \\\$false)][int]\\\$ExecutionTimeSeconds = 0, [Parameter(Mandatory = \\\$false)][string]\\\$StartedAt = "")
    \\\$body = @{ job_id = \\\$JobId; agent_name = \\\$Global:AgentName; status = \\\$Status; output = \\\$Output; error_message = \\\$ErrorMessage; execution_time_seconds = \\\$ExecutionTimeSeconds; started_at = \\\$StartedAt; finished_at = (Get-Date).ToUniversalTime().ToString("o") }
    Write-Log "Enviando resultado do job \\\$JobId (status=\\\$Status)..." "INFO"
    try { \\\$result = Invoke-SecureRequest -Path "/functions/v1/submit-job-result" -Method "POST" -Body \\\$body -TimeoutSec 30
        if (\\\$result.Success -and \\\$result.StatusCode -eq 200) { Write-Log "[SUCCESS] Job \\\$JobId enviado" "SUCCESS"; return \\\$true } else { Write-Log "[ERROR] Falha Status=\\\$(\\\$result.StatusCode)" "ERROR"; return \\\$false }
    } catch { Write-Log "[ERROR] Erro ao enviar job \\\${JobId}: \\\$(\\\$_.Exception.Message)" "ERROR"; return \\\$false }
}

function Execute-Job { param([Parameter(Mandatory = \\\$true)]\\\$Job)
    \\\$jobId = \\\$Job.id; \\\$jobType = \\\$Job.type; \\\$payload = \\\$Job.payload; \\\$startTime = Get-Date
    Write-Log "[JOB] Executando \\\$jobId (type=\\\$jobType)" "INFO"
    try { \\\$output = @{}
        switch (\\\$jobType) {
            "integration_test" { \\\$sys = Get-SystemInfo; \\\$output = @{ message = "Integration test OK"; timestamp = (Get-Date).ToUniversalTime().ToString("o"); agent = \\\$Global:AgentName; version = \\\$Global:AgentVersion; system = \\\$sys } }
            "collect_info" { \\\$output = Get-SystemInfo }
            "report" { \\\$reportResult = Invoke-ReportJob -Job \\\$Job; if (\\\$reportResult.success) { \\\$output = \\\$reportResult.output | ConvertFrom-Json } else { throw \\\$reportResult.output } }
            "scan" { throw "Scan job requer filePath no payload" }
            "update_agent" {
                \\\$updateResult = Invoke-SecureRequest -Path "/functions/v1/serve-agent-update" -Method GET -TimeoutSec 60
                if (-not \\\$updateResult.Success) { throw "Falha buscar update: HTTP \\\$(\\\$updateResult.StatusCode)" }
                \\\$data = \\\$updateResult.Body | ConvertFrom-Json
                if (\\\$data.message -eq "Already up to date") { \\\$output = \\\$data; break }
                \\\$newVersion = \\\$data.version; \\\$scriptText = \\\$data.script_content; \\\$expectedHash = \\\$data.sha256
                Write-Log "[UPDATE] Atualizando para \\\$newVersion" "INFO"
                \\\$currentScript = "C:\\\\CyberShield\\\\cybershield-agent-\\\$(\\\$Global:AgentName).ps1"
                \\\$backupScript = \\\$currentScript -replace '\\\\.ps1\\\$', "-backup-\\\$(Get-Date -Format 'yyyyMMdd_HHmmss').ps1"
                \\\$tempScript = Join-Path \\\$env:TEMP "cybershield-agent-update-\\\$newVersion.ps1"
                [System.IO.File]::WriteAllText(\\\$tempScript, \\\$scriptText, [System.Text.UTF8Encoding]::new(\\\$false))
                \\\$actualHash = (Get-FileHash -Path \\\$tempScript -Algorithm SHA256).Hash.ToLower()
                if (\\\$actualHash -ne \\\$expectedHash.ToLower()) { Remove-Item \\\$tempScript -Force; throw "SHA256 mismatch! Esperado: \\\$expectedHash, Obtido: \\\$actualHash" }
                Write-Log "[SUCCESS] SHA256 validado: \\\$actualHash" "SUCCESS"
                Copy-Item -Path \\\$currentScript -Destination \\\$backupScript -Force
                Copy-Item -Path \\\$tempScript -Destination \\\$currentScript -Force
                Remove-Item \\\$tempScript -Force
                Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName "CyberShield Agent"
                \\\$output = @{ message = "Agent updated successfully"; newVersion = \\\$newVersion; sha256 = \\\$actualHash; restartedAt = (Get-Date).ToUniversalTime().ToString("o") }; break
            }
            "software_inventory_collect" { \\\$result = Invoke-SoftwareInventoryJob -Job \\\$job; if (\\\$result.success) { \\\$output = \\\$result.output } else { throw \\\$result.error } }
            "light_vuln_scan" { \\\$result = Invoke-LightVulnScanJob -Job \\\$job; if (\\\$result.success) { \\\$output = \\\$result.output } else { throw \\\$result.error } }
            "collect_antivirus_status" { \\\$result = Invoke-CollectAntivirusStatusJob -Job \\\$job; if (\\\$result.success) { \\\$output = \\\$result.output } else { throw \\\$result.error } }
            "collect_web_activity" { \\\$result = Invoke-WebActivityJob -Job \\\$job; if (\\\$result.success) { \\\$output = \\\$result.output } else { throw \\\$result.error } }
            "fix_firewall" { \\\$result = Invoke-FixFirewallJob -Job \\\$job; if (\\\$result.success) { \\\$output = \\\$result.output } else { throw \\\$result.error } }
            "restart_service" { \\\$result = Invoke-RestartServiceJob -Job \\\$job; if (\\\$result.success) { \\\$output = \\\$result.output } else { throw \\\$result.error } }
            default { throw "Tipo de job nao suportado: \\\$jobType" }
        }
        \\\$execTime = [int]((Get-Date) - \\\$startTime).TotalSeconds; \\\$startTimeISO = \\\$startTime.ToUniversalTime().ToString("o")
        Submit-JobResult -JobId \\\$jobId -Status "completed" -Output \\\$output -ExecutionTimeSeconds \\\$execTime -StartedAt \\\$startTimeISO
    } catch { \\\$err = "Erro job \\\$jobId: \\\$(\\\$_.Exception.Message)"; Write-Log \\\$err "ERROR"
        \\\$execTime = [int]((Get-Date) - \\\$startTime).TotalSeconds; \\\$startTimeISO = \\\$startTime.ToUniversalTime().ToString("o")
        Submit-JobResult -JobId \\\$jobId -Status "failed" -ErrorMessage \\\$err -ExecutionTimeSeconds \\\$execTime -StartedAt \\\$startTimeISO }
}

function Poll-Jobs {
    \\\$body = @{ agent_name = \\\$Global:AgentName; agent_version = \\\$Global:AgentVersion }
    Write-Log "Consultando jobs..." "INFO"
    try { \\\$result = Invoke-SecureRequest -Path "/functions/v1/poll-jobs" -Method "POST" -Body \\\$body -TimeoutSec 20
        if (-not \\\$result.Success -or \\\$result.StatusCode -ne 200) { Write-Log "[ERROR] poll-jobs falhou Status=\\\$(\\\$result.StatusCode)" "ERROR"; return }
        if ([string]::IsNullOrWhiteSpace(\\\$result.Body)) { return }
        \\\$jobs = \\\$result.Body | ConvertFrom-Json
        if (\\\$null -eq \\\$jobs -or \\\$jobs.Count -eq 0) { Write-Log "[POLL] Nenhum job" "INFO"; return }
        Write-Log "[JOBS] Recebidos \\\$(\\\$jobs.Count) job(s)" "INFO"
        foreach (\\\$job in \\\$jobs) { Execute-Job -Job \\\$job }
    } catch { Write-Log "[ERROR] Erro poll-jobs: \\\$(\\\$_.Exception.Message)" "ERROR" }
}

# ============================================
#  LOOP PRINCIPAL
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] Iniciando CyberShield Agent - Windows v\\\$Global:AgentVersion" "INFO"
Write-Log "[INFO] ServerUrl: \\\$Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: \\\$Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

try {
    \\\$bootstrapStart = Get-Date
    Send-PostInstallationEvent -Success \\\$true -InstallationTimeSeconds 0
    Send-Heartbeat
    \\\$bootstrapElapsed = [int]((Get-Date) - \\\$bootstrapStart).TotalSeconds
    Write-Log "[SUCCESS] Bootstrap concluido em \\\${bootstrapElapsed}s" "SUCCESS"
    Write-Log "[INFO] Entrando no loop principal (intervalo=\\\$(\\\$Global:PollIntervalSeconds)s)" "INFO"

    \\\$lastHeartbeat = Get-Date; \\\$lastPoll = Get-Date; \\\$lastMetrics = Get-Date; \\\$lastUpdateCheck = Get-Date

    while (\\\$true) {
        \\\$now = Get-Date
        try {
            if (((\\\$now - \\\$lastHeartbeat).TotalSeconds) -ge \\\$Global:PollIntervalSeconds) { Send-Heartbeat; \\\$lastHeartbeat = Get-Date }
            try { if (((\\\$now - \\\$lastUpdateCheck).TotalHours) -ge 24) {
                Write-Log "[UPDATE] Verificando atualizacoes..." "INFO"
                \\\$updateResult = Invoke-SecureRequest -Path "/functions/v1/check-agent-updates" -Method "GET" -TimeoutSec 30
                if (\\\$updateResult.Success -and \\\$updateResult.StatusCode -eq 200) {
                    try { \\\$updateInfo = \\\$updateResult.Body | ConvertFrom-Json
                        if (\\\$updateInfo.has_update -and \\\$updateInfo.version -ne \\\$Global:AgentVersion) {
                            Write-Log "[UPDATE] Nova versao: \\\$(\\\$updateInfo.version)" "INFO"
                            \\\$updateJob = @{ id = "auto-update-\\\$(Get-Date -Format 'yyyyMMddHHmmss')"; type = "update_agent" }
                            try { Execute-Job -Job \\\$updateJob; Write-Log "[SUCCESS] Script atualizado em disco" "SUCCESS"; Write-Log "[INFO] Nova versao sera carregada no proximo boot" "INFO" }
                            catch { Write-Log "[ERROR] Falha auto-update: \\\$(\\\$_.Exception.Message)" "ERROR" }
                        } else { Write-Log "[UPDATE] Agente ja atualizado (\\\$Global:AgentVersion)" "INFO" }
                    } catch {} }
                \\\$lastUpdateCheck = Get-Date } } catch { \\\$lastUpdateCheck = Get-Date }
            try { if (((\\\$now - \\\$lastMetrics).TotalSeconds) -ge 300) {
                \\\$metricsJob = @{ id = "auto-metrics"; type = "report" }; \\\$metricsResult = Invoke-ReportJob -Job \\\$metricsJob
                if (\\\$metricsResult.success) { try { \\\$metricsData = \\\$metricsResult.output | ConvertFrom-Json
                    \\\$payload = @{ cpu_usage_percent = \\\$metricsData.cpu_percent; memory_usage_percent = \\\$metricsData.memory_percent; disk_usage_percent = \\\$metricsData.disk_percent; hostname = \\\$metricsData.hostname }
                    \\\$sent = Send-SystemMetrics -Metrics \\\$payload
                    if (\\\$sent) { Write-Log "[SUCCESS] Metricas enviadas: CPU=\\\$(\\\$metricsData.cpu_percent)%, RAM=\\\$(\\\$metricsData.memory_percent)%, Disco=\\\$(\\\$metricsData.disk_percent)%" "SUCCESS" }
                } catch {} }
                \\\$lastMetrics = Get-Date } } catch {}
            if (((\\\$now - \\\$lastPoll).TotalSeconds) -ge \\\$Global:PollIntervalSeconds) { Poll-Jobs; \\\$lastPoll = Get-Date }
        } catch { Write-Log "[ERROR] Erro no loop: \\\$(\\\$_.Exception.Message)" "ERROR" }
        Start-Sleep -Seconds 2
    }
}
catch { Write-Log "[FATAL] Erro fatal: \\\$(\\\$_.Exception.Message)" "ERROR"; Write-Log "Stack: \\\$(\\\$_.ScriptStackTrace)" "ERROR"; exit 1 }
`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
