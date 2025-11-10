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
