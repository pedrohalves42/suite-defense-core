# E2E Tests para CyberShield

## Configuração

1. Instalar Playwright:
```bash
npm install -D @playwright/test
npx playwright install
```

2. Configurar credenciais de teste:
```bash
cp .env.test .env.test.local
# Editar .env.test.local com credenciais reais
```

3. Criar usuários de teste no banco:
   - Um usuário admin
   - Um usuário regular (sem role admin)

## Executar Testes

```bash
# Executar todos os testes
npx playwright test

# Executar em modo UI
npx playwright test --ui

# Executar testes específicos
npx playwright test admin-access
npx playwright test agent-flow
npx playwright test stripe-payment
npx playwright test load-test

# Ver relatório
npx playwright show-report
```

## Testes Implementados

### admin-access.spec.ts
- ✓ Admin vê seção "Administração"
- ✓ Admin acessa /admin/dashboard
- ✓ Admin acessa /admin/users
- ✓ Admin acessa /admin/settings
- ✓ Usuário regular NÃO vê seção admin
- ✓ Usuário regular é redirecionado de rotas admin

### agent-flow.spec.ts
- ✓ Admin login e gerar enrollment key
- ✓ Agent enrollment
- ✓ Agent heartbeat
- ✓ Admin criar job para o agent
- ✓ Agent poll-jobs (buscar jobs pendentes)
- ✓ Agent acknowledge job (ack-job)
- ✓ Admin verificar job concluído
- ✓ Rate limiting validation
- ✓ Invalid token validation
- ✓ Invalid HMAC validation

### stripe-payment.spec.ts
- ✓ Verificar status inicial de subscription
- ✓ Criar checkout session - Starter plan
- ✓ Criar checkout session - Pro plan
- ✓ Validar limites de dispositivos
- ✓ Simular webhook do Stripe
- ✓ Acessar customer portal
- ✓ Verificar features por plano
- ✓ Testar planos inválidos
- ✓ Testar checkout não autenticado

### load-test.spec.ts
- ✓ Enroll múltiplos agents (10 simultâneos)
- ✓ Heartbeats concorrentes
- ✓ Poll-jobs sequencial com múltiplas iterações
- ✓ Operações mistas (heartbeat + poll + create job)
- ✓ Análise de tempo de resposta

### input-validation.spec.ts
- ✓ Rejeitar tentativas de SQL injection
- ✓ Rejeitar tentativas de path traversal
- ✓ Rejeitar caracteres de controle
- ✓ Rejeitar nomes reservados (admin, root, system)
- ✓ Rejeitar repetições excessivas
- ✓ Rejeitar nomes muito curtos ou longos
- ✓ Rejeitar início/fim inválido (hífen, underscore)
- ✓ Aceitar nomes válidos
- ✓ Rejeitar caracteres de comentário SQL
- ✓ Rejeitar tentativas de XSS
- ✓ Validar edge cases (vazio, null, whitespace)

## Variáveis de Ambiente

Configure no arquivo `.env.test.local`:

```bash
# Credenciais de teste
TEST_ADMIN_EMAIL=pedrohalves42@gmail.com
TEST_ADMIN_PASSWORD=Test1234!
TEST_USER_EMAIL=user@example.com
TEST_USER_PASSWORD=Test1234!

# Supabase (já configurado automaticamente)
VITE_SUPABASE_URL=https://iavbnmduxpxhwubqrzzn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Banner de Diagnóstico

Para ativar o banner de diagnóstico que mostra authLoading, isAdmin e email:

```bash
# Adicionar ao .env
VITE_SHOW_DIAGNOSTICS=true
```

O banner aparecerá no topo da aplicação mostrando:
- Status de autenticação (Auth: ✓/✗/⏳)
- Status de admin (Admin: ✓/✗/⏳)
- Email do usuário logado

## Troubleshooting

### Testes falhando
1. Verificar se o servidor está rodando
2. Verificar credenciais em .env.test.local
3. Verificar se usuários de teste existem no banco
4. Rodar com `--debug` para ver passo a passo

### Timeout
Aumentar timeout em `playwright.config.ts` se conexão for lenta

### Agent Flow Tests
- Os testes do agent flow validam todo o ciclo de vida de um agent
- Incluem validação de segurança (HMAC, rate limiting, tokens)
- Simulam o comportamento real do agent Windows
- Criam e limpam dados de teste automaticamente

### Stripe Payment Tests
- Validam fluxo completo de pagamento
- Testam limites de planos e dispositivos
- Simulam webhooks do Stripe
- Verificam features por plano de subscription

### Load Tests
- Simulam 10 agents simultâneos por padrão
- Avaliam performance sob carga
- Medem tempos de resposta e throughput
- Executam operações mistas (heartbeat, poll, create job)

### Input Validation Tests
- Validam proteção contra SQL injection
- Testam prevenção de path traversal
- Verificam bloqueio de XSS
- Garantem formato correto de nomes de agents
- Testam edge cases e limites de input

## CI/CD Pipeline

Este projeto usa GitHub Actions para executar testes automaticamente:

### e2e-tests.yml
- Executa em push para `main` ou `develop`
- Executa em pull requests
- Upload de relatórios e screenshots
- Testes de carga apenas em `main`

### security-audit.yml
- Executa semanalmente (segundas às 2h)
- npm audit de segurança
- Verificação de dependências
- Testes de segurança

### Configurar GitHub Secrets

No repositório GitHub, configure:
```
Settings → Secrets → Actions → New repository secret
```

Secrets necessários:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`
- `TEST_USER_EMAIL`
- `TEST_USER_PASSWORD`

## Documentação Completa

Veja `TESTING_GUIDE.md` para guia completo de testes.
