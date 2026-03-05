# 🥷 Bugs Ninja: Problemas Não Óbvios com Agentes Windows

Guia de troubleshooting para erros sutis que podem quebrar agentes em produção.

## 1. Clock Skew / Horário Maluco do Host

**Sintoma:** Muitos `401` com código `AUTH_TIMESTAMP_OUT_OF_RANGE`

**Causas comuns:**
- BIOS sem bateria (clock reseta a cada boot)
- VM recém-criada sem NTP configurado
- Servidor sem sincronização de horário
- Timezone incorreto (UTC vs local)

**Como detectar:**
```powershell
# Verificar horário atual
Get-Date
# Verificar sincronização NTP
w32tm /query /status
```

**Solução:**
```powershell
# Forçar sincronização NTP
w32tm /resync /force
# Configurar NTP server
w32tm /config /manualpeerlist:"pool.ntp.org" /syncfromflags:manual /reliable:YES /update
```

**Mitigação no código:**
- Backend retorna `transient: true` para este erro
- Agent faz retry com backoff maior
- Health check pode revelar o problema

---

## 2. Encoding / Normalização de Body Diferente

**Sintoma:** `AUTH_INVALID_SIGNATURE` mesmo com credenciais corretas

**Causas comuns:**
- `ConvertTo-Json` do PowerShell formata diferente do backend
- Ordem de campos JSON diferente
- Espaçamento/quebras de linha diferentes
- Caracteres especiais (UTF-8 vs UTF-16)

**Solução atual:**
- Usar `-Compress` no `ConvertTo-Json` (sem espaços)
- Backend e agent usam UTF-8 explicitamente
- Payload HMAC usa: `timestamp:nonce:body` (body completo)

**Se o problema persistir:**
```powershell
# Logar payload exato que está sendo assinado (DEBUG mode)
Write-Log "Payload sendo assinado: [$dataToSign]" "DEBUG"
Write-Log "Bytes do payload: $([System.Text.Encoding]::UTF8.GetBytes($dataToSign) -join ',')" "DEBUG"
```

---

## 3. Trailing Slash / Path Diferente

**Sintoma:** Assinatura falha intermitentemente

**Causa:**
- Agent assina `/agent/poll-jobs`
- Reverse proxy/load balancer adiciona `/agent/poll-jobs/`
- Backend calcula HMAC com path diferente

**Solução:**
- Normalizar path no backend antes de validar HMAC
- Agent sempre usa path sem trailing slash

---

## 4. Rotação de Segredo HMAC Inconsistente

**Sintoma:** 50% das requisições passam, 50% falham com `AUTH_INVALID_SIGNATURE`

**Causa:**
- Múltiplos pods/instâncias do backend
- Cada um com versão diferente de `HMAC_SECRET`

**Solução:**
- Implementar Key ID: `X-Signature-Key-Id: v1`
- Backend tenta validar com múltiplas keys
- Durante rotação, manter keys antigas por 24h

---

## 5. TLS / Proxy / DPI em Ambiente Corporativo

**Sintoma:**
- Conexão funciona localmente, falha em produção
- Erro genérico "Could not establish trust relationship"
- Erro SSL/TLS: "Não foi possível criar um canal seguro para SSL/TLS"
- Resposta HTML em vez de JSON (captive portal)

**Causa:**
- **Windows Server 2012/2016:** PowerShell usa TLS 1.0 por padrão, mas Supabase requer TLS 1.2+
- TLS 1.0/1.1 desabilitado no servidor
- Proxy corporativo interceptando SSL
- Deep Packet Inspection modificando requisições
- Captive portal bloqueando saída

**Diagnóstico:**
```powershell
# Verificar protocolo TLS atual
[Net.ServicePointManager]::SecurityProtocol
# Se retornar "Ssl3, Tls" - problema confirmado (falta TLS 1.2)

# Testar conexão com TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-RestMethod -Uri "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/agent-health-check" -Method GET
```

**Solução Imediata (one-liner para MIT-SERVIDOR e similares):**
```powershell
# Forçar TLS 1.2 e executar reinstalação preservando credenciais
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
```

**Solução Permanente:**
O agente v4.4.0+ já inclui `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12` no início do script.

**Detectar resposta não-JSON (proxy/captive portal):**
```powershell
try {
    $response | ConvertFrom-Json
} catch {
    Write-Log "ERRO: Resposta não é JSON válido (possível proxy/captive portal)" "ERROR"
    Write-Log "Primeiros 200 chars: $($response.Substring(0, [Math]::Min(200, $response.Length)))" "DEBUG"
}
```

---

## 6. Permissão / Antivírus Bloqueando Logs

**Sintoma:** Agent crasha sem logs

**Causa:**
- `C:\CyberShield\logs` sem permissão de escrita
- Antivírus fazendo lock no arquivo de log
- Disco cheio

**Solução:**
```powershell
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    try {
        Add-Content -Path $LogFile -Value "[$Timestamp] [$Level] $Message"
    } catch {
        # Se não conseguir logar, pelo menos não mata o agente
        # Tentar logar em fallback location
        try {
            Add-Content -Path "$env:TEMP\cybershield-agent-fallback.log" -Value "[$Timestamp] [$Level] $Message"
        } catch {
            # Última tentativa: Event Viewer
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -Message $Message -EntryType Warning -ErrorAction SilentlyContinue
        }
    }
}
```

---

## 7. Payload Muito Grande (413)

**Sintoma:** `submit-metrics` ou `upload-report` falham com 413

**Causa:**
- Report/metrics maiores que limite do servidor
- Edge Function tem timeout de 10s (Supabase default)

**Solução:**
- Definir limite explícito (ex: 1MB)
- Implementar chunking se necessário
- Retornar `code: "PAYLOAD_TOO_LARGE"` com tamanho máximo

---

## 8. Race Conditions em Reprocessamento de Jobs

**Sintoma:** Job executado 2x

**Causa:**
- Agent puxa job
- Agent crasha antes de ACK
- Backend reentrega job para outro agent

**Solução:**
- Backend registra `job_execution_attempts`
- Se `attempts > 1`, marcar como duplicate no dashboard
- Agent incluir execution UUID no ACK

---

## 9. Locale/Regional Settings Quebrando Parsing

**Sintoma:** Números/datas parseados errado

**Causa:**
- Servidor pt-BR usa `,` como decimal
- Backend espera `.`

**Solução:**
```powershell
# Usar InvariantCulture para números
$cpuUsage = [decimal]::Parse("45.6", [System.Globalization.CultureInfo]::InvariantCulture)

# Datas sempre em ISO 8601
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
```

---

## 10. Agente Rodando em 32-bit PowerShell

**Sintoma:**
- Drivers/ferramentas não encontrados
- Registry paths diferentes

**Solução:**
```powershell
# Verificar arquitetura
if (-not [Environment]::Is64BitProcess) {
    Write-Log "AVISO: Rodando em PowerShell 32-bit. Algumas funcionalidades podem não estar disponíveis." "WARN"
}

# Forçar 64-bit no Scheduled Task
# Action: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe (não SysWOW64)
```

---

## Checklist de Diagnóstico Rápido

Quando um agente está "quebrado" e você não sabe por quê:

```powershell
# 1. Health check
Invoke-RestMethod -Uri "$ServerUrl/functions/v1/agent-health-check" -Method POST -Headers @{"X-Agent-Token"="..."}

# 2. Verificar clock
Get-Date; w32tm /query /status

# 3. Testar conectividade raw
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443

# 4. Ver logs detalhados
Get-Content C:\CyberShield\logs\agent.log -Tail 100

# 5. Verificar Scheduled Task
Get-ScheduledTask -TaskName "CyberShieldAgent" | Get-ScheduledTaskInfo

# 6. Verificar processos
Get-Process | Where-Object { $_.ProcessName -like "*powershell*" }
```
