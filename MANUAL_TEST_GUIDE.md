# 🧪 GUIA DE TESTE MANUAL - CyberShield

## 📋 TESTE 1: Criar Agente no Dashboard

### Pré-requisitos
- ✅ Estar logado no sistema com usuário admin
- ✅ Navegador aberto em `http://localhost:5173`

---

### Passo 1: Acessar o Instalador de Agentes

1. **Faça login** no sistema:
   - Email: `pedrohalves42@gmail.com` (ou seu email)
   - Senha: sua senha

2. **Navegue** para o instalador:
   - URL: `http://localhost:5173/admin/agent-installer`
   - OU clique no menu lateral: **"Agent Installer"**

---

### Passo 2: Gerar Novo Agente

#### Aba "Gerar Instalador"

1. **Nome do Agente:**
   ```
   TESTE-ENROLLMENT-2025
   ```
   - ✅ Validação em tempo real vai mostrar "✓ Nome válido"
   - ❌ Se aparecer erro, ajuste o nome (sem espaços, sem caracteres especiais)

2. **Plataforma:**
   - Selecione: **Windows** (padrão)

3. **Clique em:** `Gerar Comando de 1 Clique`

---

### Passo 3: Aguardar Geração

**O que vai acontecer:**

1. **Toast "Gerando credenciais do agente..."**
   - Chamada para `auto-generate-enrollment`
   - Criação de enrollment_key no banco
   - Geração de agentToken e hmacSecret

2. **Toast "Credenciais geradas com sucesso!"**
   - Preview de credenciais aparece na tela
   - Mostra Agent ID e data de expiração

3. **Toast "Baixando templates..."**
   - Download de `install-windows-template.ps1`
   - Download de `cybershield-agent-windows.ps1`

4. **Toast "Substituindo credenciais..."**
   - Substituição de `{{AGENT_TOKEN}}`, `{{HMAC_SECRET}}`, etc.

5. **Sucesso Final**
   - Opções de download/comando aparecem

---

### Passo 4: Copiar Credenciais

Você verá um **card com as credenciais**:

```
🔐 Preview das Credenciais
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent ID: abc123-def456-...
Expira em: 12/11/2025, 04:00:00
⚠️ Link expira em 4 horas
```

**Copie essas informações** para referência.

---

### Passo 5: Opções de Instalação

Você terá **3 opções**:

#### Opção A: Download Direto (Recomendado para teste)
```
📥 Baixar Instalador
[Botão: Baixar install-TESTE-ENROLLMENT-2025-windows.ps1]
```
- Salva arquivo `.ps1` no computador
- Pronto para executar em VM

#### Opção B: Comando de 1 Clique
```
💻 Comando de 1 Clique
[Caixa de texto com comando PowerShell]
[Botão: Copiar Comando]
```
- Copia comando para clipboard
- Cole no PowerShell como admin

#### Opção C: URL Temporária
```
🔗 URL Temporária (4h)
[Botão: Copiar Link]
```
- Gera link único
- Expira em 4 horas

---

### Passo 6: Validar no Banco de Dados

**Abra outra aba** e acesse Supabase (ou execute SQL):

```sql
-- Verificar enrollment_key criada
SELECT 
  id,
  LEFT(key, 15) || '...' as key_preview,
  is_active,
  expires_at,
  used_at,
  used_by_agent,
  agent_id
FROM enrollment_keys
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

**Resultado esperado:**
```
id: [UUID]
key_preview: ABC123-DEF456-...
is_active: true
expires_at: 2025-11-12 04:00:00+00
used_at: NULL (ainda não usado)
used_by_agent: NULL
agent_id: [UUID] (associado ao agente)
```

---

### Passo 7: Testar Comando (Simulação)

**NÃO execute em produção!** Use o script de simulação:

```powershell
# Abra PowerShell e navegue até o projeto
cd C:\caminho\para\seu\projeto

# Execute simulação
.\scripts\test-agent-simulation.ps1 `
    -AgentToken "TOKEN_DO_DASHBOARD" `
    -HmacSecret "HMAC_DO_DASHBOARD" `
    -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co"
```

**Substitua:**
- `TOKEN_DO_DASHBOARD`: Token gerado (copie do preview)
- `HMAC_DO_DASHBOARD`: HMAC gerado (copie do preview)

---

### Passo 8: Validar Resultados

#### No Terminal (após simulação):
```
=== TESTE 1: HEARTBEAT ===
✅ Heartbeat enviado: {"success": true}

=== TESTE 2: METRICS ===
✅ Métricas enviadas: {"success": true}

=== TESTE 3: POLL JOBS ===
📋 Jobs recebidos: 0

🎉 TODOS OS TESTES PASSARAM!
```

#### No Dashboard:
1. Acesse: `http://localhost:5173/admin/monitoring-advanced`
2. Veja o agente `TESTE-ENROLLMENT-2025` na lista
3. Status: **active** (verde)
4. Last Heartbeat: < 2 minutos
5. OS Type: Windows Server 2022
6. CPU/RAM/Disk: > 0%

#### No Banco de Dados:
```sql
-- Verificar agente criado
SELECT 
  agent_name,
  status,
  last_heartbeat,
  os_type,
  enrolled_at
FROM agents
WHERE agent_name = 'TESTE-ENROLLMENT-2025';

-- Verificar token ativo
SELECT 
  is_active,
  last_used_at,
  expires_at
FROM agent_tokens at
JOIN agents a ON at.agent_id = a.id
WHERE a.agent_name = 'TESTE-ENROLLMENT-2025';

-- Verificar métricas
SELECT 
  collected_at,
  cpu_usage_percent,
  memory_usage_percent,
  disk_usage_percent
FROM agent_system_metrics asm
JOIN agents a ON asm.agent_id = a.id
WHERE a.agent_name = 'TESTE-ENROLLMENT-2025'
ORDER BY collected_at DESC
LIMIT 5;
```

---

## 🧪 TESTE 2: Executar Testes E2E

### Pré-requisitos
- ✅ Node.js instalado (v18+ ou v20+)
- ✅ Dependências instaladas (`npm install`)
- ✅ Playwright browsers instalados

---

### Passo 1: Verificar Dependências

```bash
# Verificar Node.js
node --version
# Esperado: v18.x.x ou v20.x.x

# Verificar npm
npm --version
# Esperado: 9.x.x ou 10.x.x

# Verificar se Playwright está instalado
npx playwright --version
# Esperado: Version 1.x.x
```

---

### Passo 2: Instalar Browsers (se necessário)

```bash
# Se Playwright não estiver configurado
npx playwright install

# Se precisar de dependências do sistema (Linux)
npx playwright install-deps
```

---

### Passo 3: Executar Todos os Testes

```bash
# Rodar todos os testes com relatório HTML
npx playwright test --reporter=html

# OU rodar com output no terminal
npx playwright test --reporter=list
```

**O que vai acontecer:**

1. **Playwright inicia** browsers (Chromium, Firefox, WebKit)
2. **Executa testes** em paralelo:
   ```
   Running 13 tests using 4 workers
   
   ✓ installer-download.spec.ts:3 tests
   ✓ heartbeat-validation.spec.ts:5 tests
   ✓ complete-agent-flow.spec.ts:1 test
   ✓ serve-installer.spec.ts:3 tests
   ✓ (outros testes):1 test
   ```

3. **Resultado final:**
   ```
   13 passed (2.5m)
   ```

---

### Passo 4: Ver Relatório HTML

```bash
# Abrir relatório no navegador
npx playwright show-report
```

**O que você verá:**

- 📊 **Dashboard** com resumo dos testes
- ✅ **Testes passados** em verde
- ❌ **Testes falhados** em vermelho (se houver)
- 📸 **Screenshots** de falhas (se houver)
- 📹 **Vídeos** de execução (se configurado)
- 🕐 **Duração** de cada teste

---

### Passo 5: Executar Testes Específicos

```bash
# Testar apenas enrollment
npx playwright test e2e/installer-download.spec.ts

# Testar apenas heartbeat
npx playwright test e2e/heartbeat-validation.spec.ts

# Testar apenas fluxo completo
npx playwright test e2e/complete-agent-flow.spec.ts

# Modo debug (passo-a-passo)
npx playwright test --debug
```

---

### Passo 6: Analisar Logs de Edge Functions

Após os testes, verifique logs das edge functions:

```bash
# Heartbeat logs
npx supabase functions logs heartbeat --tail 50

# Serve-installer logs
npx supabase functions logs serve-installer --tail 50

# Enroll-agent logs
npx supabase functions logs enroll-agent --tail 50

# Auto-generate-enrollment logs
npx supabase functions logs auto-generate-enrollment --tail 50
```

**Procure por:**
- ✅ Requests bem-sucedidas (200/201)
- ❌ Erros (400/401/403/500)
- ⚠️ Avisos de validação
- 📊 Duração das requests

---

## 📊 CHECKLIST DE VALIDAÇÃO COMPLETA

### Teste 1: Criar Agente ✅
- [ ] Login bem-sucedido
- [ ] Página /admin/agent-installer acessível
- [ ] Nome do agente validado em tempo real
- [ ] Credenciais geradas sem erros
- [ ] Preview de credenciais aparece
- [ ] Opções de download/comando disponíveis
- [ ] Enrollment key criada no banco
- [ ] Agent ID associado à key

### Teste 2: Simulação de Agente ✅
- [ ] Script test-agent-simulation.ps1 executado
- [ ] Heartbeat enviado com sucesso (200)
- [ ] Métricas enviadas com sucesso (200)
- [ ] Poll jobs funcionando (200)
- [ ] Agente aparece no dashboard
- [ ] Status "active" (verde)
- [ ] Métricas visíveis (CPU/RAM/Disk)

### Teste 3: Testes E2E ✅
- [ ] 13/13 testes passaram (100%)
- [ ] Nenhum teste falhado
- [ ] Relatório HTML gerado
- [ ] Logs sem erros críticos
- [ ] Duração total < 5 minutos

### Teste 4: Banco de Dados ✅
- [ ] Enrollment_key criada e ativa
- [ ] Agent criado com status "active"
- [ ] Agent_token ativo
- [ ] Heartbeat registrado
- [ ] Métricas inseridas
- [ ] Nenhum registro órfão

---

## 🐛 TROUBLESHOOTING

### Problema: "Credenciais não geradas"

**Sintomas:**
- Toast de erro: "Falha ao gerar credenciais"
- Nenhum preview aparece

**Diagnóstico:**
```bash
# Verificar logs
npx supabase functions logs auto-generate-enrollment --tail 20
```

**Soluções:**
1. Verificar se enrollment_keys table está acessível
2. Verificar quota de agentes no tenant
3. Verificar se `generate_enrollment_key` edge function existe

---

### Problema: "Testes E2E falhando"

**Sintomas:**
```
× installer-download.spec.ts:12 - should generate valid Windows installer
  Error: expect(received).toContain(expected)
```

**Diagnóstico:**
```bash
# Rodar em modo debug
npx playwright test --debug e2e/installer-download.spec.ts

# Ver último relatório
npx playwright show-report
```

**Soluções:**
1. Limpar enrollment_keys antigas: `DELETE FROM enrollment_keys WHERE expires_at < NOW()`
2. Verificar se edge functions estão online
3. Verificar conectividade com Supabase
4. Aumentar timeouts: `test.setTimeout(60000);`

---

### Problema: "Agente não aparece no dashboard"

**Sintomas:**
- Simulação executada com sucesso
- Mas agente não aparece em `/admin/monitoring-advanced`

**Diagnóstico:**
```sql
-- Verificar se agente foi criado
SELECT * FROM agents WHERE agent_name = 'TESTE-ENROLLMENT-2025';

-- Verificar heartbeat
SELECT last_heartbeat FROM agents WHERE agent_name = 'TESTE-ENROLLMENT-2025';
```

**Soluções:**
1. Aguardar 1-2 minutos (delay de atualização)
2. Verificar rate limits: `SELECT * FROM rate_limits WHERE identifier LIKE '%TESTE%'`
3. Verificar logs do heartbeat: `npx supabase functions logs heartbeat`
4. Recarregar página do dashboard (F5)

---

## ✅ CRITÉRIOS DE SUCESSO

| Teste | Meta | Status |
|-------|------|--------|
| **Criar Agente** | Sem erros | [ ] |
| **Enrollment Key** | Criada e ativa | [ ] |
| **Simulação Heartbeat** | 200 OK | [ ] |
| **Simulação Metrics** | 200 OK | [ ] |
| **Dashboard Status** | active (verde) | [ ] |
| **Testes E2E** | 13/13 passaram | [ ] |
| **Duração E2E** | < 5 minutos | [ ] |
| **Logs Clean** | Sem erros críticos | [ ] |

---

## 📞 SUPORTE

Se encontrar problemas:

1. **Console do navegador:** F12 → Console (para erros de UI)
2. **Logs de edge functions:** `npx supabase functions logs <nome>`
3. **Banco de dados:** Queries SQL acima
4. **Documentação:** `SYSTEM_STATUS_REPORT.md`, `EXECUTION_GUIDE.md`

---

**Próximo Passo:** Validação em VM Windows Server 2022 real

Consulte: `QUICK_VALIDATION_CHECKLIST.md` para checklist completo.
