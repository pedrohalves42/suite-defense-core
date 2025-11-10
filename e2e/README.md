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
