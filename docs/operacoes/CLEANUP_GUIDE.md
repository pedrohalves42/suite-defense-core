# 🧹 Guia de Limpeza de Cache e Código Obsoleto

## 📋 Quando Executar Este Guia

Execute este guia nas seguintes situações:
- ✅ Após grandes refactorings ou correções críticas
- ✅ Antes de releases em produção
- ✅ Se houver discrepâncias entre ambientes (dev vs prod)
- ✅ Quando logs mostram versões antigas sendo servidas
- ✅ Após resolver `InvalidVariableReferenceWithDrive` ou erros de sintaxe PowerShell
- ✅ Quando agentes permanecem em estado `pending` após instalação

---

## 🔍 Fase 1: Limpeza de Cache

### 1.1 GitHub Actions Cache

**Objetivo:** Forçar rebuild completo dos workflows

#### Estratégia Automática (Via Commit)
```bash
# 1. Atualizar INSTALLER_VERSION em installer-version.ts
# 2. Adicionar comentário FORCE REBUILD em serve-installer/index.ts
# 3. Commit e push para trigger CI/CD

git add supabase/functions/_shared/installer-version.ts
git add supabase/functions/serve-installer/index.ts
git commit -m "chore: force rebuild to clear cache"
git push
```

#### Estratégia Manual (Via GitHub UI)
```
1. Ir para: https://github.com/[YOUR_REPO]/actions/caches
2. Deletar todos os caches relacionados a:
   - node_modules-
   - ps2exe-
   - .github/workflows/build-agent-exe
3. Re-run dos workflows após limpeza
```

**Resultado Esperado:**
- ✅ Rebuild completo de todas as dependências
- ✅ Recompilação limpa do installer .EXE
- ✅ Validação de sintaxe PowerShell fresh

---

### 1.2 Supabase Edge Functions Cache

**Objetivo:** Garantir que as Edge Functions servem a versão mais recente

#### Como Verificar Se Deploy Foi Propagado
```bash
# Via Lovable Cloud UI:
# 1. Ir para Cloud > Functions
# 2. Verificar última atualização de serve-installer e build-agent-exe
# 3. Checar logs para confirmar versão ativa

# Via curl (teste externo):
curl -I https://[YOUR_PROJECT_ID].supabase.co/functions/v1/serve-installer/[TOKEN]
# Verificar headers:
# X-Installer-Version: 3.1.1-PARSERERROR-COMPLETE-FIX
# X-Installer-Updated: 2025-11-21T02:35:00Z
```

#### Forçar Redeploy
1. Atualizar `LAST_UPDATED` em `supabase/functions/_shared/installer-version.ts`
2. Adicionar comentário `FORCE REBUILD` em funções críticas
3. Commit e push (auto-deploy via GitHub)

**Resultado Esperado:**
- ✅ Todas as chamadas retornam versão mais recente
- ✅ Headers HTTP incluem `X-Installer-Version` correto
- ✅ Zero ocorrências de padrões obsoletos (`: $_`) em catch blocks

---

### 1.3 Cache Cliente-Side (VM/Browser)

**Objetivo:** Limpar qualquer installer ou script baixado anteriormente

#### PowerShell (Na VM)
```powershell
# Limpar diretório temporário
Remove-Item "C:\Temp\*.ps1" -Force -ErrorAction SilentlyContinue
Remove-Item "C:\Users\*\Downloads\cybershield-*.ps1" -Force -ErrorAction SilentlyContinue

# Forçar download fresh com headers anti-cache
$token = "SEU_TOKEN_AQUI"
$url = "https://[PROJECT_ID].supabase.co/functions/v1/serve-installer/$token"

Invoke-WebRequest -Uri $url -OutFile "C:\Temp\installer-fresh.ps1" -UseBasicParsing -Headers @{
  "Cache-Control" = "no-cache, no-store, must-revalidate"
  "Pragma" = "no-cache"
  "Expires" = "0"
}
```

#### Navegador (Lovable Editor)
```
1. No Lovable Editor: Ctrl+Shift+R (Windows/Linux) ou Cmd+Shift+R (Mac)
2. Limpar cache do navegador:
   - Chrome/Edge: Settings > Privacy > Clear browsing data > Cached images/files
   - Firefox: Settings > Privacy > Clear Data > Cached Web Content
3. Fechar e reabrir o Lovable Editor
4. Verificar sincronização GitHub: Lovable Editor > GitHub Integration
```

**Resultado Esperado:**
- ✅ Download sempre pega versão mais recente da Edge Function
- ✅ Lovable Editor sincronizado com GitHub repo
- ✅ Não há conflitos de sincronização

---

## 🗑️ Fase 2: Remoção de Código Obsoleto

### 2.1 Scripts de Agente Obsoletos ✅ CONCLUÍDO

**Status:** Scripts v2 foram removidos em 2025-11-21

#### Arquivos Removidos:
```
✅ public/agent-scripts/cybershield-agent-windows.ps1 (v2.3.0)
✅ public/agent-scripts/cybershield-agent-linux.sh (v2)
```

#### Scripts Ativos (Manter):
```
✅ public/agent-scripts/cybershield-agent-windows-v3.ps1
✅ public/agent-scripts/cybershield-agent-linux-v3.sh
✅ public/agent-scripts/cybershield-agent-macos-v3.sh
```

**Justificativa da Remoção:**
- Sistema usa **apenas** versões v3 (Jobs v3 compatível)
- Scripts v2 não têm suporte a `StartedAt` (crítico para Jobs v3)
- Elimina confusão na manutenção
- Previne bugs de scripts errados sendo embutidos

---

### 2.2 Templates Não Utilizados

#### Arquivo Identificado:
```
⚠️  supabase/functions/_shared/installer-template-envvars.ts
```

**Status:** Template alternativo com variáveis de ambiente (experimental)

**Ação Recomendada:**
- Se **NÃO** for usado: Mover para `docs/archived/installer-template-envvars.ts`
- Se for usado: Documentar seu propósito em comentários
- Se for experimental: Mover para `supabase/functions/_experimental/`

#### Como Verificar Uso:
```bash
grep -r "installer-template-envvars" supabase/functions/ --include="*.ts"
```

---

## 🔍 Fase 3: Auditoria de Padrões Problemáticos

### 3.1 ASCII Guard (Automático)

Valida que todo o código usa apenas caracteres ASCII (0-127).

```bash
# Verificar problemas
npm run ascii:check

# Corrigir automaticamente
npm run ascii:fix
```

**Caracteres Problemáticos:**
- ❌ Emojis (😊, 🔧, ✅)
- ❌ Acentos (á, é, ã, ç)
- ❌ Aspas tipográficas (" " ' ')
- ❌ Símbolos especiais (→, •, ×)

**Resultado Esperado:**
- ✅ Zero caracteres não-ASCII em `.ps1`, `.ts`, `.tsx`, `.sql`
- ✅ CI/CD bloqueia commits com caracteres problemáticos

---

### 3.2 Validação de Sintaxe PowerShell 5.1

Garante compatibilidade com Windows Server 2016/2019.

```powershell
# Validar todos os scripts .ps1 no projeto
Get-ChildItem -Path . -Filter "*.ps1" -Recurse | ForEach-Object {
  Write-Host "Validando: $($_.Name)" -ForegroundColor Cyan
  
  $errors = $null
  $content = Get-Content $_.FullName -Raw
  [System.Management.Automation.PSParser]::Tokenize($content, [ref]$errors) | Out-Null
  
  if ($errors.Count -gt 0) {
    Write-Host "  [ERROR] $($errors.Count) erro(s) encontrado(s)" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "    Linha $($_.Token.StartLine): $($_.Message)" }
  } else {
    Write-Host "  [OK] Sintaxe válida" -ForegroundColor Green
  }
}
```

**Padrões Incompatíveis (PowerShell 7 Only):**
- ❌ Operador ternário: `$x = $condition ? "yes" : "no"`
- ❌ Pipeline chain operators: `Get-Process || Write-Error "failed"`
- ❌ Null-coalescing: `$value = $null ?? "default"`

**Resultado Esperado:**
- ✅ Todos os scripts validam no PowerShell 5.1
- ✅ Zero `ParserError` ao executar na VM

---

### 3.3 Sincronização Agent Script

Garante que desenvolvimento e produção usam o mesmo script.

```bash
# Sincronizar após mudanças em public/agent-scripts/cybershield-agent-windows-v3.ps1
npm run sync:agent

# Verificar se há diferenças não sincronizadas
git diff supabase/functions/_shared/agent-script-windows-content.ts
```

**Arquivos Afetados:**
- **Source:** `public/agent-scripts/cybershield-agent-windows-v3.ps1`
- **Target:** `supabase/functions/_shared/agent-script-windows-content.ts`

**Resultado Esperado:**
- ✅ `git diff` retorna vazio (arquivos idênticos)
- ✅ Edge Functions servem versão sincronizada

---

### 3.4 Validação de Instalador Gerado

Usa `verificar-installer-agente.ps1` para validar integridade.

```powershell
# Baixar instalador
$token = "SEU_TOKEN_AQUI"
$url = "https://[PROJECT_ID].supabase.co/functions/v1/serve-installer/$token"
Invoke-WebRequest -Uri $url -OutFile "C:\Temp\installer-test.ps1"

# Validar
.\scripts\verificar-installer-agente.ps1 -ScriptPath "C:\Temp\installer-test.ps1"
```

**Validações Executadas:**
- ✅ Encoding UTF-8 sem BOM
- ✅ Zero caracteres não-ASCII
- ✅ Sintaxe PowerShell 5.1 válida
- ✅ Presença de funções críticas: `Submit-JobResult`, `Send-Heartbeat`, `Poll-Jobs`
- ✅ Parâmetro `StartedAt` presente (Jobs v3)
- ✅ Zero ocorrências de `: $_` em catch blocks

**Resultado Esperado:**
- ✅ Todas as validações passam
- ✅ Script pronto para execução na VM

---

## ✅ Fase 4: Checklist de Validação Completa

### Cache
- [ ] GitHub Actions: Último workflow passou sem usar cache antigo
- [ ] Supabase: Edge Functions servem versão mais recente
- [ ] Lovable: Editor sincronizado com GitHub repo
- [ ] Browser: Hard refresh executado, sem cache stale
- [ ] VM: Diretório `C:\Temp` limpo, novo download executado

### Código
- [x] Scripts v2 removidos de `public/agent-scripts/`
- [ ] Templates não utilizados documentados ou movidos
- [ ] Arquivos de teste do usuário limpos (se aplicável)
- [ ] `npm run ascii:check` passa sem erros
- [ ] `npm run sync:agent` não mostra diferenças
- [ ] CI/CD workflow de validação ativo

### Funcional
- [ ] Token **NOVO** gerado pós-limpeza (não reutilizar tokens antigos)
- [ ] Instalador baixado e validado com `verificar-installer-agente.ps1`
- [ ] Versão correta: `v3.1.1-PARSERERROR-COMPLETE-FIX` (ou mais recente)
- [ ] Sintaxe PowerShell 5.1 válida
- [ ] Zero ocorrências de `: $_` em catch blocks
- [ ] Agente instalado na VM com `LastTaskResult = 0`
- [ ] Dashboard mostra agente "Ativo" com heartbeats

---

## 🛡️ Fase 5: Validacao Automatica

### 5.1 Validacao Completa do Sistema

Antes de commits criticos ou deploys:

```bash
npm run validate:system
```

Isso executa validacoes de:
- ✅ ASCII safety (caracteres nao-ASCII em scripts PowerShell)
- ✅ Padrao problematico `: $_` (InvalidVariableReferenceWithDrive)
- ✅ Funcoes criticas do agente (Submit-JobResult, Send-Heartbeat, etc.)
- ✅ Jobs v3 SQL (migrations + view jobs_normalized)
- ✅ Edge Functions criticas (submit-job-result, serve-installer)
- ✅ CI/CD configuration
- ✅ Qualidade de codigo (typecheck, lint, test)

**Resultado:**
- Exit code 0 ✅ - Tudo OK, pode fazer deploy
- Exit code 1 ❌ - Erros encontrados, **NAO fazer deploy**
- Relatorio detalhado: `guardian-report.json`

### 5.2 Validacao de Instalador Baixado (VM)

Na VM Windows, apos baixar um instalador:

```powershell
.\scripts\verificar-installer-agente.ps1 -ScriptPath "C:\temp\installer.ps1"
```

Valida:
- ✅ Encoding correto (UTF-8 sem BOM / ASCII)
- ✅ Sintaxe PowerShell 5.1
- ✅ Padrao `: $_` ausente
- ✅ Funcoes do agente presentes
- ✅ Parametro StartedAt (Jobs v3)
- ✅ Versao do installer (via HTTP headers)

**So execute o instalador se validacao passar!**

### 5.3 CI/CD

O workflow `.github/workflows/code-guardian.yml` executa automaticamente em:
- Push para `main` ou `develop`
- Pull requests
- Manualmente via GitHub Actions UI

Resultados:
- ✅ Commit/PR aprovado automaticamente se passar
- ❌ Commit/PR bloqueado se falhar
- 📊 Artifact `guardian-report.json` disponivel para analise

---

## 🔧 Fase 6: Troubleshooting

### Problema: Instalador Ainda Tem Erros Após Limpeza

**Causa Provável:** Token foi gerado **antes** do deploy completar

**Solução:**
1. Aguardar 5 minutos após fazer push
2. Verificar logs das Edge Functions:
   ```
   Lovable Cloud > Functions > serve-installer > Logs
   ```
3. Confirmar versão ativa nos logs: `Installer v3.1.1-PARSERERROR-COMPLETE-FIX`
4. **Gerar token COMPLETAMENTE NOVO** (não reutilizar)
5. Baixar e validar novamente

---

### Problema: `npm run sync:agent` Mostra Diferenças

**Causa Provável:** Alterações em `cybershield-agent-windows-v3.ps1` não sincronizadas

**Solução:**
```bash
# Re-executar sincronização
npm run sync:agent

# Verificar o que mudou
git diff supabase/functions/_shared/agent-script-windows-content.ts

# Se correto, fazer commit
git add supabase/functions/_shared/agent-script-windows-content.ts
git commit -m "chore: sync agent script after changes"
git push
```

---

### Problema: CI/CD Falha com "ASCII Compliance Error"

**Causa Provável:** Caracteres não-ASCII foram introduzidos

**Solução:**
```bash
# Identificar problemas
npm run ascii:check

# Corrigir automaticamente
npm run ascii:fix

# Revisar mudanças
git diff

# Commit correções
git add .
git commit -m "fix: remove non-ASCII characters"
git push
```

---

### Problema: `LastTaskResult != 0` Após Instalação

**Causa Provável:** Erro de sintaxe ou credenciais inválidas

**Solução:**
```powershell
# 1. Verificar logs do instalador
Get-Content "C:\CyberShield\logs\installer.log" -Tail 50

# 2. Verificar logs do agente
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 50

# 3. Verificar LastTaskResult
Get-ScheduledTask -TaskName "CyberShieldAgent-*" | Select TaskName, State, LastTaskResult

# 4. Executar manualmente para debugging
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\CyberShield\cybershield-agent-v3.ps1" `
  -ServerUrl "https://[PROJECT_ID].supabase.co" `
  -AgentToken "[SEU_TOKEN]" `
  -HmacSecret "[SEU_HMAC_SECRET]" `
  -PollInterval 60
```

**Códigos de Erro Comuns:**
- `0`: Sucesso ✅
- `1`: Erro genérico de PowerShell
- `2147942401` / `4294770688`: Parâmetros inválidos ou sintaxe incorreta

---

## 📚 Recursos Adicionais

### Scripts de Validação
- **ASCII Guard:** `tools/ascii-guard.ts` (executa via `npm run ascii:check`)
- **Agent Sync:** `scripts/sync-agent-script.sh` (executa via `npm run sync:agent`)
- **Installer Validation:** `scripts/verificar-installer-agente.ps1` (execução manual)

### Documentação Relacionada
- `docs/INSTALLER_TROUBLESHOOTING.md`: Troubleshooting detalhado de instaladores
- `docs/JOBS_V1_VS_V3.md`: Diferenças entre Jobs v1 e v3
- `docs/ASCII_ENFORCEMENT.md`: Política de caracteres ASCII
- `VALIDATION_GUIDE.md`: Guia de validação de agentes

### Workflows CI/CD
- `.github/workflows/validate-agent-script.yml`: Valida scripts PowerShell
- `.github/workflows/e2e-tests.yml`: Testes end-to-end (inclui guardian job)
- `.github/workflows/build-agent-exe.yml`: Compila instalador .EXE

---

## 🎯 Resumo Executivo

### Quando Executar Limpeza Completa
- ✅ Após resolver `InvalidVariableReferenceWithDrive` ou erros de sintaxe
- ✅ Antes de releases críticos em produção
- ✅ Se agentes permanecem em estado `pending` após instalação
- ✅ Quando logs mostram versões antigas sendo servidas

### Tempo Estimado
- **Limpeza Rápida (Fases 1-3):** 15 minutos
- **Limpeza Completa (Todas Fases):** 45-60 minutos
- **Validação E2E:** 10 minutos

### Critérios de Sucesso
- ✅ Token novo gerado pós-deploy
- ✅ Instalador validado com versão correta
- ✅ Zero erros de sintaxe PowerShell 5.1
- ✅ Zero ocorrências de `: $_` em Edge Functions
- ✅ Agente instalado com `LastTaskResult = 0`
- ✅ Dashboard mostra agente "Ativo" com heartbeats

---

**Última Atualização:** 2025-11-21  
**Versão do Guia:** 1.0.0  
**Versão do Instalador:** 3.1.1-PARSERERROR-COMPLETE-FIX
