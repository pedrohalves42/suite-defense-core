# 🚀 Setup do Ambiente de Desenvolvimento - CyberShield

## 📋 Pré-requisitos

- **Node.js:** >= 18.0.0 ([Download](https://nodejs.org/))
- **npm:** >= 9.0.0 (vem com Node.js)
- **Git:** Para controle de versão

Verificar versões instaladas:
```bash
node --version
npm --version
```

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure variáveis de ambiente

Copie o arquivo de exemplo e preencha com seus valores:

```bash
cp .env.example .env
```

Edite `.env` e adicione suas credenciais do Supabase:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_aqui
VITE_SUPABASE_PROJECT_ID=seu_project_id
VITE_TURNSTILE_SITE_KEY=sua_chave_turnstile
```

**Onde encontrar essas credenciais:**
- Acesse seu projeto no Lovable Cloud (backend)
- As credenciais do Supabase estão em Settings > API
- Para Turnstile: acesse Cloudflare Dashboard

### 4. Execute o projeto em modo de desenvolvimento

```bash
npm run dev
```

O app estará disponível em: `http://localhost:8080`

## 🧪 Testes

### Testes Unitários

```bash
# Executar testes uma vez
npm test

# Executar com UI
npm run test:ui

# Executar com cobertura
npm run test:coverage
```

### Testes E2E (End-to-End)

```bash
# Executar E2E tests
npm run test:e2e

# Executar com UI
npm run test:e2e:ui

# Ver relatório
npm run test:e2e:report
```

## 🏗️ Build

### Build para Web

```bash
npm run build
```

### Build para Desktop (Electron)

```bash
# Build completo Windows .exe
npm run build:exe

# Validar build
npm run validate:exe

# Testar aplicação Electron localmente
npm run start:electron
```

## 🛠️ Ferramentas Úteis

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run type-check
```

### Formatação de Código

```bash
# Formatar código
npm run format

# Apenas verificar formatação
npm run format:check
```

## 🐛 Troubleshooting

### Erro: "Module not found"

```bash
rm -rf node_modules package-lock.json
npm install
```

### Erro: "Port 8080 already in use"

Altere a porta em `vite.config.ts`:

```typescript
server: {
  port: 3000, // Altere para outra porta
}
```

### Erro de TypeScript

Execute type checking para ver todos os erros:

```bash
npm run type-check
```

### Erros após ativar Strict Mode

É normal ter erros de TypeScript após ativar strict mode. Consulte `KNOWN_ISSUES.md` para lista de erros conhecidos e correção gradual.

### Problemas com Electron

```bash
# Limpar builds anteriores
npm run clean

# Rebuild completo
npm run build:exe
```

## 📚 Documentação Adicional

- [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) - Guia completo de instalação de agentes
- [QUICK_START.md](QUICK_START.md) - Início rápido do projeto
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Guia detalhado de testes
- [ELECTRON_TEST_GUIDE.md](ELECTRON_TEST_GUIDE.md) - Guia de testes do Electron
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) - Problemas conhecidos

## 🔒 Segurança

- **NUNCA** commite o arquivo `.env` 
- Use apenas `.env.example` como template
- Todas as secrets devem ser configuradas via variáveis de ambiente
- Edge Functions acessam secrets via `Deno.env.get()`

## 🚀 Deploy

O deploy é feito automaticamente via Lovable:

1. Acesse seu projeto no Lovable
2. Clique em **Share > Publish**
3. Configure domínio customizado em **Settings > Domains**

## 📞 Suporte

- Documentação Lovable: [docs.lovable.dev](https://docs.lovable.dev)
- Guias do projeto: Consulte arquivos `.md` na raiz do projeto
