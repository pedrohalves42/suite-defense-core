# Executar Testes E2E de Instalação One-Click

## 📋 Pré-requisitos

1. **Instalar Playwright**:
```bash
npm install -D @playwright/test
npx playwright install
```

2. **Configurar variáveis de ambiente**:
Criar arquivo `.env.test.local` na raiz do projeto:
```env
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=test123456
VITE_SUPABASE_URL=https://iavbnmduxpxhwubqrzzn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🚀 Executar Testes

### 1. Testes de Instalação One-Click
```bash
# Executar todos os testes de one-click
npx playwright test one-click-installation

# Executar apenas para Windows
npx playwright test one-click-installation -g "Windows"

# Executar apenas para Linux  
npx playwright test one-click-installation -g "Linux"

# Executar com interface visual
npx playwright test one-click-installation --ui

# Executar com modo debug
npx playwright test one-click-installation --debug
```

### 2. Ver Resultados
```bash
# Abrir relatório HTML
npx playwright show-report

# Ver screenshots de falhas
ls -la test-results/
```

## 📊 Testes Incluídos

### Geração de Comandos:
- ✅ Geração de comando Windows (PowerShell)
- ✅ Geração de comando Linux (curl + bash)
- ✅ Validação de formato de URL
- ✅ Validação de ausência de placeholders

### Funcionalidade:
- ✅ Copiar comando para clipboard
- ✅ Download de instalador pré-configurado
- ✅ Validação de credenciais no script
- ✅ Estrutura completa do script
- ✅ Validação de caracteres especiais no nome

### URLs de Instalação:
- ✅ URL é acessível via HTTP
- ✅ Retorna script válido com credenciais
- ✅ Content-Type correto (text/plain)
- ✅ Sem placeholders {{AGENT_TOKEN}}
- ✅ Formato de UUID válido para token
- ✅ HMAC secret com comprimento adequado

## 🎯 Testes de Validação

### Teste Completo Windows:
```bash
# 1. Gerar comando
# 2. Copiar para clipboard
# 3. Validar estrutura do script
# 4. Verificar credenciais válidas
# 5. Confirmar ausência de placeholders
```

### Teste Completo Linux:
```bash
# 1. Gerar comando  
# 2. Baixar script via curl
# 3. Validar permissões (+x)
# 4. Verificar shebang (#!/bin/bash)
# 5. Confirmar credenciais embedded
```

## 🔍 Debugging

### Ver logs do Playwright:
```bash
DEBUG=pw:api npx playwright test one-click-installation
```

### Modo trace:
```bash
npx playwright test one-click-installation --trace on
npx playwright show-trace trace.zip
```

### Modo headed (ver navegador):
```bash
npx playwright test one-click-installation --headed
```

## ✅ Checklist de Validação

Antes de considerar os testes bem-sucedidos, confirme:

- [ ] Comando Windows é gerado corretamente
- [ ] Comando Linux é gerado corretamente
- [ ] URLs de instalação são acessíveis
- [ ] Scripts contêm credenciais válidas
- [ ] Não há placeholders nos scripts
- [ ] Token tem formato UUID válido
- [ ] HMAC secret tem comprimento adequado (>20 chars)
- [ ] Scripts têm estrutura completa (heartbeat, jobs, metrics)
- [ ] Validação de nome rejeita caracteres especiais
- [ ] Copy-to-clipboard funciona
- [ ] Download de script funciona
- [ ] Múltiplas gerações criam URLs únicas

## 📈 Métricas de Sucesso

Os testes devem passar com:
- **100% de sucesso** em geração de comandos
- **0 placeholders** em scripts gerados
- **< 2 segundos** para gerar cada comando
- **200 OK** em todas as URLs de instalação
- **UUID válido** em 100% dos tokens
- **HMAC > 32 chars** em 100% dos secrets

## 🐛 Troubleshooting

### Erro: "Cannot find module @playwright/test"
```bash
npm install -D @playwright/test
```

### Erro: "Browsers not installed"
```bash
npx playwright install
```

### Erro: "401 Unauthorized"
Verifique as credenciais em `.env.test.local`

### Erro: "Timeout waiting for selector"
Aumente o timeout:
```typescript
await page.waitForSelector('pre:has-text("irm")', { timeout: 30000 });
```

## 📝 Próximos Passos

Após testes E2E passarem:
1. Validar instalação real em VM Windows
2. Validar instalação real em VM Linux  
3. Confirmar heartbeats e metrics após instalação
4. Testar cenários de falha e recovery
5. Integrar testes ao CI/CD pipeline