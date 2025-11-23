# Guia de Análise do installer.log

Este documento detalha como interpretar o `installer.log` do CyberShield Agent para diagnosticar problemas de instalação.

## Estrutura do Log

O `installer.log` é dividido em várias seções críticas:

1. **Informações do Sistema**
2. **Diagnóstico de Segurança**
3. **Unblock-File e Zone.Identifier**
4. **Criação da Scheduled Task**
5. **Validação de Execução do Agent**

## 1. Informações do Sistema

### Exemplo de Log Normal

```log
[2025-11-23 16:54:00] [INFO] === Inicio da instalacao ===
[2025-11-23 16:54:00] [INFO] Usuario: WIN-SERVER-01\Administrador
[2025-11-23 16:54:00] [INFO] Timestamp: 2025-11-23 16:54:00
[2025-11-23 16:54:00] [INFO] PowerShell Version: 5.1.19041.5198
[2025-11-23 16:54:00] [INFO] Versao do Instalador: v3.3.1-PAYLOAD-FIX
```

### O que Validar

- ✅ **PowerShell 5.1 ou superior**: Versão mínima requerida
- ✅ **Privilégios de Administrador**: Necessário para criar Scheduled Task
- ✅ **Versão do instalador**: Confirmar que está usando a versão correta

## 2. Diagnóstico de Segurança

Esta é a seção **MAIS CRÍTICA** do log.

### ExecutionPolicy

#### Cenário 1: Sem GPO (Normal) ✅

```log
[INFO] === Diagnostico de Restricoes de Seguranca ===
[INFO] ExecutionPolicy [MachinePolicy]: Undefined
[INFO] ExecutionPolicy [UserPolicy]: Undefined
[INFO] ExecutionPolicy [Process]: Unrestricted
[INFO] ExecutionPolicy [CurrentUser]: RemoteSigned
[INFO] ExecutionPolicy [LocalMachine]: RemoteSigned
```

**Interpretação**: Sem restrições de GPO. O instalador pode controlar a ExecutionPolicy via parâmetro `-ExecutionPolicy`.

#### Cenário 2: GPO Forçando AllSigned ⚠️ CRÍTICO

```log
[INFO] === Diagnostico de Restricoes de Seguranca ===
[INFO] ExecutionPolicy [MachinePolicy]: AllSigned    <-- PROBLEMA
[INFO] ExecutionPolicy [UserPolicy]: Undefined
[INFO] ExecutionPolicy [Process]: Bypass
[WARN] AVISO CRITICO: GPO forcando ExecutionPolicy=AllSigned
[WARN] Scripts nao-assinados serao bloqueados independente de -ExecutionPolicy
```

**Interpretação**: 
- 🔴 **GPO forçando assinatura de scripts**
- 🔴 O parâmetro `-ExecutionPolicy Bypass/Unrestricted` **É IGNORADO**
- 🔴 Apenas scripts **assinados com certificado de código** podem executar

**Solução**:
1. **Curto Prazo**: Assinar scripts PowerShell com certificado válido
2. **Longo Prazo**: Migrar para EXE compilado (não depende de ExecutionPolicy)

#### Cenário 3: GPO Forçando Restricted ⚠️ CRÍTICO

```log
[INFO] ExecutionPolicy [MachinePolicy]: Restricted
```

**Interpretação**: 
- 🔴 **Mais restritivo que AllSigned**
- 🔴 **NENHUM** script PowerShell pode executar, mesmo assinados
- 🔴 Apenas comandos interativos são permitidos

**Solução**:
- **Única opção**: Migrar para EXE compilado

### LanguageMode

#### LanguageMode Normal ✅

```log
[INFO] LanguageMode: FullLanguage
```

**Interpretação**: Sem restrições. Todas as funcionalidades do PowerShell disponíveis.

#### LanguageMode Restrito ⚠️ CRÍTICO

```log
[INFO] LanguageMode: ConstrainedLanguage
[WARN] AVISO CRITICO: ConstrainedLanguage Mode ativo
[WARN] Causa provavel: Device Guard / WDAC
```

**Interpretação**:
- 🔴 **Device Guard ou WDAC (Windows Defender Application Control) ativo**
- 🔴 Funcionalidades .NET e criptografia podem falhar
- 🔴 Agent pode executar, mas operações críticas falharão

**Solução**:
- Migrar para EXE compilado e **assinado** com certificado confiável

## 3. Unblock-File e Zone.Identifier

### Cenário Normal ✅

```log
[INFO] Script do agente gravado em C:\CyberShield\cybershield-agent-teste.ps1
[INFO] Tentando Unblock-File...
[SUCCESS] Script desbloqueado com sucesso
[INFO] Verificando Zone.Identifier...
[INFO] Zone.Identifier NAO encontrado apos Unblock-File.
```

**Interpretação**: Script desbloqueado com sucesso. Não será marcado como "baixado da internet".

### Cenário Problemático ⚠️

```log
[INFO] Tentando Unblock-File...
[WARN] Falha ao desbloquear arquivo: Access is denied
[INFO] Tentando remover Zone.Identifier manualmente...
[ERROR] CRITICO: Zone.Identifier ainda presente apos tentativa de remocao.
```

**Interpretação**:
- 🔴 Sistema não permite remover o `Zone.Identifier` (Alternate Data Stream)
- 🔴 PowerShell pode bloquear a execução do script, mesmo com `-ExecutionPolicy Bypass`
- 🔴 Provável impacto de GPO ou política de segurança empresarial

**Solução**:
1. Assinar scripts com certificado de código
2. Migrar para EXE (não usa ADS Zone.Identifier)

## 4. Criação da Scheduled Task

### Cenário Normal ✅

```log
[SUCCESS] Scheduled Task 'CyberShieldAgent-teste' criada com sucesso
[INFO] Estado: Ready
[INFO] Last Task Result: 0
```

**Interpretação**: Task criada e executada com sucesso.

### Cenários de Erro

#### Error Code 1 ⚠️

```log
[SUCCESS] Scheduled Task 'CyberShieldAgent-teste' criada com sucesso
[INFO] Last Task Result: 1
[WARN] Task retornou codigo de erro: 1
[WARN] Codigo 1: Erro generico. Verifique argumentos da task.
```

**Interpretação**:
- 🔴 Task foi criada, mas **falhou ao executar**
- 🔴 Causa provável: Argumentos malformados OU erro de sintaxe no script

**Diagnóstico**:
```powershell
# Ver detalhes da task
Get-ScheduledTaskInfo -TaskName "CyberShieldAgent-teste"

# Ver log de eventos do Task Scheduler
Get-EventLog -LogName Application -Source "Task Scheduler" -Newest 10
```

#### Error Code 267009 ⚠️

```log
[INFO] Last Task Result: 267009
```

**Interpretação**: Task não pôde ser executada (bloqueio de segurança ou permissões)

#### Error Code 0xC0000... ⚠️

```log
[INFO] Last Task Result: 3221225786
```

**Interpretação**: Erro de acesso ou permissões (convertido de 0xC000xxxx)

## 5. Validação de Execução do Agent

### Cenário Normal ✅

```log
[INFO] Aguardando 60 segundos para agent iniciar...
[SUCCESS] Agent iniciou corretamente
[SUCCESS] Bootstrap concluido
[SUCCESS] Loop principal ativo
[SUCCESS] Heartbeat enviado (200)
```

**Interpretação**: Agent funcionando perfeitamente.

### Cenário: Agent Não Iniciou ⚠️

```log
[INFO] Aguardando 60 segundos para agent iniciar...
[WARN] Agent nao iniciou apos 60 segundos
[ERROR] Log contem apenas: [INFO] Agent log criado pelo instalador
```

**Interpretação**:
- 🔴 Script **nunca foi executado**
- 🔴 Scheduled Task rodou, mas o PowerShell não conseguiu carregar/executar o script

**Causas Prováveis**:
1. **ExecutionPolicy bloqueando** (GPO AllSigned/Restricted)
2. **Erro de sintaxe no script** (InvalidVariableReferenceWithDrive, ParserError)
3. **Zone.Identifier bloqueando**
4. **Argumentos da Task malformados**

**Diagnóstico**:
```powershell
# Executar agent manualmente para ver erro
cd C:\CyberShield
powershell.exe -ExecutionPolicy Unrestricted -NoProfile -File ".\cybershield-agent-teste.ps1" `
  -ServerUrl "https://..." `
  -AgentToken "..." `
  -HmacSecret "..." `
  -AgentName "teste"
```

### Cenário: Agent Iniciou mas Falha 401 ⚠️

```log
[SUCCESS] Agent iniciou corretamente
[SUCCESS] Bootstrap concluido
[ERROR] Heartbeat falhou (Status=401)
[ERROR] Erro de autenticacao (401). Verifique AgentToken / HmacSecret / clock.
```

**Interpretação**:
- ✅ Script está executando
- 🔴 Problema de **autenticação** com o backend

**Causas Prováveis**:
1. **AgentToken inválido** (foi regenerado no dashboard?)
2. **HmacSecret incorreto** (não está em formato hex de 64 caracteres?)
3. **Clock desincronizado** (diferença > 5 minutos entre VM e servidor)
4. **Sintaxe do payload HMAC errada** (resolvido em v3.3.1-PAYLOAD-FIX)

**Solução**:
1. Regenerar credenciais do agent no dashboard
2. Confirmar que `HmacSecret` tem exatamente 64 caracteres hexadecimais
3. Sincronizar relógio do servidor: `w32tm /resync /force`

## Matriz de Diagnóstico Rápido

| Sintoma | Seção do Log | Causa Provável | Solução |
|---------|--------------|----------------|---------|
| `InvalidVariableReferenceWithDrive` | Execução | Sintaxe `:$` no script | ✅ Resolvido em v3.3.1-PAYLOAD-FIX |
| `MachinePolicy: AllSigned` | Segurança | GPO forçando assinatura | Assinar scripts OU migrar para EXE |
| `MachinePolicy: Restricted` | Segurança | GPO bloqueando todos os scripts | Migrar para EXE |
| `LanguageMode: ConstrainedLanguage` | Segurança | Device Guard/WDAC ativo | Migrar para EXE assinado |
| `Zone.Identifier presente` | Unblock-File | ADS não removível | Assinar scripts OU EXE |
| `Last Task Result: 1` | Scheduled Task | Erro no script ou argumentos | Verificar sintaxe e logs |
| `Agent nao iniciou` | Execução | ExecutionPolicy bloqueando | Verificar GPO e executar manualmente |
| `Heartbeat falhou (401)` | Execução | Autenticação inválida | Regenerar credenciais |

## Scripts de Análise Automatizada

Para facilitar a análise, use os scripts auxiliares:

### 1. Análise Completa do installer.log

```powershell
.\scripts\analyze-installer-log.ps1 -LogPath "C:\CyberShield\logs\installer.log"
```

**Output**:
- Resumo das informações básicas
- Problemas de segurança detectados
- Status de Unblock-File
- Resultado da Scheduled Task
- Validação de execução do agent
- Recomendações de próximos passos

### 2. Diagnóstico Standalone de ExecutionPolicy

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\diagnose-executionpolicy.ps1
```

**Output**:
- ExecutionPolicy por escopo (detecta GPO)
- LanguageMode
- Teste de Unblock-File
- Teste de Zone.Identifier
- Simulação de execução com Bypass/Unrestricted
- Relatório com recomendações

## Troubleshooting: Cenários Comuns

### Cenário A: "Agent não aparece no dashboard"

**Checklist**:
1. ✅ `installer.log` mostra `[SUCCESS] Scheduled Task criada`?
2. ✅ `installer.log` mostra `Last Task Result: 0`?
3. ✅ `cybershield-agent-v3.log` contém `[START] Iniciando CyberShield Agent`?
4. ✅ `cybershield-agent-v3.log` contém `[SUCCESS] Heartbeat OK (200)`?

**Se algum desses não estiver presente**, use a matriz de diagnóstico acima para identificar o problema.

### Cenário B: "Agent aparece 'Pending' no dashboard"

**Interpretação**: Agent foi criado, mas nunca enviou heartbeat.

**Checklist**:
1. Ver `cybershield-agent-v3.log`
2. Procurar por `[ERROR]` ou `401`
3. Se tiver `401` → Problema de autenticação
4. Se não tiver `[START]` → Agent não está executando

### Cenário C: "Agent funcionava, agora está offline"

**Interpretação**: Credenciais foram regeneradas ou Task foi desabilitada.

**Checklist**:
1. Ver Scheduled Task: `Get-ScheduledTask -TaskName "CyberShieldAgent-*"`
2. Ver `cybershield-agent-v3.log` para última atividade
3. Se necessário, reinstalar com novas credenciais

## Ferramentas de Diagnóstico

### Verificar Status da Scheduled Task

```powershell
# Listar todas as tasks do CyberShield
Get-ScheduledTask -TaskName "*CyberShield*" | Select-Object TaskName, State, LastRunTime, LastTaskResult

# Ver detalhes de uma task específica
Get-ScheduledTaskInfo -TaskName "CyberShieldAgent-teste"

# Ver XML da task (argumentos completos)
Export-ScheduledTask -TaskName "CyberShieldAgent-teste" | Out-File task.xml
```

### Verificar Logs do Windows Event Viewer

```powershell
# Ver eventos do CyberShield
Get-EventLog -LogName Application -Source "CyberShield" -Newest 10 | 
  Select-Object TimeGenerated, EntryType, Message | Format-List

# Ver eventos do Task Scheduler
Get-EventLog -LogName Application -Source "Task Scheduler" -Newest 10 |
  Where-Object { $_.Message -like "*CyberShield*" } |
  Select-Object TimeGenerated, EntryType, Message | Format-List
```

### Executar Agent Manualmente

```powershell
# Ir para diretório do CyberShield
cd C:\CyberShield

# Executar agent diretamente (verá erros no console)
powershell.exe -ExecutionPolicy Unrestricted -NoProfile -File ".\cybershield-agent-teste.ps1" `
  -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" `
  -AgentToken "seu-token-aqui" `
  -HmacSecret "seu-hmac-secret-aqui" `
  -AgentName "teste"
```

## Próximos Passos

Dependendo do diagnóstico, os próximos passos podem ser:

### Se ExecutionPolicy/GPO Bloqueando

1. **Curto Prazo**: Implementar assinatura de scripts
   - Obter certificado de código (interno ou comercial)
   - Assinar todos os scripts PowerShell
   - Documentar processo para clientes enterprise

2. **Longo Prazo**: Migrar para EXE/Serviço Windows
   - Reescrever lógica do agent em Go/Rust/.NET
   - Registrar como Windows Service
   - Criar MSI installer para deployment enterprise

### Se Problema de Sintaxe

1. Atualizar para **v3.3.1-PAYLOAD-FIX**
2. Verificar sincronização do script: `npm run sync:agent`
3. Validar com ASCII Guard: `npm run ascii:check`

### Se Problema de Autenticação (401)

1. Regenerar credenciais do agent
2. Verificar sincronização de relógio
3. Confirmar formato do HmacSecret (64 hex chars)

## Suporte

Se após seguir este guia o problema persistir:

1. Executar `diagnose-executionpolicy.ps1` e enviar o log
2. Executar `analyze-installer-log.ps1` e copiar o output
3. Enviar os logs:
   - `C:\CyberShield\logs\installer.log`
   - `C:\CyberShield\logs\cybershield-agent-v3.log`
   - `C:\CyberShield\logs\executionpolicy-diagnose.log`
4. Incluir screenshot do Task Scheduler mostrando a task

---

**Última atualização**: 2025-11-23  
**Versão do guia**: 1.0  
**Compatível com**: Installer v3.3.1-PAYLOAD-FIX
