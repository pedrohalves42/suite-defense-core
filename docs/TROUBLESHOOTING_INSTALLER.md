# Guia de Troubleshooting - Instalador do Agente

## 🔍 Diagnóstico Rápido

Use este fluxograma para identificar a causa raiz:

```
Erro ao gerar instalador?
│
├─ "Edge function returned 500: Unknown error"
│  ├─ ✅ Verificar logs com FORCE_LOGGING=true
│  ├─ ✅ Confirmar que placeholders estão sendo substituídos
│  └─ ✅ Validar que agentScriptContent está definido
│
├─ "Circuit Breaker Ativo"
│  ├─ ✅ Clicar em "Resetar Bloqueio"
│  ├─ ✅ Investigar causa raiz das 5 falhas consecutivas
│  └─ ✅ Verificar conectividade com backend
│
├─ Instalador contém placeholders {{...}}
│  ├─ ✅ Verificar que template compartilhado está sendo usado
│  ├─ ✅ Confirmar que serve-installer está substituindo variáveis
│  └─ ✅ Validação client-side deve ter impedido download
│
├─ SHA256 mismatch
│  ├─ ✅ Gerar novo instalador
│  ├─ ✅ Verificar conexão de rede (download corrompido?)
│  └─ ✅ Confirmar que arquivo não foi modificado manualmente
│
└─ Build EXE timeout (GitHub Actions)
   ├─ ✅ Verificar status do GitHub Actions (pode estar lento)
   ├─ ✅ Aguardar retry automático (até 2x)
   └─ ✅ Verificar logs do workflow no GitHub
```

## 🐛 Problemas Comuns e Soluções

### 1. Edge Function retorna 500: Unknown error

**Sintomas:**
- Toast de erro genérico no frontend
- Instalador não é gerado
- Logs da Edge Function não aparecem (ou são vagos)

**Causa Raiz:**
- `FORCE_LOGGING` não está ativado (logs detalhados desabilitados)
- Erro interno na Edge Function não está sendo capturado
- Falha na substituição de placeholders

**Solução:**
```bash
# 1. Ativar logs detalhados
# No Supabase Dashboard -> Settings -> Edge Functions -> Secrets
FORCE_LOGGING=true

# 2. Consultar logs da função
# Lovable Cloud -> Edge Functions -> serve-installer -> Logs

# 3. Procurar por mensagens específicas:
# - "agentScriptContent is undefined"
# - "Failed to replace placeholder"
# - "Content validation failed"

# 4. Se placeholder não substituído:
# - Verificar que template compartilhado está sendo importado corretamente
# - Confirmar que .replace() está sendo chamado para cada placeholder
# - Validar que variáveis estão definidas (agentToken, hmacSecret, etc.)
```

---

### 2. Instalador contém placeholders {{...}}

**Sintomas:**
- Download completa, mas arquivo `.ps1` contém `{{AGENT_TOKEN}}` literal
- Script falha ao executar no servidor com "variable not found"

**Causa Raiz:**
- Falha na substituição de placeholders em `serve-installer`
- `agentScriptContent` não foi definido antes da substituição
- Template não está usando sintaxe correta de interpolação

**Solução:**
```bash
# 1. Validação client-side deve ter impedido download
# - Se chegou até aqui, validação foi pulada ou falhou

# 2. Verificar template compartilhado:
# supabase/functions/_shared/installer-template.ts
# - Confirmar que placeholders estão como {{PLACEHOLDER}}
# - Não usar string literal @"..."@ (impede interpolação)

# 3. Verificar substituição em serve-installer:
finalScript = installerTemplate
  .replace(/\{\{SUPABASE_URL\}\}/g, SUPABASE_URL)
  .replace(/\{\{AGENT_TOKEN\}\}/g, agentToken)
  .replace(/\{\{HMAC_SECRET\}\}/g, agent.hmac_secret)
  .replace(/\{\{AGENT_NAME\}\}/g, agent.agent_name)
  .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent);

# 4. Adicionar validação de conteúdo final:
if (/\{\{[A-Z_]+\}\}/.test(finalScript)) {
  throw new Error('Unreplaced placeholders detected');
}
```

**Prevenção:**
- Validação client-side (já implementada em AgentInstaller.tsx)
- Validação server-side antes de retornar script
- Testes E2E que verificam ausência de placeholders

---

### 3. SHA256 mismatch

**Sintomas:**
- Alerta crítico no frontend: "ERRO CRÍTICO: SHA256 não corresponde!"
- Download completa, mas hash calculado ≠ hash esperado

**Causa Raiz:**
- Arquivo corrompido durante download (rede instável)
- Arquivo foi modificado manualmente pelo usuário
- Hash no banco está incorreto (bug na geração)

**Solução:**
```bash
# 1. Gerar novo instalador (não tentar corrigir o existente)
# - Deletar arquivo .ps1 baixado
# - Clicar em "Generate Installer" novamente
# - Aguardar novo download

# 2. Verificar conexão de rede
# - Testar download de arquivo grande (speedtest)
# - Usar conexão estável (evitar WiFi público)

# 3. Se problema persistir, verificar hash no banco:
SELECT installer_sha256, installer_size_bytes
FROM enrollment_keys
WHERE id = 'enrollment_key_id';

# 4. Recalcular hash manualmente:
# PowerShell:
Get-FileHash -Algorithm SHA256 install-windows.ps1

# Linux/macOS:
sha256sum install-linux.sh

# 5. Se hashes continuam diferentes, há bug na geração
# - Verificar logs de serve-installer
# - Confirmar que TextEncoder está sendo usado corretamente
```

---

### 4. Circuit Breaker bloqueando requisições

**Sintomas:**
- Alerta vermelho: "Circuit Breaker Ativo"
- Todas as tentativas de gerar instalador falham imediatamente
- Logs mostram "Circuit breaker is OPEN, rejecting request"

**Causa Raiz:**
- 5 falhas consecutivas atingiram o threshold (ajustado de 3 para 5 na FASE 2.2)
- Backend está realmente indisponível
- Ou: falhas transientes (ex: timeout de rede)

**Solução:**
```bash
# 1. SOLUÇÃO IMEDIATA: Reset manual
# - Clicar em botão "Resetar Bloqueio" no frontend
# - Circuit breaker fecha imediatamente
# - Tentar gerar instalador novamente

# 2. INVESTIGAR CAUSA RAIZ
# - Verificar logs das últimas 5 requisições
# - Identificar padrão de erro comum

# 3. Se backend está realmente down:
# - Aguardar recuperação (circuit breaker reabrirá automaticamente após 30s)
# - Monitorar uptime do Supabase

# 4. Se falhas foram transientes:
# - Reset manual já resolveu
# - Threshold de 5 falhas é adequado (não ajustar)

# 5. Ajustar configuração (apenas se necessário):
# src/pages/AgentInstaller.tsx, linha 78:
failureThreshold: 5,  // Aumentar para 7 se muitos falsos positivos
timeout: 30000,       // Reduzir para 20000 se backend rápido
```

---

### 5. Build EXE timeout (GitHub Actions)

**Sintomas:**
- Após 5 minutos, frontend mostra "Build timeout"
- GitHub Actions ainda está executando
- Instalador `.exe` não está disponível para download

**Causa Raiz:**
- GitHub Actions está lento (fila de builds)
- Compilação do PowerShell → EXE falhou
- `ps2exe` travou ou crashou

**Solução:**
```bash
# 1. AGUARDAR RETRY AUTOMÁTICO
# - Frontend tenta até 2x automaticamente
# - Delay de 30s entre tentativas
# - Monitorar progress bar

# 2. VERIFICAR GITHUB ACTIONS
# - Acessar URL do workflow (exibida no frontend)
# - Verificar logs do job "build-agent-exe"
# - Procurar por erros em:
#   - Download do ps2exe module
#   - Conversão PS1 → EXE
#   - Upload para Supabase Storage

# 3. SE FALHA PERSISTIR:
# - Usar método alternativo: "Generate Command" (skip EXE)
# - Baixar .ps1 e compilar localmente:
#   Install-Module ps2exe
#   Invoke-ps2exe install-windows.ps1 install-windows.exe

# 4. AUMENTAR TIMEOUT (apenas se necessário):
# src/pages/AgentInstaller.tsx:
const MAX_POLL_TIME = 300000; // 5min → 600000 (10min)
```

---

### 6. Validação de nome falha com "Error checking availability"

**Sintomas:**
- Input de nome do agente mostra erro genérico
- Logs mostram "check-agent-name-availability returned 400"

**Causa Raiz:**
- Nome contém caracteres inválidos (ex: espaços, @, #)
- Nome muito curto (< 3 chars)
- Usuário tem múltiplas roles (bug já corrigido na FASE 3)

**Solução:**
```bash
# 1. VALIDAR FORMATO DO NOME
# - Apenas: a-z, A-Z, 0-9, hífens (-), underscores (_)
# - Mínimo 3 caracteres
# - Máximo 50 caracteres

# 2. SE ERRO PERSISTIR
# - Verificar logs da Edge Function check-agent-name-availability
# - Confirmar que getTenantIdForUser() está retornando ID correto
# - Verificar que query ao banco não está falhando

# 3. WORKAROUND TEMPORÁRIO
# - Usar nome diferente (ex: agent-prod-01)
# - Evitar caracteres especiais
```

---

### 7. APM não registrando métricas (FASE 4.1)

**Sintomas:**
- Tabela `performance_metrics` está vazia
- Monitor `monitor-slow-operations` não detecta operações lentas
- Não há alertas de operações > 2s

**Causa Raiz:**
- `withAPM()` não está sendo usado nas Edge Functions
- Tabela `performance_metrics` não existe ou tem RLS muito restritivo
- Cron job não está configurado

**Solução:**
```bash
# 1. Verificar instrumentação
# - Confirmar que Edge Functions usam withAPM()
# - Checar imports: import { withAPM } from '../_shared/apm.ts';

# 2. Verificar tabela no banco
SELECT COUNT(*) FROM performance_metrics WHERE created_at > NOW() - INTERVAL '1 hour';

# 3. Verificar cron job
SELECT * FROM cron.job WHERE jobname LIKE '%monitor-slow%';

# 4. Testar manualmente
curl -X POST "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/monitor-slow-operations" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Resposta esperada: { "success": true, "slow_operations_count": N }
```

---

## 🔧 Comandos Úteis para Diagnóstico

### Verificar hash SHA256 de um arquivo
```powershell
# PowerShell (Windows)
Get-FileHash -Algorithm SHA256 install-windows.ps1

# Bash (Linux/macOS)
sha256sum install-linux.sh
```

### Testar conectividade com backend
```bash
curl -X GET "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?enrollmentKey=test" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Resposta esperada: 400 (enrollment key inválida)
# Resposta errada: timeout, 500, ou connection refused
```

### Forçar logs detalhados (temporário)
```bash
# No Supabase Dashboard -> Secrets
FORCE_LOGGING=true

# Lembrar de desativar após debug:
FORCE_LOGGING=false
```

### Validar conteúdo de um instalador PS1
```powershell
# PowerShell
$content = Get-Content install-windows.ps1 -Raw

# Verificar placeholders não substituídos
if ($content -match '\{\{[A-Z_]+\}\}') {
  Write-Host "ERRO: Placeholders detectados!" -ForegroundColor Red
  $content -match '\{\{[A-Z_]+\}\}' | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "OK: Nenhum placeholder detectado" -ForegroundColor Green
}

# Verificar tamanho mínimo (50KB)
$size = (Get-Item install-windows.ps1).Length
if ($size -lt 50KB) {
  Write-Host "ERRO: Arquivo muito pequeno ($size bytes)" -ForegroundColor Red
} else {
  Write-Host "OK: Tamanho adequado ($size bytes)" -ForegroundColor Green
}
```

### Consultar métricas de APM (FASE 4.1)
```sql
-- Operações mais lentas (últimas 24h)
SELECT 
  function_name,
  operation_type,
  AVG(duration_ms) as avg_duration,
  MAX(duration_ms) as max_duration,
  COUNT(*) as total_calls
FROM performance_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name, operation_type
ORDER BY max_duration DESC
LIMIT 10;

-- Taxa de erro por função
SELECT 
  function_name,
  COUNT(*) FILTER (WHERE status_code >= 400) as errors,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / COUNT(*), 2) as error_rate
FROM performance_metrics
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY function_name
ORDER BY error_rate DESC;
```

---

## 📞 Suporte Adicional

Se os problemas persistirem após seguir este guia:

1. **Coletar informações:**
   - Logs da Edge Function relevante
   - Mensagem de erro completa
   - Screenshots do frontend
   - Hash SHA256 do arquivo (se aplicável)
   - Métricas de APM (se disponível)

2. **Consultar documentação:**
   - [INSTALLER_ARCHITECTURE.md](./INSTALLER_ARCHITECTURE.md)
   - [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)
   - [Guia de Deployment](../DEPLOYMENT_CHECKLIST.md)

3. **Contatar suporte:**
   - Email: gamehousetecnologia@gmail.com
   - WhatsApp: (34) 98443-2835
   - Incluir todas as informações coletadas
   - Descrever passos para reproduzir o erro
   - Informar se problema é intermitente ou consistente

---

**Última atualização:** 2025-11-13  
**Versão:** 4.1 (APM + Circuit Breaker Ajustado)
