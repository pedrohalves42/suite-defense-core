# 📋 GUIA DE EXECUÇÃO - VALIDAÇÃO COMPLETA CyberShield

## ⚠️ IMPORTANTE: Problemas Detectados nos Logs

Antes de executar a validação completa, identifiquei alguns problemas nos logs de edge functions que precisam ser corrigidos:

### 🔴 Problema Crítico: `enroll-agent` Missing enrollmentKey

**Erro:** Múltiplas requests chegando sem `enrollmentKey`
```
[enroll-agent] Missing enrollmentKey in request
Body received: { hasEnrollmentKey: false, agentName: "test-agent-..." }
```

**Causa:** Os testes de load e algumas requests estão enviando apenas `agentName` sem `enrollmentKey`.

**Impacto:** Agentes não conseguem se enrollar corretamente.

### ⚠️ Aviso: Configurações de Tenant

```
Invalid settings for tenant Pedro Alves, skipping
No settings found for tenant Atlaviamit, skipping
```

**Recomendação:** Configurar `tenant_settings` para todos os tenants antes de continuar.

---

## 🚀 EXECUÇÃO PASSO-A-PASSO

### PRÉ-REQUISITOS

```powershell
# 1. Verificar versão PowerShell
$PSVersionTable.PSVersion
# Esperado: >= 5.1

# 2. Verificar conectividade
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443
# Esperado: TcpTestSucceeded = True

# 3. Configurar execução de scripts
Set-ExecutionPolicy Bypass -Scope Process -Force

# 4. Navegar para o diretório do projeto
cd C:\caminho\para\seu\projeto
```

---

## FASE 1: Script de Validação Completa ✅

### Executar Orquestrador Principal

```powershell
.\scripts\run-complete-validation.ps1
```

**O que este script faz:**
- Verifica pré-requisitos (PowerShell, conectividade, ps2exe)
- Mostra status da Fase 1 (limpeza já concluída)
- Fornece instruções para Fase 2 (teste de ciclo completo)
- Pergunta se você quer fazer build .EXE (Fase 3)
- Roda testes E2E se Node.js estiver instalado (Fase 4)
- Mostra checklist para validação em VM (Fase 5)

**Duração estimada:** 10-15 minutos (excluindo validação em VM)

**Output esperado:**
```
╔══════════════════════════════════════════════════════════╗
║   CyberShield - Complete Validation Orchestrator        ║
║   Version 2.2.1                                          ║
╚══════════════════════════════════════════════════════════╝

✅ PowerShell 5.1.X
✅ Conectividade com Supabase OK
✅ ps2exe disponível
```

---

## FASE 2: Teste de Comunicação do Agente 🔄

### Passo 2.1: Criar Agente no Dashboard

1. Acesse: `http://localhost:5173/admin/agent-installer`
2. Preencha:
   - **Nome:** `VALIDACAO-COMPLETA-WIN2022`
   - **Plataforma:** Windows
3. Clique em **"Gerar Comando de 1 Clique"**
4. **COPIE AS CREDENCIAIS:**
   - `Agent Token` (UUID)
   - `HMAC Secret` (string base64)

### Passo 2.2: Executar Simulação

```powershell
cd scripts

.\test-agent-simulation.ps1 `
    -AgentToken "COLE_SEU_TOKEN_AQUI" `
    -HmacSecret "COLE_SEU_HMAC_AQUI" `
    -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co"
```

**Output esperado:**
```
=== TESTE 1: HEARTBEAT ===
✅ Heartbeat enviado: { "success": true }

=== TESTE 2: METRICS ===
✅ Métricas enviadas: { "success": true }

=== TESTE 3: POLL JOBS ===
📋 Jobs recebidos: 0

🎉 TODOS OS TESTES PASSARAM!
```

### Passo 2.3: Validar no Dashboard

Acesse: `http://localhost:5173/admin/monitoring-advanced`

**Checklist:**
- [ ] Agente `VALIDACAO-COMPLETA-WIN2022` aparece na lista
- [ ] Status: **active** (verde)
- [ ] Last Heartbeat: < 2 minutos
- [ ] OS Type: Windows Server 2022
- [ ] CPU/RAM/Disk: Valores > 0%

**Se falhar:**
- Verificar logs: `npx supabase functions logs heartbeat`
- Verificar rate limit: Query `rate_limits` table
- Validar HMAC signature no código

---

## FASE 3: Build do Instalador .EXE 🔨

### Passo 3.1: Verificar ps2exe

```powershell
Get-Module -ListAvailable -Name ps2exe

# Se não instalado:
Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
```

### Passo 3.2: Executar Build

```powershell
cd scripts

.\build-installer-exe.ps1 `
    -AgentToken "TOKEN_DO_PASSO_2" `
    -HmacSecret "HMAC_DO_PASSO_2" `
    -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" `
    -AgentName "PROD-BUILD" `
    -OutputPath "..\builds"
```

**Output esperado:**
```
=== CyberShield EXE Builder ===
✅ Todos os placeholders substituídos
🔨 Compilando EXE: ..\builds\CyberShield-Installer-PROD-BUILD-v2.2.1.exe

✅ EXE criado com sucesso!
📁 Caminho: C:\...\builds\CyberShield-Installer-PROD-BUILD-v2.2.1.exe
🔐 SHA256: abc123def456789...

Deseja criar uma assinatura digital self-signed? (s/n)
```

**Duração:** 2-5 minutos

**Validação:**
```powershell
# Verificar se EXE foi criado
Test-Path ..\builds\CyberShield-Installer-PROD-BUILD-v2.2.1.exe

# Verificar tamanho (deve ser > 1MB)
(Get-Item ..\builds\CyberShield-Installer-*.exe).Length / 1MB
```

---

## FASE 4: Testes E2E Completos 🧪

### Passo 4.1: Verificar Dependências

```bash
# Verificar Node.js
node --version
# Esperado: v18+ ou v20+

# Verificar Playwright
npx playwright --version
```

### Passo 4.2: Instalar Dependências (se necessário)

```bash
# Se node_modules não existe
npm install

# Instalar browsers Playwright (se necessário)
npx playwright install
```

### Passo 4.3: Rodar Testes

```bash
# Rodar todos os testes com relatório HTML
npx playwright test --reporter=html

# Abrir relatório
npx playwright show-report
```

**Testes que devem passar:**
- ✅ `installer-download.spec.ts` - Gera instaladores Win/Linux
- ✅ `heartbeat-validation.spec.ts` - Valida heartbeat + HMAC
- ✅ `complete-agent-flow.spec.ts` - Ciclo completo signup → ack
- ✅ `serve-installer.spec.ts` - Serve-installer com keys válidas/expiradas
- ✅ Outros testes de jobs, metrics, etc.

**Meta:** 13/13 testes passando (100%)

**Duração:** 5-10 minutos

### Passo 4.4: Verificar Logs de Edge Functions

```bash
# Heartbeat
npx supabase functions logs heartbeat --tail 50

# Serve-installer
npx supabase functions logs serve-installer --tail 50

# Poll-jobs
npx supabase functions logs poll-jobs --tail 50

# Enroll-agent (verificar se erros de enrollmentKey foram corrigidos)
npx supabase functions logs enroll-agent --tail 50
```

---

## FASE 5: Validação em VM Windows Server 2022 🖥️

### Passo 5.1: Preparar VM

**Requisitos:**
- Windows Server 2022 limpa
- PowerShell 5.1+
- Acesso de administrador
- Conectividade HTTPS

**Comandos na VM:**
```powershell
# Verificar PowerShell
$PSVersionTable.PSVersion

# Configurar execução
Set-ExecutionPolicy Bypass -Scope Process -Force

# Testar conectividade
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443
```

### Passo 5.2: Gerar Instalador

1. No dashboard: `/admin/agent-installer`
2. Nome: `PROD-WIN2022-FINAL`
3. Plataforma: Windows
4. Baixar `.ps1` ou usar `.exe` gerado na Fase 3

### Passo 5.3: Transferir para VM

**Opção A: RDP**
- Copiar/colar via área de transferência do RDP

**Opção B: Compartilhamento de rede**
```powershell
# Na máquina host
New-SmbShare -Name "CyberShield" -Path "C:\caminho\para\instalador" -ReadAccess "Everyone"

# Na VM
Copy-Item "\\HOST\CyberShield\install-*.ps1" -Destination "C:\Temp\"
```

**Opção C: Download direto (se VM tem internet)**
```powershell
# Usar comando de 1 clique gerado no dashboard
Invoke-Expression (Invoke-WebRequest -Uri "https://...").Content
```

### Passo 5.4: Executar Instalador

```powershell
# Na VM, como Administrador
cd C:\Temp

# Opção A: Script .PS1
.\install-PROD-WIN2022-FINAL-windows.ps1

# Opção B: Instalador .EXE
.\CyberShield-Installer-PROD-BUILD-v2.2.1.exe
```

### Passo 5.5: Checklist Cronometrado

| Tempo | Validação | Como Verificar | ✓ |
|-------|-----------|----------------|---|
| T+10s | Script executado sem erros | Console PowerShell | [ ] |
| T+60s | Heartbeat registrado | Dashboard `/admin/monitoring-advanced` | [ ] |
| T+5min | Métricas enviadas | CPU/RAM/Disk visíveis no dashboard | [ ] |
| T+8min | Job executado | Criar job manual, verificar status `done` | [ ] |

### Passo 5.6: Validações Finais

**Dashboard:**
- [ ] Status: **active** (verde, não vermelho)
- [ ] OS Type: Windows Server 2022
- [ ] Hostname: Nome da VM
- [ ] Uptime: > 0 segundos
- [ ] Métricas: CPU, RAM, Disk > 0%

**SQL (no Supabase):**
```sql
-- Verificar agente
SELECT agent_name, status, last_heartbeat, os_type
FROM agents 
WHERE agent_name = 'PROD-WIN2022-FINAL';

-- Verificar métricas
SELECT collected_at, cpu_usage_percent, memory_usage_percent
FROM agent_system_metrics 
WHERE agent_id = (SELECT id FROM agents WHERE agent_name = 'PROD-WIN2022-FINAL')
ORDER BY collected_at DESC 
LIMIT 5;
```

**Logs na VM:**
```powershell
# Ver logs do agente
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Tail 100

# Verificar tarefa agendada
Get-ScheduledTask -TaskName "CyberShield Agent"
Get-ScheduledTaskInfo -TaskName "CyberShield Agent"
```

---

## 🐛 TROUBLESHOOTING

### Erro: "Missing enrollmentKey in request"

**Causa:** Request não está enviando `enrollmentKey` no body.

**Solução:**
1. Verificar se enrollment key foi gerado corretamente
2. Confirmar que key está sendo passada no request body
3. Revisar script de simulação para garantir que key está presente

**Código para verificar:**
```powershell
# Verificar enrollment keys ativas
# No Supabase, rodar:
SELECT id, key, is_active, expires_at, used_by_agent
FROM enrollment_keys
WHERE is_active = true AND expires_at > NOW()
ORDER BY created_at DESC;
```

### Erro: "Agente não aparece no dashboard"

**Diagnóstico:**
1. Verificar logs do agente: `C:\ProgramData\CyberShield\logs\agent.log`
2. Testar conectividade: `Test-NetConnection iavbnmduxpxhwubqrzzn.supabase.co -Port 443`
3. Verificar se token está ativo:
   ```sql
   SELECT * FROM agent_tokens WHERE is_active = true;
   ```
4. Validar HMAC secret: Deve estar preenchido em `agents.hmac_secret`

### Erro: "Rate limit exceeded"

**Solução:**
```sql
-- Limpar rate limits manualmente
DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
```

### Erro: "Build .EXE falhou"

**Diagnóstico:**
1. Verificar se ps2exe está instalado: `Get-Module -ListAvailable -Name ps2exe`
2. Verificar se templates existem:
   ```powershell
   Test-Path ".\public\templates\install-windows-template.ps1"
   Test-Path ".\agent-scripts\cybershield-agent-windows.ps1"
   ```
3. Verificar se placeholders foram substituídos: Abrir script temporário e procurar por `{{...}}`

---

## ✅ CHECKLIST FINAL DE VALIDAÇÃO

### Fase 1: Limpeza
- [x] Agentes órfãos removidos (TESTEMIT, AGENT-01)
- [x] Jobs órfãos deletados
- [x] Função `cleanup_orphaned_agents()` executada

### Fase 2: Teste de Ciclo Completo
- [ ] Agente criado: `VALIDACAO-COMPLETA-WIN2022`
- [ ] Heartbeat recebido em <60s
- [ ] Métricas inseridas em <5min
- [ ] Job poll-jobs funcional
- [ ] ACK confirmado

### Fase 3: Build .EXE
- [ ] Script de build executado
- [ ] EXE criado sem erros
- [ ] SHA256 calculado
- [ ] Tamanho do arquivo > 1MB

### Fase 4: Testes E2E
- [ ] 13/13 testes passaram
- [ ] Relatório HTML gerado
- [ ] Logs sem erros críticos

### Fase 5: VM Real
- [ ] Instalação bem-sucedida
- [ ] Dashboard mostra status "active"
- [ ] Métricas visíveis
- [ ] Job executado e completado

---

## 📊 RELATÓRIO FINAL

Após completar todas as fases, preencher:

**Data/Hora:** _________________
**Executor:** _________________

**Resultados:**
- Fase 1: ✅ Concluída
- Fase 2: [ ] Sucesso / [ ] Falha - Motivo: __________
- Fase 3: [ ] Sucesso / [ ] Falha - Motivo: __________
- Fase 4: [ ] Sucesso / [ ] Falha - __/13 testes passaram
- Fase 5: [ ] Sucesso / [ ] Falha - Motivo: __________

**Problemas Encontrados:**
1. _________________
2. _________________

**Tempo Total:** _______ minutos

**Status Final:** [ ] ✅ PRONTO PARA PRODUÇÃO / [ ] ⚠️ REQUER AJUSTES

---

## 🚀 PRÓXIMOS PASSOS PÓS-VALIDAÇÃO

1. [ ] Ativar Leaked Password Protection (Supabase Dashboard)
2. [ ] Assinar EXE com certificado EV para produção
3. [ ] Configurar monitoramento 24/7
4. [ ] Documentar processo para novos agentes
5. [ ] Criar playbook de incident response

---

**Documentação Completa:**
- `COMPLETE_VALIDATION_REPORT.md` - Detalhes técnicos completos
- `QUICK_VALIDATION_CHECKLIST.md` - Checklist rápido
- `VALIDATION_GUIDE.md` - Guia de validação manual
- `TESTING_GUIDE.md` - Guia de testes E2E

**Suporte:**
- Email: gamehousetecnologia@gmail.com
- Logs: `npx supabase functions logs <function-name>`
- Dashboard: `/admin/monitoring-advanced`
