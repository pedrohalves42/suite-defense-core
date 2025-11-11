# Testes E2E - Super Admin e Instalação One-Click

## 📋 Visão Geral

Este documento descreve os testes End-to-End (E2E) implementados para validar:

1. **Super Admin Tenant Management** - Gerenciamento de tenants pelo super admin
2. **One-Click Installation** - Instalação simplificada de agentes

## 🧪 Suítes de Teste

### 1. Super Admin - Tenant Management (`super-admin-tenant-management.spec.ts`)

Valida que um super admin pode:

#### ✅ Casos de Teste

| Teste | Descrição | Validação |
|-------|-----------|-----------|
| **Acessar página de gerenciamento** | Super admin acessa `/admin/super/tenants` | Página carrega com título e cards de métricas |
| **Visualizar todos os tenants** | Lista completa de tenants com detalhes | Tabela exibe: nome, slug, plano, usuários, agentes |
| **Ver planos de assinatura** | Badges de planos visíveis (FREE/PRO/ENTERPRISE) | Plans exibidos corretamente |
| **Modificar plano de assinatura** | Alterar plano de um tenant via dropdown | Mudança salva e toast de sucesso exibido |
| **Ver contadores de usuários/agentes** | Formato `X/Y` para quotas | Contadores visíveis e formatados |
| **Alertas de quota excedida** | Texto vermelho quando quota ultrapassada | UI mostra warning corretamente |
| **Métricas nos cards** | Total de tenants, usuários e agentes | Números corretos nos cards de resumo |
| **Bloqueio de não-super-admins** | Admin regular não pode acessar | Redirecionado para dashboard com toast |

#### 🔒 Segurança Validada

- ✅ Autenticação obrigatória
- ✅ Verificação de role `super_admin`
- ✅ RLS policies respeitadas
- ✅ Acesso negado para usuários regulares

---

### 2. One-Click Agent Installation (`one-click-installation.spec.ts`)

Valida o fluxo completo de instalação simplificada:

#### ✅ Casos de Teste

| Teste | Descrição | Validação |
|-------|-----------|-----------|
| **Acessar página do installer** | Admin acessa `/installer` | Página carrega com formulário |
| **Gerar comando Windows** | Criar comando PowerShell | Formato: `irm URL \| iex` |
| **Gerar comando Linux** | Criar comando Bash | Formato: `curl -sL URL \| sudo bash` |
| **Copiar para clipboard** | Botão "Copiar Comando" funciona | Texto copiado corretamente |
| **Download de script** | Baixar `.ps1` ou `.sh` pré-configurado | Arquivo baixado com nome correto |
| **URL temporária válida** | Link gerado é acessível | HTTP 200, retorna script válido |
| **Credenciais válidas no script** | Token e HMAC incluídos | Sem placeholders `{{}}` |
| **Validação de nome do agente** | Rejeitar caracteres especiais | Erro exibido para nomes inválidos |
| **Múltiplas instalações** | Gerar vários instaladores | Cada URL é única |
| **Instruções úteis** | Textos de ajuda visíveis | Instruções claras por plataforma |

#### 🔐 Validações de Segurança

- ✅ Credenciais geradas via `auto-generate-enrollment`
- ✅ URLs temporárias únicas por instalação
- ✅ Scripts não contêm placeholders
- ✅ Token formato UUID válido
- ✅ HMAC secret com comprimento adequado

---

## 🚀 Como Executar os Testes

### Pré-requisitos

```bash
# Instalar dependências
npm install

# Instalar browsers do Playwright
npx playwright install
```

### Configurar Variáveis de Ambiente

Crie um arquivo `.env.test` na raiz do projeto:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Super Admin (para testes de gerenciamento)
SUPER_ADMIN_EMAIL=pedrohalves42@gmail.com
SUPER_ADMIN_PASSWORD=your-password

# Admin Regular (para testes de instalação)
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=test123456
```

### Executar Todos os Testes

```bash
# Executar todos os testes E2E
npm run test:e2e

# Ou com Playwright CLI
npx playwright test
```

### Executar Testes Específicos

```bash
# Apenas testes do Super Admin
npx playwright test super-admin-tenant-management

# Apenas testes de Instalação One-Click
npx playwright test one-click-installation

# Executar teste específico por nome
npx playwright test -g "Super admin can modify tenant subscription plan"
```

### Modo Debug

```bash
# Abrir UI do Playwright para debug
npx playwright test --ui

# Debug com modo headed (ver o browser)
npx playwright test --headed --debug
```

### Gerar Relatório

```bash
# Após executar os testes
npx playwright show-report
```

---

## 📊 Cobertura de Testes

### Super Admin
- ✅ Autenticação e autorização
- ✅ Listagem de tenants
- ✅ Visualização de planos
- ✅ Modificação de assinaturas
- ✅ Métricas agregadas
- ✅ Alertas de quota
- ✅ Proteção de acesso

### Instalação One-Click
- ✅ Geração de comandos
- ✅ URLs temporárias
- ✅ Credenciais válidas
- ✅ Download de scripts
- ✅ Validação de input
- ✅ Clipboard copy
- ✅ Instruções de uso

---

## 🐛 Debugging

### Logs de Teste

Os testes incluem `console.log` para facilitar debug:

```typescript
console.log('Current plan:', currentPlan);
console.log('Generated Windows command:', commandText);
console.log('Credentials validated:', { token, secretLength: secret.length });
```

### Screenshots em Falhas

Playwright captura screenshots automaticamente quando um teste falha.

Localização: `test-results/`

### Trace Viewer

Para análise detalhada de falhas:

```bash
# Gerar trace
npx playwright test --trace on

# Visualizar trace
npx playwright show-trace trace.zip
```

---

## 🔄 CI/CD Integration

Os testes são executados automaticamente via GitHub Actions:

- ✅ Em cada push para `main` ou `develop`
- ✅ Em pull requests
- ✅ Manualmente via workflow dispatch

### Secrets Necessários no GitHub

Configure em: `Settings > Secrets and variables > Actions`

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPER_ADMIN_EMAIL
SUPER_ADMIN_PASSWORD
TEST_ADMIN_EMAIL
TEST_ADMIN_PASSWORD
```

---

## 📝 Notas Importantes

### Super Admin Tests
- Requer usuário com role `super_admin` no banco
- Testa operações CRUD em tenants de outros usuários
- Valida RLS policies funcionando corretamente

### Installation Tests
- Testa edge function `serve-installer`
- Valida geração de credenciais via `auto-generate-enrollment`
- URLs temporárias devem estar acessíveis publicamente

### Limitações
- Testes não executam scripts reais em VMs (simulação apenas)
- Para teste completo de instalação, executar manualmente em VM real

---

## 🎯 Próximos Passos

- [ ] Adicionar testes de permissões granulares
- [ ] Testar expiração de URLs temporárias
- [ ] Validar métricas após instalação real
- [ ] Testes de carga para múltiplos tenants
- [ ] Verificar logs de auditoria

---

## 📚 Recursos

- [Playwright Documentation](https://playwright.dev)
- [Supabase Testing Guide](https://supabase.com/docs/guides/testing)
- [GitHub Actions](https://docs.github.com/en/actions)
