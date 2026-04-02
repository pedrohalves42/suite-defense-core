# Runbook: Agente Windows

> **Versão:** 6.0 | **Última atualização:** 2026-04-02 | **Autor:** Equipe CyberShield  
> **Arquivos:** `agents/windows/modules/`

---

## Índice

1. [Objetivo](#objetivo)
2. [Pré-requisitos](#pré-requisitos)
3. [Visão Geral da Arquitetura](#visão-geral)
4. [Estrutura de Diretórios](#estrutura-de-diretórios)
5. [Serviços e Processos](#serviços-e-processos)
6. [Logs](#logs)
7. [Diagnóstico](#diagnóstico)
8. [Configuração](#configuração)
9. [Atualização](#atualização)
10. [Segurança](#segurança)
11. [Troubleshooting](#troubleshooting)

---

## Objetivo

Documentar a instalação, operação, diagnóstico e manutenção do **Agente CyberShield para Windows**, incluindo seus componentes modulares, segurança e mecanismos de atualização.

## Pré-requisitos

- Windows 10/11 ou Windows Server 2016+
- PowerShell 5.1 ou superior
- Privilégios de Administrador local
- Conectividade HTTPS (porta 443) com o backend CyberShield

## Visão Geral da Arquitetura {#visão-geral}

O agente Windows v6.0 utiliza uma arquitetura **modular com orquestrador**:

- **`main.ps1`** — Orquestrador principal com mutex de instância única
- **`Invoke-AgentJob`** — Despachante tipado com whitelist de comandos permitidos
- **Módulos** em `agents/windows/modules/`:
  - `crypto.ps1` — Hash SHA-256 (`Get-PayloadHash`)
  - `hmac.ps1` — Autenticação HMAC-SHA256 com nonce
  - `network.ps1` — Comunicação segura com o backend
  - `telemetry.ps1` — Coleta de métricas do sistema
  - `inventory.ps1` — Inventário de software e hardware

### Princípio de Segurança

> **Zero execução arbitrária:** O agente utiliza despachantes tipados com whitelist. Comandos não previstos são rejeitados.

## Estrutura de Diretórios

```
C:\ProgramData\CyberShield\
├── config\
│   ├── agent.json          # Configuração principal (tenant_id, server_url)
│   └── enrollment.json     # Dados de enrollment
├── logs\
│   ├── agent.log           # Log principal
│   └── update.log          # Log de atualizações
├── keys\
│   ├── agent.key           # Token do agente (protegido)
│   └── hmac.key            # Segredo HMAC (protegido)
├── cache\
│   └── inventory.json      # Cache de inventário
└── bin\
    ├── main.ps1            # Orquestrador
    └── modules\            # Módulos PowerShell
```

## Serviços e Processos

### Serviço Windows: `CyberShieldAgent`

```powershell
# Verificar status do serviço
Get-Service -Name "CyberShieldAgent"

# Iniciar o serviço
Start-Service -Name "CyberShieldAgent"

# Parar o serviço
Stop-Service -Name "CyberShieldAgent"

# Reiniciar o serviço
Restart-Service -Name "CyberShieldAgent"
```

### Tarefa Agendada: `CyberShieldUpdate`

```powershell
# Verificar tarefa de atualização
Get-ScheduledTask -TaskName "CyberShieldUpdate"

# Executar manualmente
Start-ScheduledTask -TaskName "CyberShieldUpdate"

# Ver histórico de execução
Get-ScheduledTask -TaskName "CyberShieldUpdate" | Get-ScheduledTaskInfo
```

## Logs

### Localização

| Arquivo | Descrição |
|---------|-----------|
| `C:\ProgramData\CyberShield\logs\agent.log` | Log principal do agente |
| `C:\ProgramData\CyberShield\logs\update.log` | Log de atualizações |
| Windows Event Log (`Application`) | Eventos críticos do serviço |

### Níveis de Log

| Nível | Uso |
|-------|-----|
| `INFO` | Operações normais (heartbeat, coleta) |
| `WARN` | Situações anômalas (retry, timeout) |
| `ERROR` | Falhas que impedem operação |
| `SUCCESS` | Confirmação de operações críticas |

### Rotação de Logs

Logs são rotacionados automaticamente quando atingem **10 MB**, mantendo as últimas **5 versões**.

### Visualizar logs recentes

```powershell
# Últimas 50 linhas do log
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Tail 50

# Filtrar erros
Select-String -Path "C:\ProgramData\CyberShield\logs\agent.log" -Pattern "ERROR"

# Monitorar em tempo real
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Wait -Tail 10
```

## Diagnóstico

### Testar conectividade com o backend

```powershell
# Testar resolução DNS
Resolve-DnsName "sua-instancia.supabase.co"

# Testar conectividade HTTPS
Test-NetConnection -ComputerName "sua-instancia.supabase.co" -Port 443

# Testar endpoint de saúde
Invoke-RestMethod -Uri "https://sua-instancia.supabase.co/functions/v1/health" -Method GET
```

### Verificar token do agente

```powershell
# Verificar se o token existe e não está vazio
$tokenPath = "C:\ProgramData\CyberShield\keys\agent.key"
if (Test-Path $tokenPath) {
    $token = Get-Content $tokenPath
    Write-Host "Token presente: $($token.Length) caracteres"
} else {
    Write-Host "ERRO: Token não encontrado!"
}
```

### Testar HMAC

```powershell
# Importar módulo de crypto
. "C:\ProgramData\CyberShield\bin\modules\crypto.ps1"

# Gerar hash de teste
$hash = Get-PayloadHash -Payload "teste"
Write-Host "SHA-256: $hash"
```

### Verificar registro no backend

```powershell
# Verificar último heartbeat via logs
Select-String -Path "C:\ProgramData\CyberShield\logs\agent.log" -Pattern "heartbeat" | Select-Object -Last 5
```

## Configuração

### Alterar URL do servidor

Editar `C:\ProgramData\CyberShield\config\agent.json`:

```json
{
  "server_url": "https://nova-instancia.supabase.co",
  "tenant_id": "uuid-do-tenant",
  "heartbeat_interval": 300
}
```

Após alterar, reiniciar o serviço:

```powershell
Restart-Service -Name "CyberShieldAgent"
```

### Substituir token expirado

```powershell
# Parar o serviço
Stop-Service -Name "CyberShieldAgent"

# Atualizar token
Set-Content -Path "C:\ProgramData\CyberShield\keys\agent.key" -Value "NOVO_TOKEN_AQUI"

# Proteger o arquivo
$acl = Get-Acl "C:\ProgramData\CyberShield\keys\agent.key"
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM","FullControl","Allow")
$acl.SetAccessRule($rule)
Set-Acl -Path "C:\ProgramData\CyberShield\keys\agent.key" -AclObject $acl

# Reiniciar
Start-Service -Name "CyberShieldAgent"
```

## Atualização

### Mecanismo

1. Tarefa `CyberShieldUpdate` verifica novas versões periodicamente
2. Download do pacote atualizado com verificação SHA-256 (`Get-PayloadHash`)
3. Validação de integridade contra hash esperado
4. Aplicação da atualização com rollback automático em caso de falha

### Forçar atualização

```powershell
# Via tarefa agendada
Start-ScheduledTask -TaskName "CyberShieldUpdate"

# Verificar resultado
Get-Content "C:\ProgramData\CyberShield\logs\update.log" -Tail 20
```

## Segurança

### Armazenamento de Segredos

| Segredo | Local | Proteção |
|---------|-------|----------|
| Token do agente | `keys\agent.key` | ACL restrita a SYSTEM |
| Segredo HMAC | `keys\hmac.key` | ACL restrita a SYSTEM |
| Configuração | `config\agent.json` | Leitura apenas por Administrators |

### Autenticação

- **HMAC-SHA256 com nonce** (hex-encoding obrigatório)
- Sem fallback inseguro para RSA puro
- Proteção contra **clock skew** de ±5 minutos
- Comparação via `timingSafeEqual` no backend

### Coleta de dados

- Utiliza **Registro HKLM/HKCU** para performance (sem WMI quando possível)
- Despachante tipado com whitelist impede execução arbitrária

## Troubleshooting

| Sintoma | Causa Provável | Ação |
|---------|---------------|------|
| Serviço não inicia | Token ausente ou corrompido | Verificar `keys\agent.key` |
| Heartbeat falhando | Firewall bloqueando porta 443 | `Test-NetConnection` |
| Agente offline no dashboard | Serviço parado | `Get-Service CyberShieldAgent` |
| Atualização falha | Hash SHA-256 não confere | Verificar `update.log` |
| Erro de HMAC | Clock desincronizado | Sincronizar hora via NTP |
| Múltiplas instâncias | Mutex falhou | Reiniciar serviço |

---

**Referências:**
- `agents/windows/modules/crypto.ps1` — Hash SHA-256
- `agents/windows/modules/hmac.ps1` — Autenticação HMAC
- ADR-042 — Governança de Automação
