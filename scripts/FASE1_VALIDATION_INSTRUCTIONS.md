# FASE 1: Validação Completa - v3.3.0-SECURITY-DIAGNOSTICS

## Objetivo
Validar que o instalador v3.3.0 está ativo no servidor e testar a instalação completa do agente `testev2`.

## Pré-requisitos
- ✅ VM Windows Server com PowerShell 5.1+
- ✅ Permissões de Administrador
- ✅ Conectividade com `https://iavbnmduxpxhwubqrzzn.supabase.co`
- ✅ Enrollment Key: `XXXX-XXXX-XXXX-XXXX` (obtenha no dashboard)

---

## PASSO 1: Validação Rápida (2 minutos)

Execute o script de validação rápida para confirmar que a versão v3.3.0 está ativa:

```powershell
# Na VM Windows (como Administrador)
cd C:\caminho\para\projeto\scripts
.\quick-validate-installer-version.ps1
```

### Resultado Esperado:
```
[OK] Versao: v3.3.0-SECURITY-DIAGNOSTICS
[OK] Unblock-File
[OK] Zone.Identifier
[OK] ExecutionPolicy Unrestricted
[OK] Diagnostico de Seguranca
[OK] Deteccao de GPO
[OK] Deteccao de LanguageMode
[OK] Deteccao de AppLocker
[OK] Deteccao de Device Guard
[SUCESSO] Instalador v3.3.0-SECURITY-DIAGNOSTICS 100% funcional!
```

### Se Aparecer v3.2.4-UNBLOCK-FIX:
A Edge Function ainda não foi redeployada com as mudanças v3.3.0. Isso é esperado se você acabou de fazer commit/push.

**Ação:** Aguarde 2-3 minutos para o redeploy automático do Lovable Cloud.

---

## PASSO 2: Teste Completo End-to-End (5 minutos)

Após confirmar que v3.3.0 está ativo, execute o teste completo:

```powershell
cd C:\caminho\para\projeto\scripts
.\test-testev2-complete.ps1
```

### O Script Executa:

#### **Fase 1: Limpeza**
- Remove Scheduled Tasks antigas (`CyberShieldAgent*`)
- Mata processos do agente
- Limpa logs antigos em `C:\CyberShield\logs\`

#### **Fase 2: Validação do Instalador**
- ✅ Confirma versão v3.3.0-SECURITY-DIAGNOSTICS
- ✅ Verifica presença de `Unblock-File`
- ✅ Verifica remoção de `Zone.Identifier`
- ✅ Confirma `ExecutionPolicy Unrestricted`
- ✅ **NOVO:** Valida diagnóstico de segurança
- ✅ **NOVO:** Valida detecção de GPO
- ✅ **NOVO:** Valida detecção de LanguageMode
- ✅ **NOVO:** Valida detecção de AppLocker
- ✅ **NOVO:** Valida detecção de Device Guard/WDAC

#### **Fase 3: Execução do Instalador**
- Baixa e executa o instalador
- Credenciais pré-preenchidas:
  - Agent Name: `testev2`
  - Enrollment Key: `XXXX-XXXX-XXXX-XXXX`
  - Server URL: `https://iavbnmduxpxhwubqrzzn.supabase.co`

#### **Fase 4: Validação de Execução**
- Aguarda 60 segundos
- Verifica logs do agente em `C:\CyberShield\logs\cybershield-agent-v3.log`
- Confirma presença de:
  - ✅ `[START] Iniciando CyberShield Agent`
  - ✅ `[SUCCESS] Bootstrap concluido`
  - ✅ `[INFO] Entrando no loop principal`
  - ✅ `[HEARTBEAT] Heartbeat enviado com sucesso`
- Confirma ausência de:
  - ❌ Erros 401 (Unauthorized)

#### **Fase 5: Diagnóstico de Segurança (NOVO em v3.3.0)**
O instalador agora gera logs detalhados sobre o ambiente de segurança:

**Logs Esperados em `C:\CyberShield\logs\installer.log`:**
```
[INFO] === Diagnostico de Restricoes de Seguranca ===
[INFO] ExecutionPolicy [MachinePolicy]: Undefined
[INFO] ExecutionPolicy [UserPolicy]: Undefined
[INFO] ExecutionPolicy [Process]: Unrestricted
[INFO] ExecutionPolicy [CurrentUser]: Undefined
[INFO] ExecutionPolicy [LocalMachine]: Undefined
[INFO] LanguageMode: FullLanguage
[SUCCESS] Teste de execucao basico: PASSOU
[SUCCESS] Nenhum evento suspeito do Windows Defender detectado
[INFO] Device Guard / WDAC: Nao ativo ou nao configurado
[INFO] === Fim do Diagnostico de Seguranca ===
```

**Se detectar restrições, você verá:**
```
[ERROR] AVISO CRITICO: GPO forcando ExecutionPolicy=AllSigned
[ERROR] Solucao: Assinar scripts OU ajustar GPO
[ERROR] AVISO CRITICO: ConstrainedLanguage ativo
[ERROR] Causa provavel: Device Guard / WDAC / AppLocker
```

---

## PASSO 3: Interpretar Resultados

### ✅ SUCESSO TOTAL
```
[OK] Versao do instalador: v3.3.0-SECURITY-DIAGNOSTICS
[OK] Instalador executado com sucesso
[OK] Agente iniciou corretamente
[OK] Bootstrap concluido
[OK] Loop principal ativo
[OK] Heartbeat enviado (200)
[SUCESSO] ✓ Agente testev2 FUNCIONANDO!
```

**Próximos Passos:**
1. Verificar dashboard → Agente `testev2` deve estar **Online**
2. Último heartbeat deve ser recente (< 5 minutos)
3. Badge "Completo" deve estar visível

---

### ⚠️ FALHA PARCIAL

**Cenário 1: Versão Antiga**
```
[ERRO] Versao incorreta ou ausente!
Buscando por v3.3.0-SECURITY-DIAGNOSTICS
```
**Solução:** Aguardar redeploy automático ou verificar se commit/push foi feito.

**Cenário 2: Agente Não Inicia**
```
[ERRO] Nenhuma linha de [START] encontrada no log
```
**Solução:** Verificar `installer.log` para diagnóstico de segurança. Se houver:
- `GPO forcando ExecutionPolicy=AllSigned` → Ver Fase 3 (assinatura de scripts)
- `ConstrainedLanguage ativo` → Executar `diagnose-security-restrictions.ps1`

**Cenário 3: Erros 401**
```
[ERRO] Encontrado erro 401 no log (credenciais invalidas)
```
**Solução:** Regenerar credenciais do agente no dashboard e criar novo instalador.

---

## PASSO 4: Análise Avançada (Se Houver Falhas)

Execute o script de diagnóstico standalone:

```powershell
cd C:\caminho\para\projeto\scripts
.\diagnose-security-restrictions.ps1
```

Este script fornece relatório completo sobre:
- ✅ ExecutionPolicy por escopo (detecta GPO)
- ✅ LanguageMode (detecta Constrained Language)
- ✅ AppLocker (políticas ativas e teste de execução)
- ✅ Device Guard / WDAC (Code Integrity enforcement)
- ✅ Windows Defender (status e eventos recentes)
- ✅ Zone.Identifier (teste de Unblock-File)
- ✅ Permissões de Administrador
- ✅ Conectividade com backend

---

## Arquivos de Log para Análise

Se precisar de suporte, colete estes arquivos:

1. **Logs do Instalador:**
   - `C:\CyberShield\logs\installer.log`

2. **Logs do Agente:**
   - `C:\CyberShield\logs\cybershield-agent-v3.log`

3. **Informações da Scheduled Task:**
   ```powershell
   Get-ScheduledTask -TaskName "*CyberShield*" | Format-List
   ```

4. **Diagnóstico de Segurança:**
   - Output completo de `diagnose-security-restrictions.ps1`

---

## Tempo Estimado Total

| Fase | Tempo | Descrição |
|------|-------|-----------|
| Validação Rápida | 2 min | Confirmar versão v3.3.0 |
| Teste Completo | 5 min | Instalação + validação |
| Diagnóstico Avançado | 3 min | (Opcional) Se houver falhas |
| **TOTAL** | **7-10 min** | Dependendo de problemas encontrados |

---

## Checklist de Validação

Marque conforme completa:

- [ ] **Passo 1:** `quick-validate-installer-version.ps1` → v3.3.0 confirmado
- [ ] **Passo 2:** `test-testev2-complete.ps1` → Instalador executado
- [ ] **Passo 3:** Logs do agente confirmam `[START]`, `[HEARTBEAT]`
- [ ] **Passo 4:** Dashboard mostra agente `testev2` Online
- [ ] **Passo 5:** (Opcional) `diagnose-security-restrictions.ps1` se houve falha

---

## Issues Conhecidos e Soluções

### Issue 1: "Versão v3.2.4 ao invés de v3.3.0"
**Causa:** Redeploy ainda não propagou  
**Solução:** Aguardar 2-3 minutos

### Issue 2: "GPO forcando ExecutionPolicy=AllSigned"
**Causa:** Política de domínio restritiva  
**Solução:** Ver **Fase 3** do plano → Assinatura de scripts

### Issue 3: "ConstrainedLanguage ativo"
**Causa:** Device Guard / WDAC / AppLocker  
**Solução:** Ver **Fase 3** do plano → Migração para EXE/Serviço

### Issue 4: "Scheduled Task Last Run Result ≠ 0x0"
**Causa:** Task falhou ao executar  
**Solução:** 
1. Verificar `installer.log` para diagnóstico de segurança
2. Executar script do agente manualmente:
   ```powershell
   C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe `
     -ExecutionPolicy Unrestricted `
     -File "C:\CyberShield\cybershield-agent-testev2.ps1"
   ```

---

## Contato para Suporte

Se após seguir todos os passos o problema persistir:

1. Colete os 4 arquivos de log mencionados acima
2. Execute `diagnose-security-restrictions.ps1` e salve output
3. Tire screenshot do erro no script de teste
4. Compartilhe Task Scheduler "Last Run Result"

---

**Última Atualização:** 2025-11-23 (v3.3.0-SECURITY-DIAGNOSTICS)
