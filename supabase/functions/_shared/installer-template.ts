/**
 * Single Source of Truth for Installers
 * 
 * This file is the ONLY authoritative template for Windows/Linux/macOS installers.
 * Last synchronized: 2025-01-19 (v3.1.0-HARDENED)
 */

// Windows Installer Template (v3.1.0-HARDENED)
export const WINDOWS_INSTALLER_TEMPLATE = `#Requires -RunAsAdministrator
#Requires -Version 5.1

param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl   = "{{SERVER_URL}}",
  [Parameter(Mandatory = $true)]
  [string]$AgentToken  = "{{AGENT_TOKEN}}",
  [Parameter(Mandatory = $true)]
  [string]$HmacSecret  = "{{HMAC_SECRET}}",
  [Parameter(Mandatory = $true)]
  [string]$AgentName   = "{{AGENT_NAME}}"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ============= FASE 0: Pre-checks =============
$BasePath  = "C:\\CyberShield"
$LogsPath  = Join-Path $BasePath "logs"
$LogFile   = Join-Path $LogsPath "installer.log"

# Criar pastas base e logs com permissoes explicitas
try {
    if (-not (Test-Path $BasePath)) {
        New-Item -ItemType Directory -Path $BasePath -Force | Out-Null
        Write-InstallerLog "Pasta base criada: $BasePath" "SUCCESS"
    } else {
        Write-InstallerLog "Pasta base ja existe: $BasePath" "INFO"
    }

    if (-not (Test-Path $LogsPath)) {
        New-Item -ItemType Directory -Path $LogsPath -Force | Out-Null
        Write-InstallerLog "Pasta de logs criada: $LogsPath" "SUCCESS"
    } else {
        Write-InstallerLog "Pasta de logs ja existe: $LogsPath" "INFO"
    }

    # Garantir permissoes para SYSTEM
    try {
        $acl = Get-Acl $LogsPath
        $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "NT AUTHORITY\SYSTEM",
            "FullControl",
            "ContainerInherit,ObjectInherit",
            "None",
            "Allow"
        )
        $acl.SetAccessRule($systemRule)
        Set-Acl -Path $LogsPath -AclObject $acl
        Write-InstallerLog "Permissoes SYSTEM aplicadas em $LogsPath" "SUCCESS"
    } catch {
        Write-InstallerLog "Aviso: nao foi possivel aplicar ACL para SYSTEM em $LogsPath: $($_.Exception.Message)" "WARN"
    }
} catch {
    Write-InstallerLog "ERRO CRITICO: falha ao criar pastas base/logs: $($_.Exception.Message)" "ERROR"
    throw "Instalacao abortada: nao foi possivel criar pastas e logs em $BasePath"
}

function Write-InstallerLog {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $line
}

# Registrar event source para fallback de log em caso de falha no arquivo
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists("CyberShield")) {
        New-EventLog -LogName Application -Source "CyberShield"
        Write-InstallerLog "Event source 'CyberShield' registrada" "SUCCESS"
    } else {
        Write-InstallerLog "Event source 'CyberShield' ja existe" "INFO"
    }
} catch {
    Write-InstallerLog "Aviso: nao foi possivel registrar event source 'CyberShield': $($_.Exception.Message)" "WARN"
}

Write-InstallerLog "=== CyberShield Agent Installer v{{INSTALLER_VERSION}} ===" "INFO"
Write-InstallerLog "ServerUrl: $ServerUrl" "INFO"
Write-InstallerLog "AgentName: $AgentName" "INFO"

# ============= FASE 1: Cleanup =============
Write-InstallerLog "FASE 1: Limpando instalacoes anteriores..." "INFO"

# Stop old processes
try {
    Get-Process -Name "*cybershield*" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-InstallerLog "Parando processo: $($_.Name) (PID: $($_.Id))" "INFO"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
} catch {
    Write-InstallerLog "Aviso ao parar processos: $($_.Exception.Message)" "WARN"
}

# Remove old scheduled tasks
Write-InstallerLog "Removendo tasks antigas do CyberShield..." "INFO"
try {
    # Metodo 1: PowerShell cmdlet
    $oldTasks = Get-ScheduledTask -TaskName "CyberShieldAgent*" -ErrorAction SilentlyContinue
    if ($oldTasks) {
        foreach ($task in $oldTasks) {
            Write-InstallerLog "Removendo task antiga (cmdlet): $($task.TaskName)" "INFO"
            try {
                Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:\$false -ErrorAction Stop
                Write-InstallerLog "Task removida com sucesso: $($task.TaskName)" "SUCCESS"
            } catch {
                Write-InstallerLog "Falha ao remover $($task.TaskName) via cmdlet: $($_.Exception.Message)" "WARN"
            }
        }
    }
    
    # Metodo 2: schtasks.exe (fallback mais agressivo)
    $schtasksOutput = schtasks.exe /Query /FO CSV 2>&1 | ConvertFrom-Csv -ErrorAction SilentlyContinue
    if ($schtasksOutput) {
        $cyberShieldTasks = $schtasksOutput | Where-Object { $_.'TaskName' -like '*CyberShieldAgent*' }
        if ($cyberShieldTasks) {
            foreach ($task in $cyberShieldTasks) {
                $taskName = $task.'TaskName'.TrimStart('\')
                Write-InstallerLog "Removendo task antiga (schtasks): $taskName" "INFO"
                $deleteResult = schtasks.exe /Delete /TN "$taskName" /F 2>&1
                Write-InstallerLog "Resultado: $deleteResult" "DEBUG"
            }
        }
    }
    
    Write-InstallerLog "Cleanup de tasks antigas concluido" "SUCCESS"
} catch {
    Write-InstallerLog "Aviso ao remover tasks: $($_.Exception.Message)" "WARN"
}

Write-InstallerLog "FASE 1: Cleanup concluido" "SUCCESS"

# ============= FASE 2: Instalacao =============
Write-InstallerLog "FASE 2: Criando script do agente..." "INFO"

$AgentScriptContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

$AgentScriptPath = Join-Path $BasePath "cybershield-agent-$AgentName.ps1"

# Salvar script do agente em UTF-8 SEM BOM (compativel com PowerShell 5.1 e Task Scheduler)
Write-InstallerLog "Salvando script do agente em UTF-8 sem BOM..." "INFO"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($AgentScriptPath, $AgentScriptContent, $utf8NoBom)

Write-InstallerLog "Script criado: $AgentScriptPath ($(([System.IO.FileInfo]$AgentScriptPath).Length) bytes)" "SUCCESS"

# Validacao critica de encoding
Write-InstallerLog "Validando encoding do script..." "INFO"
try {
    $bytes = [System.IO.File]::ReadAllBytes($AgentScriptPath)
    
    # Detectar UTF-16 LE (0xFF 0xFE) - isso impede execucao
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        Write-InstallerLog "[ERROR]  ERRO CRITICO: Script salvo em UTF-16 LE - instalacao falhara!" "ERROR"
        throw "Encoding incorreto detectado (UTF-16 LE). Script nao sera executavel."
    }
    
    # Detectar UTF-8 com BOM (aceitavel mas nao ideal)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        Write-InstallerLog "[WARN] AVISO: Script tem BOM UTF-8 (funciona, mas nao e ideal)" "WARN"
    } else {
        Write-InstallerLog "[OK]  Encoding validado: UTF-8 sem BOM (IDEAL)" "SUCCESS"
    }
} catch {
    Write-InstallerLog "[WARN] Falha na validacao de encoding: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Continuando instalacao..." "INFO"
}

# ============= FASE 3: Self-test =============
Write-InstallerLog "FASE 3: Testando conectividade com backend..." "INFO"

try {
    $healthUrl = "$ServerUrl/functions/v1/health"
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-InstallerLog "Health check OK: $($response.StatusCode)" "SUCCESS"
} catch {
    Write-InstallerLog "AVISO: Health check falhou: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Continuando instalacao (agente tentara conectar depois)..." "INFO"
}

Write-InstallerLog "FASE 3: Self-test concluido" "SUCCESS"

# ============= VALIDACAO CRITICA: Script do Agente =============
Write-InstallerLog "Validando script do agente..." "INFO"

if (-not (Test-Path $AgentScriptPath)) {
    Write-InstallerLog "[ERROR]  ERRO CRITICO: Script do agente nao foi criado" "ERROR"
    throw "Script do agente nao encontrado em: $AgentScriptPath"
}

$scriptSize = (Get-Item $AgentScriptPath).Length
if ($scriptSize -lt 10000) {  # Script completo deve ter ~50KB+
    Write-InstallerLog "[ERROR]  ERRO: Script do agente incompleto ($scriptSize bytes)" "ERROR"
    throw "Script do agente muito pequeno. Esperado >10KB, encontrado: $scriptSize bytes"
}

Write-InstallerLog "[OK]  Script do agente validado: $scriptSize bytes" "SUCCESS"

# Testar escrita no log do agente antes de criar a scheduled task
$AgentLogPath = Join-Path $LogsPath "cybershield-agent-v3.log"

try {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts [INFO] Agent log criado pelo instalador"
    Add-Content -Path $AgentLogPath -Value $line -Encoding UTF8
    Write-InstallerLog "Teste de escrita no log do agente ok: $AgentLogPath" "SUCCESS"
} catch {
    Write-InstallerLog "ERRO CRITICO: nao foi possivel escrever no log do agente: $($_.Exception.Message)" "ERROR"
    throw "Instalacao abortada: sem permissao para criar logs do agente em $AgentLogPath"
}

# ============= FASE 4: Scheduled Task =============
Write-InstallerLog "FASE 4: Criando Scheduled Task..." "INFO"

$TaskName = "CyberShieldAgent-$AgentName"

# Construir string de argumentos com escaping correto para Task Scheduler
$ArgumentString = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden " + \`
                  "-File \`"$AgentScriptPath\`" " + \`
                  "-ServerUrl \`"$ServerUrl\`" " + \`
                  "-AgentToken \`"$AgentToken\`" " + \`
                  "-HmacSecret \`"$HmacSecret\`" " + \`
                  "-AgentName \`"$AgentName\`""

Write-InstallerLog "Task arguments: $ArgumentString" "DEBUG"

$Action = New-ScheduledTaskAction \`
    -Execute "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" \`
    -Argument $ArgumentString

$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -StartWhenAvailable \`
    -RestartInterval (New-TimeSpan -Minutes 1) \`
    -RestartCount 3

Register-ScheduledTask \`
    -TaskName $TaskName \`
    -Action $Action \`
    -Trigger $Trigger \`
    -Principal $Principal \`
    -Settings $Settings \`
    -Force | Out-Null

Write-InstallerLog "Scheduled Task criada: $TaskName" "SUCCESS"

# ============= FASE 5: Inicializacao =============
Write-InstallerLog "FASE 5: Iniciando agente..." "INFO"

Start-ScheduledTask -TaskName $TaskName
Write-InstallerLog "Scheduled Task iniciada" "INFO"

# Aguardar execucao inicial
Start-Sleep -Seconds 5

# Diagnostico: verificar status da task
try {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    $task = Get-ScheduledTask -TaskName $TaskName
    Write-InstallerLog "Scheduled task state: $($task.State)" "INFO"
    Write-InstallerLog "Scheduled task last run time: $($taskInfo.LastRunTime)" "INFO"
    Write-InstallerLog "Scheduled task last result: $($taskInfo.LastTaskResult)" "INFO"
} catch {
    Write-InstallerLog "Aviso: nao foi possivel ler informacoes da scheduled task $TaskName: $($_.Exception.Message)" "WARN"
}

# Diagnostico: ler eventos recentes do EventLog Application para o source CyberShield
Write-InstallerLog "Verificando eventos recentes no EventLog Application para source 'CyberShield'" "INFO"
try {
    $cutoff = (Get-Date).AddMinutes(-2)
    $events = Get-EventLog -LogName Application -Source "CyberShield" -After $cutoff -Newest 10 -ErrorAction SilentlyContinue
    if ($events) {
        foreach ($evt in $events) {
            $line = "EventLog [$($evt.EntryType)] $($evt.TimeGenerated): $($evt.Message)"
            Write-InstallerLog $line "DEBUG"
        }
    } else {
        Write-InstallerLog "Nenhum evento recente encontrado para source 'CyberShield'" "INFO"
    }
} catch {
    Write-InstallerLog "Aviso: nao foi possivel ler EventLog Application: $($_.Exception.Message)" "WARN"
}

# Validacao completa da task
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
$taskState = Get-ScheduledTask -TaskName $TaskName

Write-InstallerLog "Task State: $($taskState.State)" "INFO"
Write-InstallerLog "Last Run Time: $($taskInfo.LastRunTime)" "INFO"
Write-InstallerLog "Last Task Result: $($taskInfo.LastTaskResult)" "INFO"

if ($taskInfo.LastTaskResult -ne 0 -and $taskInfo.LastTaskResult -ne $null) {
    Write-InstallerLog "[WARN] AVISO: Task retornou codigo de erro: $($taskInfo.LastTaskResult)" "WARN"
    Write-InstallerLog "Isso pode indicar problema com argumentos ou permissoes" "WARN"
    
    # Diagnostico especifico por codigo de erro
    switch ($taskInfo.LastTaskResult) {
        1 {
            Write-InstallerLog "Codigo 1: Erro generico. Verifique argumentos da task." "WARN"
        }
        2147942667 {
            Write-InstallerLog "Codigo 2147942667: Arquivo nao encontrado. Verifique path do script." "WARN"
        }
        2147943140 {
            Write-InstallerLog "Codigo 2147943140: Acesso negado. Verifique permissoes SYSTEM." "WARN"
        }
        2147942402 {
            Write-InstallerLog "Codigo 2147942402: Arquivo em uso. Aguarde e tente novamente." "WARN"
        }
        4294770688 {
            Write-InstallerLog "Codigo 4294770688: Argumentos mal formatados. Verifique escaping." "WARN"
        }
        default {
            Write-InstallerLog "Codigo desconhecido: $($taskInfo.LastTaskResult)" "WARN"
        }
    }
    
    # Sugerir proximos passos
    Write-InstallerLog "Proximos passos de diagnostico:" "INFO"
    Write-InstallerLog "  1. Verificar log do agente: C:\CyberShield\logs\cybershield-agent-v3.log" "INFO"
    Write-InstallerLog "  2. Executar manualmente: C:\CyberShield\cybershield-agent-$AgentName.ps1" "INFO"
    Write-InstallerLog "  3. Verificar Event Viewer: Logs de Aplicativo" "INFO"
}

# Verificar se o agente conseguiu iniciar (log criado)
Start-Sleep -Seconds 10

$agentLogPath = Join-Path $LogsPath "cybershield-agent-v3.log"
if (Test-Path $agentLogPath) {
    $logSize = (Get-Item $agentLogPath).Length
    Write-InstallerLog "[OK]  Log do agente detectado: $agentLogPath ($logSize bytes)" "SUCCESS"
} else {
    Write-InstallerLog "[WARN] AVISO: Log do agente nao encontrado apos 10s" "WARN"
    Write-InstallerLog "Path esperado: $agentLogPath" "INFO"
    Write-InstallerLog "Verifique se a Scheduled Task esta executando corretamente" "WARN"
}

Write-InstallerLog "FASE 5: Agente iniciado" "SUCCESS"

# ============= FASE 6: Telemetria =============
Write-InstallerLog "FASE 6: Enviando telemetria de instalacao..." "INFO"

try {
    $telemetryUrl = "$ServerUrl/functions/v1/track-installation-event"
    $telemetryBody = @{
        agent_name = $AgentName
        event_type = "post_installation"
        platform = "windows"
        success = $true
        metadata = @{
            installer_version = "3.1.0-HARDENED"
            powershell_version = $PSVersionTable.PSVersion.ToString()
            os_version = [System.Environment]::OSVersion.Version.ToString()
        }
    } | ConvertTo-Json -Depth 5
    
    $headers = @{
        "Content-Type" = "application/json"
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk"
    }
    
    Write-InstallerLog "Enviando telemetria para: $telemetryUrl" "DEBUG"
    
    $response = Invoke-WebRequest \`
        -Uri $telemetryUrl \`
        -Method POST \`
        -Body $telemetryBody \`
        -Headers $headers \`
        -UseBasicParsing \`
        -TimeoutSec 10 \`
        -ErrorAction Stop
    
    Write-InstallerLog "Telemetria enviada com sucesso (HTTP $($response.StatusCode))" "SUCCESS"
} catch {
    $errorDetails = $_.Exception.Message
    $statusCode = "N/A"
    
    # Extrair codigo HTTP se disponivel
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    
    Write-InstallerLog "AVISO: Falha ao enviar telemetria (HTTP $statusCode): $errorDetails" "WARN"
    
    # Diagnostico especifico por tipo de erro
    if ($statusCode -eq 401) {
        Write-InstallerLog "Erro de autenticacao. Verifique se o apikey esta correto." "WARN"
    } elseif ($statusCode -eq 500) {
        Write-InstallerLog "Erro no servidor backend. Verifique logs do Edge Function." "WARN"
    } elseif ($statusCode -eq 404) {
        Write-InstallerLog "Endpoint de telemetria nao encontrado. Verifique URL do servidor." "WARN"
    } else {
        Write-InstallerLog "Erro de rede ou timeout. Verifique conectividade." "WARN"
    }
    
    Write-InstallerLog "Instalacao concluida, mas telemetria nao foi enviada" "INFO"
    Write-InstallerLog "O agente ainda pode funcionar normalmente via heartbeats" "INFO"
}

# ============= Conclusao =============
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "[OK]  Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Detalhes da instalacao:" -ForegroundColor Cyan
Write-Host "  * Agente: $AgentName" -ForegroundColor White
Write-Host "  * Pasta: $BasePath" -ForegroundColor White
Write-Host "  * Logs: $LogFile" -ForegroundColor White
Write-Host "  * Task: $TaskName" -ForegroundColor White
Write-Host ""
Write-Host "O agente esta rodando em background e enviara heartbeats automaticamente." -ForegroundColor White
Write-Host "Verifique o status no dashboard em alguns minutos." -ForegroundColor White
Write-Host ""

Write-InstallerLog "=== Instalacao concluida com sucesso ===" "SUCCESS"
`;

// Linux Installer Template (v3)
export const LINUX_INSTALLER_TEMPLATE_V3 = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/opt/cybershield"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
chmod +x cybershield-agent.sh

# Create systemd service
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/cybershield-agent.sh
Environment="SERVER_URL=$SERVER_URL"
Environment="AGENT_TOKEN=$AGENT_TOKEN"
Environment="HMAC_SECRET=$HMAC_SECRET"
Environment="AGENT_NAME=$AGENT_NAME"
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "[OK]  CyberShield Agent installed successfully!"
`;

// macOS Installer Template (v3)
export const MACOS_INSTALLER_TEMPLATE_V3 = String.raw`#!/bin/zsh
# CyberShield Agent - macOS Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/usr/local/cybershield"
sudo mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
sudo curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
sudo chmod +x cybershield-agent.sh

# Create LaunchDaemon
sudo tee /Library/LaunchDaemons/com.cybershield.agent.plist > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/cybershield-agent.sh</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SERVER_URL</key>
        <string>$SERVER_URL</string>
        <key>AGENT_TOKEN</key>
        <string>$AGENT_TOKEN</string>
        <key>HMAC_SECRET</key>
        <string>$HMAC_SECRET</string>
        <key>AGENT_NAME</key>
        <string>$AGENT_NAME</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/cybershield-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/cybershield-agent.error.log</string>
</dict>
</plist>
EOF

# Load service
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

echo "[OK]  CyberShield Agent installed successfully!"
`;
