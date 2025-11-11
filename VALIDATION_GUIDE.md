# Guia de Validação do CyberShield Agent

## Visão Geral

Este guia descreve o processo completo de validação da instalação e funcionamento do CyberShield Agent.

## Ferramentas de Validação

### 1. Script PowerShell Automático

**Arquivo**: `tests/post-installation-validation.ps1`

Executa validação completa em 7 etapas + monitoramento contínuo.

#### Uso

```powershell
# Validação padrão (3 minutos de monitoramento)
.\tests\post-installation-validation.ps1

# Validação estendida (5 minutos)
.\tests\post-installation-validation.ps1 -TestDurationMinutes 5
```

#### O que é validado

✅ Instalação dos arquivos  
✅ Tarefa agendada configurada  
✅ Regra de firewall ativa  
✅ Arquivo de log criado e ativo  
✅ Processo PowerShell rodando  
✅ Heartbeats sendo enviados (a cada 60s)  
✅ Métricas sendo coletadas (a cada 5min)  

#### Resultados

- **✓ 100% Aprovado**: Agente totalmente funcional
- **⚠ Parcial**: Agente funciona mas precisa atenção
- **✗ Falhou**: Agente não está funcionando

### 2. API de Health Check

**Endpoint**: `/functions/v1/validate-agent-health`

Verifica a saúde de um agente específico via API.

#### Uso

```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/validate-agent-health \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentName": "SERVIDOR-01"}'
```

#### Resposta

```json
{
  "healthy": true,
  "agentName": "SERVIDOR-01",
  "score": 100,
  "checks": {
    "heartbeat": {
      "healthy": true,
      "lastSeen": "2025-01-11T14:30:00Z",
      "ageMinutes": 2
    },
    "metrics": {
      "healthy": true,
      "lastSeen": "2025-01-11T14:28:00Z",
      "ageMinutes": 4,
      "latest": {
        "cpu": 15.5,
        "memory": 45.2,
        "disk": 68.3
      }
    },
    "alerts": {
      "healthy": true,
      "unacknowledgedCount": 0,
      "recent": []
    },
    "agent": {
      "status": "active",
      "osType": "Windows",
      "osVersion": "10.0.19045",
      "hostname": "SRV-WEB-01",
      "enrolledAt": "2025-01-11T14:00:00Z"
    }
  }
}
```

### 3. Dashboard Web

Acesse `/admin/monitoring-advanced` para visualização em tempo real.

#### Features

- Status de todos os agentes
- Heartbeat em tempo real
- Métricas de sistema (CPU, RAM, Disco)
- Alertas não reconhecidos
- Gráficos de tendência

## Fluxo de Validação Recomendado

### Passo 1: Instalação

```powershell
# Execute o instalador como Administrador
.\cybershield-installer-windows-AGENT-01.ps1
```

### Passo 2: Aguarde 2 minutos

Dê tempo para o agente:
- Iniciar a tarefa agendada
- Enviar primeiro heartbeat
- Coletar primeiras métricas

### Passo 3: Execute Validação

```powershell
# Baixe o script de validação
Invoke-WebRequest -Uri "https://seu-projeto.com/validation.ps1" -OutFile "validation.ps1"

# Execute
.\validation.ps1
```

### Passo 4: Verifique Dashboard

Acesse o dashboard web e confirme:
- Agente aparece como "Online" (verde)
- Última heartbeat < 5 minutos
- Métricas sendo exibidas

### Passo 5: Monitoramento Contínuo

Configure alertas para:
- Heartbeat não recebido > 10 minutos
- Métricas não recebidas > 15 minutos
- Uso alto de recursos (CPU > 90%, RAM > 90%, Disco > 95%)

## Critérios de Aprovação

### 🟢 100% Funcional

- ✅ Todos os 7 testes passam
- ✅ Heartbeat recebido nos últimos 5 minutos
- ✅ Métricas recebidas nos últimos 10 minutos
- ✅ Zero alertas críticos
- ✅ Health Score = 100

### 🟡 Funcional com Ressalvas

- ✅ 5-6 testes passam
- ✅ Heartbeat recebido nos últimos 15 minutos
- ⚠️ Métricas podem estar atrasadas
- ⚠️ Alguns alertas menores
- 📊 Health Score = 60-99

### 🔴 Não Funcional

- ❌ Menos de 5 testes passam
- ❌ Heartbeat > 15 minutos ou ausente
- ❌ Métricas ausentes
- ❌ Múltiplos alertas críticos
- 📊 Health Score < 60

## Troubleshooting

### Problema: Nenhum heartbeat detectado

**Diagnóstico:**
```powershell
# Verificar se tarefa está rodando
Get-ScheduledTask -TaskName "CyberShield Agent"

# Ver logs
Get-Content C:\CyberShield\logs\agent.log -Tail 50
```

**Solução:**
```powershell
# Reiniciar tarefa
Stop-ScheduledTask -TaskName "CyberShield Agent"
Start-ScheduledTask -TaskName "CyberShield Agent"
```

### Problema: Métricas não são enviadas

**Diagnóstico:**
```powershell
# Testar coleta manual
Get-CimInstance Win32_Processor
Get-CimInstance Win32_OperatingSystem
```

**Solução:**
```powershell
# Reinstalar agente
# O script detectará instalação existente e substituirá
.\cybershield-installer-windows-AGENT-01.ps1
```

### Problema: Firewall bloqueando

**Diagnóstico:**
```powershell
# Verificar regra de firewall
Get-NetFirewallRule -DisplayName "CyberShield Agent"
```

**Solução:**
```powershell
# Recriar regra
Remove-NetFirewallRule -DisplayName "CyberShield Agent"
New-NetFirewallRule -DisplayName "CyberShield Agent" `
    -Direction Outbound `
    -Action Allow `
    -Protocol TCP `
    -RemotePort 443
```

### Problema: Erros no log

**Diagnóstico:**
```powershell
# Buscar erros críticos
Select-String -Path "C:\CyberShield\logs\agent.log" -Pattern "ERROR|FATAL|CRITICAL"
```

**Solução:**
- Anote a mensagem de erro específica
- Verifique conectividade de rede
- Confirme que token e HMAC secret estão corretos
- Entre em contato com suporte se persistir

## Testes Automatizados (CI/CD)

### GitHub Actions

```yaml
name: Validate Agent Installation

on:
  push:
    branches: [ main ]

jobs:
  validate:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
      
      - name: Install Agent
        run: |
          .\cybershield-installer-windows-TEST.ps1
        shell: powershell
      
      - name: Wait for Agent Startup
        run: Start-Sleep -Seconds 120
        shell: powershell
      
      - name: Run Validation
        run: |
          $result = .\tests\post-installation-validation.ps1 -TestDurationMinutes 2
          if ($LASTEXITCODE -ne 0) {
            throw "Agent validation failed with exit code $LASTEXITCODE"
          }
        shell: powershell
      
      - name: Upload Logs
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: agent-logs
          path: C:\CyberShield\logs\
```

## Métricas de Sucesso

### SLA Targets

- **Uptime**: > 99.9%
- **Heartbeat Latency**: < 5 segundos
- **Metrics Collection**: 100% de sucesso
- **Alert Response Time**: < 2 minutos

### KPIs

- Taxa de instalação bem-sucedida: > 95%
- Taxa de validação 100% aprovada: > 90%
- Tempo médio para detecção de problemas: < 10 minutos
- Tempo médio para resolução: < 1 hora

## Suporte

### Documentação Adicional

- [README.md](./README.md) - Visão geral do projeto
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Guia de testes completo
- [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) - Solução de problemas

### Contato

- **Email**: gamehousetecnologia@gmail.com
- **WhatsApp**: (34) 98443-2835
- **Horário**: Segunda a Sexta, 9h-18h (GMT-3)

### Logs para Suporte

Ao abrir um ticket de suporte, inclua:

```powershell
# Coletar informações do sistema
$info = @{
    Hostname = $env:COMPUTERNAME
    OS = (Get-CimInstance Win32_OperatingSystem).Caption
    PSVersion = $PSVersionTable.PSVersion.ToString()
    TaskStatus = (Get-ScheduledTask -TaskName "CyberShield Agent").State
    LogTail = Get-Content C:\CyberShield\logs\agent.log -Tail 100
}

$info | ConvertTo-Json | Out-File diagnostic-report.json
```

Envie o arquivo `diagnostic-report.json` junto com sua solicitação.
