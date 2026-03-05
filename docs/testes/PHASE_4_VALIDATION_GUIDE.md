# Phase 4: VM Validation Guide

## Objetivo
Validar end-to-end a instalacao do agente CyberShield em VM limpa, garantindo que o sistema ASCII enforcement esta funcionando corretamente em producao.

## Pre-requisitos

### Ambiente da VM
- Windows Server 2016, 2019, ou 2022
- PowerShell 5.1 (padrao)
- Privilegios de Administrador
- Acesso a Internet (conectividade com backend)

### Arquivos Necessarios
- `vm-validation-complete.ps1` (script de validacao automatizado)
- Installer gerado pelo dashboard (baixado na VM)

## Passo-a-Passo Completo

### Etapa 1: Gerar Installer no Dashboard

1. **Acessar o Dashboard**
   - URL: https://[seu-dominio]/agent-installer
   - Login como admin/operator

2. **Gerar Novo Agente**
   - Nome do agente: `TEST-ASCII-VALIDATION-FINAL`
   - Clicar em "Generate Installer"
   - Aguardar geracao (5-10 segundos)

3. **Baixar Installer**
   - Clicar no botao de download
   - Arquivo: `cybershield-installer-TEST-ASCII-VALIDATION-FINAL.ps1`
   - Salvar em: `C:\Users\Public\Downloads\`

### Etapa 2: Transferir Script de Validacao para VM

**Opcao A: Download Direto (Recomendado)**
```powershell
# Executar na VM
$url = "https://raw.githubusercontent.com/[seu-repo]/main/scripts/vm-validation-complete.ps1"
$output = "C:\Users\Public\Downloads\vm-validation-complete.ps1"
Invoke-WebRequest -Uri $url -OutFile $output
```

**Opcao B: Copiar Manualmente**
- Copiar conteudo de `scripts/vm-validation-complete.ps1`
- Criar arquivo na VM: `C:\Users\Public\Downloads\vm-validation-complete.ps1`
- Colar conteudo

### Etapa 3: Executar Validacao Completa

**Abrir PowerShell como Administrador:**
```powershell
# Navegar para pasta de downloads
cd C:\Users\Public\Downloads

# Permitir execucao de scripts (se necessario)
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Executar validacao completa
.\vm-validation-complete.ps1 -InstallerPath ".\cybershield-installer-TEST-ASCII-VALIDATION-FINAL.ps1"
```

### Etapa 4: Interpretar Resultados

#### PHASE 1: Pre-Installation Validation

**Testes Executados:**
1. ✅ **File Size** - Deve ser > 10 KB
2. ✅ **ASCII Check** - Nenhum caracter fora do range 0-127
3. ✅ **Emoji Check** - Nenhum emoji detectado
4. ✅ **PS Syntax** - Sintaxe PowerShell 5.1 valida
5. ✅ **Placeholders** - Todos substituidos corretamente
6. ✅ **Agent Functions** - Funcoes criticas presentes
7. ✅ **Jobs v3** - Parametro StartedAt presente
8. ✅ **Encoding** - UTF-8 sem BOM

**Resultado Esperado:**
```
[OK] All critical pre-installation tests passed
Ready to proceed with installation
```

**Se houver falhas:**
- ❌ **ASCII Check FAIL**: Installer contem caracteres nao-ASCII
  - **Acao**: Nao instalar. Reportar bug ao time de dev.
  - **Causa**: ASCII Guard no CI falhou ou foi bypassed.

- ❌ **PS Syntax FAIL**: Erro de sintaxe PowerShell 5.1
  - **Acao**: Nao instalar. Verificar compatibilidade do script.
  - **Causa**: Pode ter codigo PowerShell 7+ no script.

- ❌ **Placeholders FAIL**: Placeholders nao substituidos
  - **Acao**: Nao instalar. Bug critico no serve-installer.
  - **Causa**: Edge Function nao esta substituindo placeholders.

#### PHASE 2: Installation

O script executa o installer automaticamente apos confirmacao (pressione Enter).

**Saida Esperada:**
```
Executing installer...
[OK] Installer execution completed
Waiting 10 seconds for agent initialization...
```

#### PHASE 3: Post-Installation Validation

**Testes Executados:**
1. ✅ **Folder Structure** - `C:\CyberShield` e `C:\CyberShield\logs` existem
2. ✅ **Agent Script** - Script do agente criado e > 10 KB
3. ✅ **Scheduled Task** - Task criada, State = Running/Ready, LastTaskResult = 0
4. ✅ **Log Files** - installer.log e cybershield-agent-v3.log existem
5. ✅ **Heartbeat** - Atividade de heartbeat detectada nos logs

**Resultado Esperado:**
```
[SUCCESS] All validation tests passed

Next steps:
1. Check agent status in dashboard (should be 'Active' with recent heartbeat)
2. Create a test job to validate Jobs v3 functionality
3. Monitor agent logs for any errors: C:\CyberShield\logs\cybershield-agent-v3.log
```

### Etapa 5: Validacao no Dashboard

1. **Acessar Dashboard → Agents**
   - Procurar por: `TEST-ASCII-VALIDATION-FINAL`

2. **Verificar Status do Agente:**
   - ✅ Status: **Active** (bolinha verde)
   - ✅ Last Heartbeat: < 2 minutos atras
   - ✅ OS Type: **Windows**
   - ✅ Hostname: Nome da VM
   - ✅ OS Version: Windows Server 20XX

3. **Verificar Metricas:**
   - CPU, Memory, Disk usage exibidos corretamente

### Etapa 6: Validacao Jobs v3

1. **Criar Job de Teste**
   - Dashboard → Jobs → Create Job
   - Agent: `TEST-ASCII-VALIDATION-FINAL`
   - Type: `command`
   - Payload:
   ```json
   {
     "command": "Get-ComputerInfo | Select-Object -Property CsName, OsArchitecture, WindowsVersion | ConvertTo-Json"
   }
   ```

2. **Aguardar Execucao** (max 2 minutos)

3. **Verificar Resultado:**
   - ✅ Status: **completed**
   - ✅ Output: JSON com informacoes do sistema
   - ✅ Started At: timestamp presente
   - ✅ Finished At: timestamp presente
   - ✅ Execution Time: calculado corretamente

### Etapa 7: Verificacao de Logs na VM

**Opcional: Inspecionar logs detalhados**

```powershell
# Installer log (criacao de pastas, script, task)
Get-Content C:\CyberShield\logs\installer.log -Tail 50

# Agent log (heartbeats, job polling, execucao)
Get-Content C:\CyberShield\logs\cybershield-agent-v3.log -Tail 50

# Verificar Task Scheduler
Get-ScheduledTask -TaskName "CyberShieldAgent-TEST-ASCII-VALIDATION-FINAL" | Format-List *

# Verificar historico da task
Get-ScheduledTask -TaskName "CyberShieldAgent-TEST-ASCII-VALIDATION-FINAL" | Get-ScheduledTaskInfo
```

## Criterios de Sucesso

### ✅ Validacao APROVADA se:

**Pre-Instalacao:**
- [ ] Installer e ASCII-only (0 caracteres fora de 0-127)
- [ ] Sintaxe PowerShell 5.1 valida
- [ ] Nenhum placeholder sem substituicao
- [ ] Todas as funcoes criticas presentes
- [ ] Parametro StartedAt presente (Jobs v3)

**Pos-Instalacao:**
- [ ] Estrutura de pastas criada corretamente
- [ ] Script do agente criado (> 50 KB)
- [ ] Scheduled Task: State = Running, LastTaskResult = 0
- [ ] Logs do installer e agent criados
- [ ] Heartbeat detectado nos logs

**Dashboard:**
- [ ] Agente aparece como "Active" (verde)
- [ ] Last heartbeat < 2 minutos
- [ ] Metricas do sistema exibidas

**Jobs v3:**
- [ ] Job executado com sucesso
- [ ] Output JSON presente
- [ ] Timestamps started_at e finished_at preenchidos
- [ ] execution_time_seconds calculado

### ❌ Validacao REPROVADA se:

**Bloqueadores Criticos:**
- Installer contem caracteres nao-ASCII
- Erro de sintaxe PowerShell 5.1
- Placeholders nao substituidos
- Funcoes criticas ausentes
- Scheduled Task LastTaskResult != 0
- Agente nao envia heartbeat em 5 minutos

**Problemas Conhecidos:**

| Sintoma | Causa Provavel | Solucao |
|---------|----------------|---------|
| ASCII Check FAIL | Emoji/acento no codigo | Rodar `npm run ascii:fix` + redeploy |
| PS Syntax FAIL | Codigo PS 7+ no script | Converter para PS 5.1 syntax |
| Placeholders FAIL | Bug no serve-installer | Verificar substituicao de placeholders |
| Task Result 4294770688 | Escaping de argumentos | Verificar New-ScheduledTaskAction args |
| No heartbeat | 401 Unauthorized | Verificar token/HMAC no DB vs script |
| Jobs v1 (nao v3) | StartedAt ausente | Atualizar agent script + regenerar |

## Troubleshooting

### Problema: Installer falha na validacao ASCII

**Diagnostico:**
```powershell
$script = Get-Content ".\cybershield-installer-TEST-ASCII-VALIDATION-FINAL.ps1" -Raw
if ($script -match '[^\x00-\x7F]') {
    Write-Host "Non-ASCII characters found" -ForegroundColor Red
    # Ver onde estao
    $script.ToCharArray() | Where-Object { [int][char]$_ -gt 127 } | Select-Object -First 10
}
```

**Resolucao:**
1. Rodar localmente: `npm run ascii:fix`
2. Commit + Push
3. Verificar CI Guardian job passou
4. Redeploy serve-installer Edge Function
5. Gerar novo installer

### Problema: Agent nao envia heartbeat

**Diagnostico:**
```powershell
# 1. Verificar task esta rodando
Get-ScheduledTask -TaskName "CyberShieldAgent-*" | Format-Table TaskName, State, LastTaskResult

# 2. Ver log do agent
Get-Content C:\CyberShield\logs\cybershield-agent-v3.log -Tail 100

# 3. Procurar por erros 401
Select-String -Path C:\CyberShield\logs\cybershield-agent-v3.log -Pattern "401"

# 4. Verificar conectividade com backend
Test-NetConnection -ComputerName [seu-dominio] -Port 443
```

**Resolucao:**
- Se 401: Verificar token e HMAC no banco de dados vs script
- Se timeout: Verificar firewall/proxy
- Se parsing error: Verificar syntax do script (emojis, PS7 syntax)

### Problema: Jobs ficam em v1 (nao v3)

**Diagnostico:**
```powershell
# Verificar se StartedAt esta presente no script
$agentScript = Get-Content "C:\CyberShield\cybershield-agent-*.ps1" -Raw
if ($agentScript -match '\$StartedAt') {
    Write-Host "StartedAt found - Jobs v3 supported" -ForegroundColor Green
} else {
    Write-Host "StartedAt NOT found - Jobs v1 only" -ForegroundColor Red
}
```

**Resolucao:**
1. Verificar que `agent-script-windows-content.ts` tem StartedAt
2. Rodar `npm run sync:agent`
3. Redeploy serve-installer
4. Regenerar installer
5. Reinstalar agente

## Checklist Final

- [ ] **Pre-Instalacao:** Script validado (ASCII, syntax, placeholders)
- [ ] **Instalacao:** Pastas, script, task criados com sucesso
- [ ] **Pos-Instalacao:** Logs presentes, heartbeat detectado
- [ ] **Dashboard:** Agente "Active" com heartbeat < 2min
- [ ] **Jobs v3:** Job executado com output + timestamps
- [ ] **Logs VM:** Nenhum erro critico nos logs
- [ ] **Task Scheduler:** LastTaskResult = 0

## Proximos Passos Apos Validacao

Se todos os criterios de sucesso forem atendidos:

1. ✅ **Marcar Fase 4 como COMPLETA**
2. ✅ **Documentar resultados** (screenshots, logs)
3. ✅ **Comunicar ao time:** Sistema ASCII pronto para producao
4. ✅ **Atualizar status do projeto:** PRODUCTION-READY
5. ✅ **Fechar tickets relacionados** a emoji/encoding/parsing errors

## Referencias

- `docs/ASCII_ENFORCEMENT.md` - Politica ASCII e ferramentas
- `scripts/vm-validation-complete.ps1` - Script de validacao automatizado
- `scripts/diagnostic-queries.sql` - Queries para troubleshooting no DB
- `VALIDATION_GUIDE.md` - Guia geral de validacao do sistema
