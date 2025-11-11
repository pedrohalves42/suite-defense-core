# Validação Pós-Instalação do CyberShield Agent

Este diretório contém scripts de validação para garantir que o agente CyberShield foi instalado e está funcionando corretamente.

## Script de Validação: `post-installation-validation.ps1`

### O que ele faz

O script executa uma verificação completa em 7 etapas:

1. **Verificação de Instalação**
   - Verifica se os diretórios foram criados
   - Confirma presença do script do agente
   - Valida estrutura de diretórios de logs

2. **Agendador de Tarefas**
   - Verifica se a tarefa "CyberShield Agent" existe
   - Confirma se está em execução
   - Mostra histórico de última execução

3. **Firewall**
   - Valida regra de firewall
   - Confirma se está habilitada

4. **Arquivo de Log**
   - Verifica existência do log
   - Mostra última modificação
   - Detecta erros críticos nos logs

5. **Processos Ativos**
   - Verifica se o processo PowerShell do agente está rodando

6. **Heartbeats**
   - Analisa logs buscando heartbeats enviados
   - Conta quantos foram detectados
   - Mostra o último heartbeat

7. **Métricas do Sistema**
   - Verifica envio de métricas (CPU, RAM, Disco)
   - Conta quantas métricas foram enviadas
   - Mostra a última métrica

### Teste de Operação Contínua

Após as verificações básicas, o script monitora a operação do agente por **3 minutos** (configurável), verificando:
- Crescimento do arquivo de log
- Novos heartbeats sendo enviados
- Novas métricas sendo coletadas

## Como Usar

### Uso Básico

```powershell
# Executar como Administrador
.\post-installation-validation.ps1
```

### Com Parâmetros

```powershell
# Monitorar por 5 minutos
.\post-installation-validation.ps1 -TestDurationMinutes 5

# Especificar nome do agente
.\post-installation-validation.ps1 -AgentName "SERVIDOR-01"
```

## Resultados Possíveis

### ✓ Validação 100% Aprovada
- Todos os testes passaram
- Heartbeats e métricas detectados
- Agente está 100% funcional
- **Exit Code: 0**

### ⚠ Validação Parcial
- Pelo menos 5 testes passaram
- Heartbeats detectados
- Alguns componentes precisam atenção
- **Exit Code: 1**

### ✗ Validação Falhou
- Menos de 5 testes passaram
- Nenhum heartbeat detectado
- Agente não está funcionando
- **Exit Code: 2**

## Interpretando os Resultados

### Heartbeats
- **Esperado**: 1 heartbeat a cada 60 segundos
- **Mínimo aceitável**: 1 heartbeat em 3 minutos

### Métricas
- **Esperado**: 1 envio de métricas a cada 5 minutos
- **Mínimo aceitável**: 1 envio em 10 minutos

### Arquivo de Log
- **Deve estar crescendo**: Indica que o agente está ativo
- **Sem erros críticos**: Não deve haver "ERROR", "FATAL" ou "CRITICAL"

## Troubleshooting

### Agente não está enviando heartbeats

```powershell
# Verificar se a tarefa está rodando
Get-ScheduledTask -TaskName "CyberShield Agent" | Format-List

# Reiniciar a tarefa
Stop-ScheduledTask -TaskName "CyberShield Agent"
Start-ScheduledTask -TaskName "CyberShield Agent"

# Ver logs detalhados
Get-Content C:\CyberShield\logs\agent.log -Tail 50
```

### Tarefa não está rodando

```powershell
# Iniciar manualmente
Start-ScheduledTask -TaskName "CyberShield Agent"

# Se falhar, verificar logs do Event Viewer
Get-EventLog -LogName Application -Source "Task Scheduler" -Newest 20
```

### Métricas não estão sendo enviadas

```powershell
# Verificar se o PowerShell consegue executar comandos de sistema
Get-Process | Select-Object -First 5
Get-CimInstance Win32_Processor
Get-CimInstance Win32_OperatingSystem

# Testar manualmente o script do agente
cd C:\CyberShield
powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent.ps1 -AgentToken "seu_token" -HmacSecret "seu_secret" -ServerUrl "url_do_servidor"
```

## Integração com CI/CD

Este script pode ser usado em pipelines de CI/CD para validar instalações automatizadas:

```yaml
- name: Validate Agent Installation
  run: |
    $result = .\tests\post-installation-validation.ps1 -TestDurationMinutes 2
    if ($LASTEXITCODE -ne 0) {
      throw "Agent validation failed"
    }
```

## Suporte

Se a validação falhar consistentemente:

1. Verifique os logs em `C:\CyberShield\logs\agent.log`
2. Confirme conectividade de rede com o servidor
3. Verifique se há regras de proxy/firewall corporativo bloqueando
4. Entre em contato com o suporte:
   - **Email**: gamehousetecnologia@gmail.com
   - **WhatsApp**: (34) 98443-2835
