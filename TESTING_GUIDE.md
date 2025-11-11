# Guia Completo de Testes - CyberShield

## Índice
1. [Visão Geral](#visão-geral)
2. [Testes E2E](#testes-e2e)
3. [Testes de Carga](#testes-de-carga)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Configuração](#configuração)
6. [Executando Testes](#executando-testes)
7. [Troubleshooting](#troubleshooting)

---

## Visão Geral

O CyberShield possui uma suíte completa de testes automatizados:

- **Testes E2E (End-to-End)**: Validam fluxos completos do usuário
- **Testes de Carga**: Avaliam performance com múltiplos agents
- **Testes de Segurança**: Validam HMAC, rate limiting e autenticação
- **Testes de Pagamento**: Verificam integração com Stripe

---

## Testes E2E

### Suítes Implementadas

#### 1. **admin-access.spec.ts**
Valida controle de acesso administrativo:
- ✓ Admin vê seção "Administração"
- ✓ Admin acessa páginas protegidas
- ✓ Usuários regulares são bloqueados

#### 2. **agent-flow.spec.ts**
Valida ciclo de vida completo do agent:
- ✓ Enrollment de agent
- ✓ Heartbeat periódico
- ✓ Poll de jobs
- ✓ Execução e acknowledgment
- ✓ Validação de HMAC
- ✓ Rate limiting

#### 3. **agent-installation.spec.ts** ✨ ATUALIZADO
Valida instalador Windows com correções críticas:
- ✓ Geração de script via UI
- ✓ Checagem de privilégios administrativos
- ✓ Criação de diretórios e arquivos
- ✓ Configuração de tarefa agendada
- ✓ Teste de conectividade
- ✓ Tratamento robusto de erros
- ✓ Compatibilidade Windows Server
- ✓ **NOVO: Validação de parâmetros obrigatórios**
- ✓ **NOVO: Retry logic com backoff em Send-Heartbeat**
- ✓ **NOVO: Test-SystemHealth com retry**
- ✓ **NOVO: Sistema de logging detalhado ([ERROR], [INFO], [WARNING])**

#### 4. **linux-agent-installation.spec.ts** ✨ ATUALIZADO
Valida instalador Linux com correções críticas:
- ✓ Geração de script com shebang correto
- ✓ Informações essenciais do agent
- ✓ Funções críticas (HMAC, heartbeat, etc.)
- ✓ Configuração systemd
- ✓ Compatibilidade de distribuição
- ✓ Configurações de segurança
- ✓ Workflow de instalação
- ✓ **NOVO: Função validate_parameters()**
- ✓ **NOVO: Retry logic (3 tentativas) com backoff em send_heartbeat**
- ✓ **NOVO: test_server_connectivity() com retry**
- ✓ **NOVO: HMAC seguro com openssl**

#### 5. **stripe-payment.spec.ts**
Valida fluxo de pagamento Stripe:
- ✓ Criação de checkout session
- ✓ Validação de limites de dispositivos
- ✓ Webhook de subscription
- ✓ Customer portal
- ✓ Verificação de features por plano

### Executar Testes E2E

```bash
# Todos os testes E2E
npx playwright test

# Testes específicos
npx playwright test admin-access
npx playwright test agent-flow
npx playwright test stripe-payment

# Modo interativo
npx playwright test --ui

# Com debug
npx playwright test --debug

# Apenas no Chrome
npx playwright test --project=chromium
```

---

## Testes de Carga

### load-test.spec.ts ✨ EXPANDIDO

Simula cenários de alta carga com múltiplos agents:

**Configuração padrão:**
- 10 agents simultâneos
- 5 iterações de poll
- Operações mistas (heartbeat + poll + create job)

**Cenários de Teste:**
1. **Setup**: Enrollment de 10 agents
2. **Concurrent Heartbeats**: Todos os agents enviam heartbeat simultaneamente
3. **Sequential Poll-Jobs**: 5 iterações com 1s de intervalo
4. **Mixed Operations**: Heartbeat + poll + create job simultâneos
5. **Response Time Analysis**: Análise detalhada de latência
6. **✨ NOVO: System Metrics Load**: Envio simultâneo de métricas (CPU, RAM, Disk)
7. **✨ NOVO: Sustained Load (30s)**: Heartbeats + métricas a cada 2s por 30 segundos

**Métricas avaliadas:**
- Tempo de resposta médio (< 5s esperado)
- Taxa de sucesso/falha (> 80% esperado)
- Throughput (ops/segundo)
- Min/Max response time
- **NOVO: Taxa de sucesso de métricas do sistema (> 90% esperado)**
- **NOVO: Success rate sustentado durante carga contínua**

### Executar Testes de Carga

```bash
# Todos os testes de carga
npx playwright test load-test

# Teste específico de métricas
npx playwright test load-test -g "System Metrics"

# Teste de carga sustentada (30s)
npx playwright test load-test -g "Sustained Load"

# Com relatório detalhado
npx playwright test load-test --reporter=html

# Personalizar número de agents
CONCURRENT_AGENTS=20 npx playwright test load-test
```

### Interpretando Resultados

**Thresholds esperados:**
- Taxa de sucesso: > 80%
- Tempo médio de resposta: < 5 segundos
- Ops/segundo: > 5 ops/s

---

## Testes de Validação de Input

### input-validation.spec.ts

Valida proteção contra ataques de injeção e manipulação de dados:

**Cenários testados:**

1. **SQL Injection**: Tenta injetar comandos SQL maliciosos
2. **Path Traversal**: Tenta acessar diretórios não autorizados
3. **Caracteres de Controle**: Valida bloqueio de caracteres especiais
4. **Nomes Reservados**: Impede uso de nomes como admin, root, system
5. **Repetições Excessivas**: Previne DoS com strings mal formadas
6. **Limites de Tamanho**: Valida min/max de caracteres
7. **Formato Válido**: Garante padrão correto (início/fim alfanumérico)
8. **XSS Attempts**: Bloqueia tentativas de Cross-Site Scripting
9. **Edge Cases**: Testa valores nulos, vazios, whitespace

### Executar Testes de Validação

```bash
# Testes de validação
npx playwright test input-validation

# Com output detalhado
npx playwright test input-validation --reporter=line

# Apenas testes de SQL injection
npx playwright test input-validation -g "SQL injection"
```

### Proteções Implementadas

**Validação com Zod:**
- ✓ Formato: `^[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9]$`
- ✓ Comprimento: 3-64 caracteres
- ✓ Bloqueio de SQL keywords: `SELECT`, `DROP`, `UNION`, etc.
- ✓ Bloqueio de caracteres perigosos: `;`, `'`, `"`, `/`, `\`
- ✓ Bloqueio de comentários SQL: `--`, `/*`, `*/`
- ✓ Bloqueio de nomes reservados
- ✓ Limite de repetições consecutivas: máx 5 caracteres

**Exemplos válidos:**
- `agent-01`
- `my_agent`
- `server-prod-001`
- `AgentName`

**Exemplos bloqueados:**
- `'; DROP TABLE agents; --` (SQL injection)
- `../../../etc/passwd` (Path traversal)
- `admin` (Nome reservado)
- `aaaaaaaaa` (Repetição excessiva)
- `-agent` (Início inválido)

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### 1. **e2e-tests.yml**
Executa automaticamente em:
- Push para `main` ou `develop`
- Pull requests
- Manualmente via workflow_dispatch

**Jobs:**
- `test`: Testes E2E completos
- `load-test`: Testes de carga (apenas em main)

#### 2. **security-audit.yml**
Executa semanalmente (segundas às 2h):
- npm audit
- Verificação de dependências desatualizadas
- Testes de segurança

### Configurar Secrets no GitHub

Necessário configurar no GitHub Repository Settings → Secrets:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
TEST_ADMIN_EMAIL
TEST_ADMIN_PASSWORD
TEST_USER_EMAIL
TEST_USER_PASSWORD
```

### Visualizar Resultados

1. Acesse a aba **Actions** no GitHub
2. Selecione o workflow executado
3. Visualize logs e artifacts
4. Baixe relatórios HTML gerados

---

## Configuração

### 1. Instalar Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. Configurar Variáveis de Ambiente

Criar arquivo `.env.test.local`:

```bash
# Credenciais de teste
TEST_ADMIN_EMAIL=pedrohalves42@gmail.com
TEST_ADMIN_PASSWORD=Test1234!
TEST_USER_EMAIL=user@example.com
TEST_USER_PASSWORD=Test1234!

# Supabase (já configurado)
VITE_SUPABASE_URL=https://iavbnmduxpxhwubqrzzn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Criar Usuários de Teste

No Supabase:
1. Criar usuário admin
2. Criar usuário regular
3. Atribuir roles apropriadas

---

## Executando Testes

### Comandos Principais

```bash
# Instalar dependências
npm ci

# Instalar browsers do Playwright
npx playwright install --with-deps

# Executar todos os testes
npx playwright test

# Executar testes específicos
npx playwright test admin-access
npx playwright test agent-flow
npx playwright test agent-installation      # Windows
npx playwright test linux-agent-installation # Linux
npx playwright test stripe-payment
npx playwright test load-test

# Executar apenas validações de correções críticas
npx playwright test agent-installation -g "críticas"
npx playwright test linux-agent-installation -g "critical fixes"

# Executar testes de carga específicos
npx playwright test load-test -g "System Metrics"
npx playwright test load-test -g "Sustained Load"

# Modo interativo (UI)
npx playwright test --ui

# Apenas testes que falharam
npx playwright test --last-failed

# Com trace para debug
npx playwright test --trace on

# Ver relatório HTML
npx playwright show-report
```

### Opções Úteis

```bash
# Executar em browser específico
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Modo headed (ver browser)
npx playwright test --headed

# Debug com breakpoints
npx playwright test --debug

# Timeout customizado
npx playwright test --timeout=60000

# Executar N vezes
for i in {1..5}; do npx playwright test; done
```

---

## Troubleshooting

### Testes Falhando

**1. Verificar servidor está rodando**
```bash
npm run dev
```

**2. Verificar credenciais**
- Confirmar `.env.test.local` existe
- Validar usuários no Supabase

**3. Verificar conectividade**
```bash
curl -I https://iavbnmduxpxhwubqrzzn.supabase.co
```

**4. Limpar cache**
```bash
npx playwright cache remove
npx playwright install --with-deps
```

### Timeouts

Aumentar em `playwright.config.ts`:
```typescript
timeout: 60 * 1000, // 60 segundos
```

### Rate Limiting

Se testes falharem por rate limit:
1. Adicionar delays entre requisições
2. Reduzir número de agents nos testes de carga
3. Verificar configuração de rate limit no backend

### Problemas de HMAC

Se validação HMAC falhar:
1. Verificar timestamp não está expirado
2. Confirmar hmac_secret correto
3. Validar formato da assinatura

### Stripe Webhooks

Para testar webhooks localmente:
```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
stripe trigger customer.subscription.created
```

---

## Métricas e Relatórios

### Playwright Reports

Após executar testes:
```bash
npx playwright show-report
```

Abre relatório HTML com:
- Status de cada teste
- Screenshots de falhas
- Traces para debug
- Métricas de performance

### CI/CD Artifacts

No GitHub Actions, baixe artifacts:
- `playwright-report`: Relatório HTML completo
- `playwright-screenshots`: Screenshots de falhas
- `load-test-report`: Resultados de testes de carga

### Logs de Performance

Nos testes de carga, métricas são exibidas no console:
```
=== Concurrent Heartbeats Load Test ===
Total agents: 10
Success: 10
Failed: 0
Duration: 1234ms
Avg response time: 123.4ms
```

---

## Boas Práticas

### 1. Sempre verificar antes de commit
```bash
npm run test
```

### 2. Usar branches para features
```bash
git checkout -b feature/new-test
npx playwright test
git push origin feature/new-test
```

### 3. Revisar relatórios de CI/CD
- Verificar todos os jobs passaram
- Analisar métricas de performance
- Investigar falhas intermitentes

### 4. Manter testes atualizados
- Atualizar quando API mudar
- Adicionar testes para novas features
- Remover testes obsoletos

### 5. Documentar cenários de teste
- Comentar casos complexos
- Explicar valores esperados
- Documentar workarounds

---

## Contato e Suporte

Para dúvidas sobre testes:
- Email: gamehousetecnologia@gmail.com
- WhatsApp: (34) 98443-2835
- Documentação: Este guia

---

## Resumo das Melhorias Recentes

### ✅ Correções Críticas Implementadas e Testadas

1. **Scripts de Instalação**
   - ✅ Validação de parâmetros obrigatórios (Windows + Linux)
   - ✅ Retry logic com backoff em heartbeats (3 tentativas)
   - ✅ Testes de conectividade com retry
   - ✅ Sistema de logging detalhado ([ERROR], [INFO], [WARNING])

2. **Testes de Carga**
   - ✅ Teste de envio de métricas do sistema (CPU, RAM, Disk, Network)
   - ✅ Teste de carga sustentada (30s com heartbeats + métricas)
   - ✅ Validação de success rate > 80-90%

3. **Testes E2E de Instalação**
   - ✅ 14 testes para instalador Windows (4 novos)
   - ✅ 9 testes para instalador Linux (5 novos)
   - ✅ Validação completa das correções críticas

### 📊 Cobertura de Testes Atual

- **Admin Access**: 3 testes
- **Agent Flow**: 7 testes
- **Windows Installation**: 14 testes ⬆️
- **Linux Installation**: 9 testes ⬆️
- **Stripe Payment**: 5 testes
- **Input Validation**: 9 testes
- **Load Testing**: 7 testes ⬆️

**Total: 54 testes E2E automatizados**

---

## Próximos Passos

- [ ] Adicionar testes de integração com VirusTotal
- [ ] Implementar testes de UI visual
- [ ] Adicionar testes de acessibilidade
- [ ] Expandar testes de carga para 100+ agents
- [ ] Integrar com ferramentas de monitoring
- [ ] Adicionar testes de resiliência de rede (simular latência, packet loss)
