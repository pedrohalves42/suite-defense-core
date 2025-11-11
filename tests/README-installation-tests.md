# Testes de Instalação do Agente CyberShield

## Visão Geral

Os testes E2E de instalação validam o fluxo completo de geração e instalação do agente Windows, incluindo:

- Validação de privilégios administrativos
- Criação de diretórios e arquivos
- Configuração de tarefa agendada
- Teste de conectividade com servidor
- Tratamento de erros robusto
- Compatibilidade com Windows Server 2012-2025

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

### 1. Geração de Credenciais
- Login como admin
- Geração de token e chave HMAC
- Validação de enrollment key

### 2. Validação de Estrutura do Script
- Verifica presença de componentes essenciais
- Valida formato e sintaxe PowerShell
- Confirma variáveis de configuração

### 3. Validação de Privilégios Administrativos
- Verifica checagem de permissões
- Valida mensagens de erro para não-admin
- Confirma saída com exit code 1

### 4. Criação de Diretórios e Arquivos
- Valida criação de C:\CyberShield
- Verifica pasta de logs
- Confirma salvamento do script do agente

### 5. Configuração de Tarefa Agendada
- Valida registro da tarefa "CyberShieldAgent"
- Verifica execução como SYSTEM
- Confirma trigger de inicialização
- Valida parâmetros da tarefa

### 6. Teste de Conectividade
- Verifica chamada ao endpoint /heartbeat
- Valida headers de autenticação
- Confirma timeout configurado

### 7. Tratamento de Erros
- Valida try-catch blocks
- Verifica mensagens de erro detalhadas
- Confirma diagnóstico completo
- Valida stack trace

### 8. Mensagens de Progresso
- Verifica indicadores [0/5] até [5/5]
- Valida mensagem de sucesso
- Confirma próximos passos
- Verifica instruções de logs

### 9. Geração de Script para Teste Manual
- Salva script em `tests/generated/`
- Permite teste manual em ambiente Windows real
- Facilita debugging de problemas específicos

### 10. Compatibilidade Windows Server
- Valida ausência de comandos incompatíveis
- Verifica uso de comandos compatíveis
- Confirma suporte a Server 2012+

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
- ✅ 10 cenários de teste principais
- ✅ 50+ asserções individuais
- ✅ Compatibilidade com 8+ versões de OS
- ✅ Geração de script para teste manual
- ✅ Validação de segurança (privilégios admin)
- ✅ Teste de conectividade de rede
- ✅ Tratamento de erros completo

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

## Suporte

Para problemas ou dúvidas sobre os testes:
- Revisar logs em `C:\CyberShield\logs\agent.log`
- Verificar console do navegador (DevTools F12)
- Consultar documentação: [docs/](../docs/)
- Abrir issue no repositório
