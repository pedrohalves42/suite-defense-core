# 🧪 Testes de Instalação do Agente CyberShield

## 📋 Visão Geral

Este guia cobre **três tipos de testes**:

1. **Testes E2E Automatizados** (Playwright) - Validam geração de instaladores
2. **Testes de Validação em VM** (PowerShell/Bash) - Testam instalação real completa
3. **Testes Manuais** - Verificação manual em ambiente real

Os testes validam:
- ✅ Geração de credenciais via dashboard
- ✅ Instalação one-click (Windows/Linux)
- ✅ Heartbeats e métricas
- ✅ Execução de jobs
- ✅ Operação contínua
- ✅ Compatibilidade com Windows Server 2012-2025 e Linux

## Linux Installation

### Automated E2E Tests

```bash
# Run Linux installation tests
npx playwright test e2e/linux-agent-installation.spec.ts

# Run with UI
npx playwright test e2e/linux-agent-installation.spec.ts --ui

# Run specific test
npx playwright test e2e/linux-agent-installation.spec.ts -g "should generate valid Linux installation script"
```

### Manual Testing on Linux

#### Prerequisites
- Ubuntu 18.04+, CentOS 7+, or Debian 9+
- Root/sudo access
- Internet connectivity

#### Test Steps

1. **Download the installer script**
   ```bash
   # From the web interface or use curl
   curl -O https://your-server.com/path/to/cybershield-agent-linux.sh
   ```

2. **Make it executable**
   ```bash
   chmod +x cybershield-agent-linux.sh
   ```

3. **Run the installer**
   ```bash
   sudo bash cybershield-agent-linux.sh <AGENT_TOKEN> <HMAC_SECRET> <SERVER_URL> [POLL_INTERVAL]
   ```

4. **Verify installation**
   ```bash
   # Check service status
   sudo systemctl status cybershield-agent
   
   # Check if service is enabled
   sudo systemctl is-enabled cybershield-agent
   
   # View logs
   sudo journalctl -u cybershield-agent -n 50
   
   # Check configuration
   sudo cat /opt/cybershield/agent.conf
   
   # Verify directories
   ls -la /opt/cybershield
   ls -la /var/log/cybershield
   ```

5. **Test service operations**
   ```bash
   # Stop service
   sudo systemctl stop cybershield-agent
   
   # Start service
   sudo systemctl start cybershield-agent
   
   # Restart service
   sudo systemctl restart cybershield-agent
   
   # View real-time logs
   sudo journalctl -u cybershield-agent -f
   ```

## Windows Installation

## Executar Testes E2E

### Pré-requisitos

```bash
npm install
```

### Executar todos os testes de instalação

```bash
npx playwright test e2e/agent-installation.spec.ts
```

### Executar teste específico

```bash
npx playwright test e2e/agent-installation.spec.ts -g "Validar checagem de privilégios"
```

### Executar com interface gráfica

```bash
npx playwright test e2e/agent-installation.spec.ts --ui
```

### Gerar relatório HTML

```bash
npx playwright test e2e/agent-installation.spec.ts --reporter=html
npx playwright show-report
```

## Testes Implementados

A suíte E2E possui **14 cenários principais** + 1 teste de validação standalone:

### Windows Agent Installation E2E (14 testes)

#### 1. Geração de Credenciais
- Login como admin
- Geração de token e chave HMAC
- Validação de enrollment key

#### 2. Validação de Estrutura do Script
- Verifica presença de componentes essenciais
- Valida formato e sintaxe PowerShell
- Confirma variáveis de configuração

#### 3. Validação de Privilégios Administrativos
- Verifica checagem de permissões
- Valida mensagens de erro para não-admin
- Confirma saída com exit code 1

#### 4. Criação de Diretórios e Arquivos
- Valida criação de C:\CyberShield
- Verifica pasta de logs
- Confirma salvamento do script do agente

#### 5. Configuração de Tarefa Agendada
- Valida registro da tarefa "CyberShieldAgent"
- Verifica execução como SYSTEM
- Confirma trigger de inicialização
- Valida parâmetros da tarefa

#### 6. Teste de Conectividade
- Verifica chamada ao endpoint /heartbeat
- Valida headers de autenticação
- Confirma timeout configurado

#### 7. Tratamento de Erros
- Valida try-catch blocks
- Verifica mensagens de erro detalhadas
- Confirma diagnóstico completo
- Valida stack trace

#### 8. Mensagens de Progresso
- Verifica indicadores [0/5] até [5/5]
- Valida mensagem de sucesso
- Confirma próximos passos
- Verifica instruções de logs

#### 9. Geração de Script para Teste Manual
- Salva script em `tests/generated/`
- Permite teste manual em ambiente Windows real
- Facilita debugging de problemas específicos

#### 10. Compatibilidade Windows Server
- Valida ausência de comandos incompatíveis
- Verifica uso de comandos compatíveis
- Confirma suporte a Server 2012+

#### 11. Parameter Validation
- Verifica presença de `param()` com `Mandatory=$true`
- Valida validação de formato de `$AgentToken`, `$HmacSecret`, `$ServerUrl`

#### 12. Retry Logic
- Verifica lógica de retry em `Send-Heartbeat`
- Valida backoff exponencial ou linear entre tentativas
- Confirma número máximo de retentativas

#### 13. System Health Test
- Verifica presença de `Test-SystemHealth`
- Valida retry em testes de conectividade
- Confirma diagnóstico de saúde do sistema

#### 14. Error Logging
- Valida níveis de log (`[ERROR]`, `[INFO]`, `[WARNING]`)
- Verifica gravação de logs em arquivo
- Confirma rastreabilidade de erros

### Agent Script Validation (1 teste standalone)

- Valida script versionado do agente Windows (`cybershield-agent-windows-v5.ps1`)
- Verifica parâmetros obrigatórios, funções principais e formato HMAC
- Confirma compatibilidade com Windows Server 2012+

## Teste Manual em Windows

### 1. Obter Script de Instalação

Após executar os testes E2E, o script será salvo em:
```
tests/generated/install-agent-TIMESTAMP.ps1
```

### 2. Copiar para Máquina Windows

Transfira o arquivo para a máquina Windows usando:
- USB drive
- RDP copy-paste
- Compartilhamento de rede
- Download direto (se hospedado)

### 3. Executar como Administrador

**Opção 1: Via Explorer**
```
1. Clique com botão direito no arquivo .ps1
2. Selecione "Executar como Administrador"
3. Confirme UAC prompt
```

**Opção 2: Via PowerShell Admin**
```powershell
# Abrir PowerShell como Administrador
Start-Process powershell -Verb RunAs

# No PowerShell Admin:
Set-ExecutionPolicy Bypass -Scope Process -Force
cd C:\Caminho\Para\Script
.\install-agent-TIMESTAMP.ps1
```

### 4. Verificar Instalação

**Verificar Tarefa Agendada:**
```powershell
Get-ScheduledTask -TaskName "CyberShieldAgent"
```

**Verificar Logs:**
```powershell
Get-Content C:\CyberShield\logs\agent.log -Tail 20 -Wait
```

**Verificar Status no Dashboard:**
```
1. Acessar dashboard web
2. Navegar para /agent-monitoring
3. Confirmar que agente aparece como "Online"
4. Verificar timestamp de último heartbeat
```

## Compatibilidade de Sistemas Operacionais

### ✅ Suportados (Testado)

- **Windows Server 2012** (PowerShell 3.0+)
- **Windows Server 2012 R2** (PowerShell 4.0+)
- **Windows Server 2016** (PowerShell 5.1)
- **Windows Server 2019** (PowerShell 5.1)
- **Windows Server 2022** (PowerShell 5.1)
- **Windows Server 2025** (PowerShell 7.x)
- **Windows 8.1** (PowerShell 4.0+)
- **Windows 10** (PowerShell 5.1)
- **Windows 11** (PowerShell 5.1+)

### ⚠️ Requer Atenção

- **Windows Server 2012 (sem R2)**: Requer WMF 3.0 instalado
- **Windows 8**: Requer atualização para 8.1 ou instalar WMF 4.0

### ❌ Não Suportados

- **Windows Server 2008 R2**: PowerShell 2.0 (muito antigo)
- **Windows 7**: PowerShell 2.0 (EOL)
- **Windows Vista e anteriores**: Não suportado

## Requisitos de Sistema

### Mínimo
- **PowerShell**: 3.0 ou superior
- **RAM**: 512 MB disponível
- **Disco**: 100 MB livres em C:\
- **Rede**: Conectividade HTTPS (porta 443)
- **Permissões**: Administrador local

### Recomendado
- **PowerShell**: 5.1 ou superior
- **RAM**: 1 GB disponível
- **.NET Framework**: 4.5+ (para Server 2012)
- **Firewall**: Regra de saída para *.supabase.co

## Troubleshooting

### Erro: "Execution Policy"
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
```

### Erro: "Task Scheduler não está disponível"
```powershell
# Verificar serviço
Get-Service -Name Schedule

# Iniciar se parado
Start-Service -Name Schedule
```

### Erro: "Não foi possível conectar ao servidor"
```powershell
# Testar conectividade
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443

# Verificar firewall
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*CyberShield*"}
```

### Erro: "Access Denied" ao criar tarefa
```powershell
# Verificar se está rodando como Admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Is Admin: $isAdmin"
```

### Logs não aparecem
```powershell
# Verificar permissões da pasta
icacls C:\CyberShield\logs

# Verificar se tarefa está rodando
Get-ScheduledTask -TaskName "CyberShieldAgent" | Select-Object State, LastRunTime, LastTaskResult
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Agent Installation Tests

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'agent-scripts/**'
      - 'src/pages/AgentInstaller.tsx'
      - 'e2e/agent-installation.spec.ts'

jobs:
  test-installation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npx playwright install
      - name: Run installation tests
        run: npx playwright test e2e/agent-installation.spec.ts
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-results
          path: playwright-report/
```

## Métricas de Teste

Os testes validam:
- ✅ 14 cenários de teste principais + 1 validação standalone
- ✅ 70+ asserções individuais
- ✅ Compatibilidade com 8+ versões de OS
- ✅ Geração de script para teste manual
- ✅ Validação de segurança (privilégios admin)
- ✅ Teste de conectividade de rede
- ✅ Tratamento de erros completo
- ✅ Parameter validation e retry logic
- ✅ System health checks
- ✅ Error logging estruturado

## Próximos Passos

1. **Executar testes E2E localmente**
   ```bash
   npx playwright test e2e/agent-installation.spec.ts
   ```

2. **Testar em ambiente Windows real**
   - Usar script gerado em `tests/generated/`
   - Validar em diferentes versões de Windows Server

3. **Revisar relatório de testes**
   ```bash
   npx playwright show-report
   ```

4. **Integrar ao CI/CD**
   - Adicionar ao pipeline de GitHub Actions
   - Executar automaticamente em cada commit

---

## 🔬 Testes de Validação em VM (Completos)

### 📦 Windows - Teste Completo em VM

Para testar a instalação completa do zero em uma VM Windows:

```powershell
# 1. Gerar instalação no dashboard (/installer)
# 2. Copiar comando one-click gerado
# 3. Executar em PowerShell Admin:
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/xyz... | iex

# 4. Validar instalação automaticamente
Invoke-WebRequest -Uri "https://seudominio.com/scripts/post-installation-validation.ps1" -OutFile "validation.ps1"
.\validation.ps1 -TestDurationMinutes 3

# 5. (Opcional) Teste completo de 5 minutos
.\tests\windows-installation-test.ps1 `
    -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" `
    -EnrollmentKey "seu-enrollment-key" `
    -TestDuration 300
```

### 🐧 Linux - Teste Completo em VM

Para testar a instalação completa do zero em uma VM Linux:

```bash
# 1. Gerar instalação no dashboard (/installer)
# 2. Copiar comando one-click gerado
# 3. Executar:
curl -sL https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/abc... | sudo bash

# 4. Verificar status
sudo systemctl status cybershield-agent
sudo tail -f /var/log/cybershield/agent.log

# 5. (Opcional) Teste completo de 5 minutos
wget https://raw.githubusercontent.com/.../linux-installation-test.sh
chmod +x linux-installation-test.sh
sudo ./linux-installation-test.sh \
    -s "https://iavbnmduxpxhwubqrzzn.supabase.co" \
    -k "seu-enrollment-key" \
    -d 300
```

### 📊 Interpretação dos Resultados

#### ✅ 100% Aprovado (Verde)
```
Tests Passed: 7 / 7 (100%)
✓ INSTALLATION VALIDATION: PASSED
```
- Instalação perfeita, pronto para produção

#### ⚠️ Aprovação Parcial (85-99%)
```
Tests Passed: 6 / 7 (85%)
⚠ VALIDATION PARTIAL
```
- Funcionalidade básica OK, revisar componentes com falha

#### ❌ Falha (<85%)
```
Tests Passed: 3 / 7 (42%)
✗ INSTALLATION VALIDATION: FAILED
```
- Problemas críticos, não usar em produção

### 🔧 Troubleshooting Específico de VM

#### Windows VM
- **Erro "Execution Policy"**: `Set-ExecutionPolicy Bypass -Scope Process`
- **Firewall bloqueando**: Verificar `Get-NetFirewallRule -DisplayName "CyberShield*"`
- **Tarefa não inicia**: `Start-ScheduledTask -TaskName "CyberShield Agent"`

#### Linux VM
- **Permissões**: Sempre usar `sudo`
- **Dependências**: `sudo apt-get install -y curl jq openssl` (Ubuntu)
- **Serviço não inicia**: `sudo journalctl -u cybershield-agent -n 100`

---

## Suporte

Para problemas ou dúvidas sobre os testes:
- **Email**: gamehousetecnologia@gmail.com
- **WhatsApp**: (34) 98443-2835
- **Logs Windows**: `C:\CyberShield\logs\agent.log`
- **Logs Linux**: `/var/log/cybershield/agent.log`
- **Documentação**: [docs/](../docs/)
- **Console DevTools**: F12 no navegador
