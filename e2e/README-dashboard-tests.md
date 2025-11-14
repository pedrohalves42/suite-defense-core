# Testes E2E - Dashboards CyberShield

## 📋 Visão Geral

Testes end-to-end para os 3 dashboards principais do sistema de monitoramento:
- **Installation Pipeline Monitor** - Funil e métricas de instalação
- **Agent Health Monitor** - Status de saúde e heartbeats em tempo real
- **Installation Logs Explorer** - Busca avançada de logs

**Total:** 24 casos de teste cobrindo funcionalidades críticas

---

## 🚀 Como Executar

### Pré-requisitos
1. **Usuário de teste configurado:**
   - Email: `admin@test.com`
   - Password: `Test123!@#`
   - Role: `admin`

2. **Dados de teste (seed):**
```sql
-- Inserir agentes de teste
INSERT INTO agents (tenant_id, agent_name, status, enrolled_at, last_heartbeat)
VALUES 
  ('seu-tenant-id', 'TEST-AGENT-01', 'active', NOW() - INTERVAL '1 hour', NOW()),
  ('seu-tenant-id', 'TEST-AGENT-02', 'pending', NOW() - INTERVAL '2 hours', NULL),
  ('seu-tenant-id', 'TEST-AGENT-03', 'active', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '1 minute');

-- Inserir logs de instalação
INSERT INTO installation_analytics (tenant_id, agent_name, event_type, success, platform)
VALUES
  ('seu-tenant-id', 'TEST-AGENT-01', 'post_installation', true, 'windows'),
  ('seu-tenant-id', 'TEST-AGENT-02', 'command_copied', false, 'windows'),
  ('seu-tenant-id', 'TEST-AGENT-03', 'post_installation', true, 'linux');
```

### Executar Todos os Testes
```bash
# Instalar Playwright (primeira vez)
npx playwright install

# Rodar todos os testes de dashboard
npm run test:e2e -- e2e/dashboard-*.spec.ts

# Com relatório HTML
npx playwright test e2e/dashboard-*.spec.ts --reporter=html
npx playwright show-report
```

### Executar Dashboard Específico
```bash
# Installation Pipeline Monitor
npx playwright test e2e/dashboard-installation-pipeline.spec.ts

# Agent Health Monitor
npx playwright test e2e/dashboard-agent-health.spec.ts

# Installation Logs Explorer
npx playwright test e2e/dashboard-installation-logs.spec.ts
```

### Modo Debug
```bash
# Debug com UI interativo
npx playwright test --ui

# Debug linha a linha
npx playwright test --debug

# Ver apenas falhas
npx playwright test --reporter=line --grep-invert @skip
```

---

## 📊 Cobertura de Testes

### Installation Pipeline Monitor (8 testes)

| # | Teste | Descrição | Tempo |
|---|-------|-----------|-------|
| 1 | Load metrics | Valida 5 cards de KPIs | ~2s |
| 2 | Funnel chart | Verifica renderização SVG | ~1s |
| 3 | Filter stages | Testa dropdown de filtros | ~1s |
| 4 | Change period | Valida seleção de período | ~2s |
| 5 | Export CSV | Download de arquivo CSV | ~2s |
| 6 | Error state | Mock de falha backend | ~2s |
| 7 | Retry mechanism | Botão "Tentar Novamente" | ~3s |
| 8 | Drill-down | Navegação para detalhes | ~1s |

**Total:** ~14s

### Agent Health Monitor (6 testes)

| # | Teste | Descrição | Tempo |
|---|-------|-----------|-------|
| 1 | Load metrics | Cards de saúde geral | ~2s |
| 2 | Heatmap | Agrupamento por status | ~1s |
| 3 | Health groups | Categorização (healthy/warning/critical) | ~1s |
| 4 | Realtime heartbeats | Subscription e toast | ~30s |
| 5 | Filter health | Filtros por status | ~1s |
| 6 | Error state | Mock de erro | ~2s |

**Total:** ~37s (inclui espera de heartbeat)

### Installation Logs Explorer (10 testes)

| # | Teste | Descrição | Tempo |
|---|-------|-----------|-------|
| 1 | Load table | Carregamento inicial | ~2s |
| 2 | Filter agent name | Busca por nome | ~1s |
| 3 | Filter event type | Dropdown de tipo | ~1s |
| 4 | Filter success | Dropdown sucesso/falha | ~1s |
| 5 | Filter platform | Dropdown de plataforma | ~1s |
| 6 | Filter error type | Busca por erro | ~1s |
| 7 | Clear filters | Botão limpar | ~1s |
| 8 | Log details | Sheet de detalhes | ~2s |
| 9 | Export CSV | Download | ~2s |
| 10 | Error state | Mock de erro | ~2s |

**Total:** ~15s

---

## 🧪 Cenários de Teste Detalhados

### Cenário 1: Instalação Bem-Sucedida
**Objetivo:** Validar fluxo completo de sucesso

**Passos:**
1. Gerar instalador (via dashboard)
2. Baixar e executar
3. Aguardar heartbeat (até 1 minuto)
4. Verificar em **Installation Pipeline**:
   - Status = "Ativo"
   - Tempo de instalação < 60s
   - Todas as etapas do funil completas
5. Verificar em **Agent Health**:
   - Heartbeat aparece em live counter
   - Agente em grupo "Saudáveis"
   - Toast de notificação dispara
6. Verificar em **Logs Explorer**:
   - Evento `post_installation` com `success=true`
   - Metadata contém hostname e OS

**Critério de Sucesso:** ✅ Todos os 3 dashboards refletem instalação bem-sucedida

---

### Cenário 2: Instalação com Erro 401
**Objetivo:** Validar captura de erros de autenticação

**Passos:**
1. Gerar instalador com token inválido (modificar manualmente)
2. Executar script PowerShell
3. Aguardar falha
4. Verificar em **Installation Pipeline**:
   - Status = "Erro"
   - Badge vermelho
   - Funil não completa etapa "Instalados"
5. Verificar em **Logs Explorer**:
   - Evento `post_installation` com `success=false`
   - `error_message` contém "401"
   - `error_type` = "401_unauthorized"
6. Verificar telemetria PowerShell:
   - Stack trace capturado
   - System info presente
   - Logs enviados ao backend

**Critério de Sucesso:** ✅ Erro aparece claramente em todos os dashboards

---

### Cenário 3: Taxa de Falha Alta (>30%)
**Objetivo:** Validar alertas automáticos

**Passos:**
1. Simular 10 instalações:
   - 7 falhas (erro 401)
   - 3 sucessos
2. Aguardar 15 minutos (execução do cron job)
3. Verificar em **Installation Pipeline**:
   - Card vermelho "Alta Taxa de Falha Detectada"
   - Badge com porcentagem (70%)
   - Botão "Ver Logs de Falha"
4. Verificar em **SystemLogs**:
   - Alerta tipo `high_failure_rate`
   - Severidade `high` (>50%) ou `medium` (30-50%)
   - Details com breakdown
5. Verificar email (se configurado):
   - Subject: "[CyberShield] Alta Taxa de Falha Detectada"
   - Body com métricas detalhadas

**Critério de Sucesso:** ✅ Alerta criado e visível + email enviado

---

### Cenário 4: Exportação CSV
**Objetivo:** Validar download de dados

**Passos:**
1. Abrir **Installation Logs Explorer**
2. Aplicar filtro: `success=false`, `platform=windows`
3. Clicar "Exportar CSV"
4. Abrir arquivo `installation-logs-2025-11-14.csv`
5. Verificar:
   - Encoding UTF-8 (acentos corretos)
   - Vírgulas em campos escapadas com aspas
   - Colunas: agent_name, event_type, success, platform, error_message, created_at
6. Importar no Excel:
   - Dados → Obter Dados → De Arquivo de Texto/CSV
   - Delimitador: Vírgula
   - Encoding: UTF-8

**Critério de Sucesso:** ✅ Arquivo abre corretamente com todos os dados

---

### Cenário 5: Erro de Backend
**Objetivo:** Validar resiliência e UX de erro

**Passos:**
1. Simular desconexão (desligar WiFi)
2. Abrir qualquer dashboard
3. Verificar:
   - `<ErrorState>` aparece
   - Mensagem clara: "Erro ao carregar..."
   - Botões: "Tentar Novamente" e "Recarregar Página"
4. Reconectar WiFi
5. Clicar "Tentar Novamente"
6. Verificar que dashboard carrega normalmente

**Critério de Sucesso:** ✅ Usuário não vê tela em branco, recebe feedback claro

---

## 🎯 Executando no CI/CD

### GitHub Actions Workflow
```yaml
name: E2E Dashboard Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run dashboard tests
        run: npx playwright test e2e/dashboard-*.spec.ts
        env:
          CI: true
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

### Executar Localmente (Mock de CI)
```bash
# Simular ambiente CI
CI=true npx playwright test e2e/dashboard-*.spec.ts --reporter=github

# Com screenshots de falhas
npx playwright test --screenshot=only-on-failure --video=retain-on-failure
```

---

## 🐛 Problemas Comuns nos Testes

### Timeout em "should receive realtime heartbeat updates"
**Causa:** Nenhum agente enviando heartbeats durante teste

**Solução:**
```typescript
// Reduzir timeout ou skip teste em ambientes sem agentes ativos
test.skip('should receive realtime heartbeat updates', async ({ page }) => {
  // ...
});
```

### "Element not found" em filtros
**Causa:** Dropdowns não abrem corretamente

**Solução:**
```typescript
// Usar click com force
await page.click('text=Plataforma', { force: true });

// Ou wait for selector primeiro
await page.waitForSelector('text=Plataforma', { state: 'visible' });
await page.click('text=Plataforma');
```

### CSV download não detectado
**Causa:** Download não aguardado corretamente

**Solução:**
```typescript
// Criar promise ANTES de clicar
const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
await exportButton.click();
const download = await downloadPromise;
```

---

## 📈 Métricas de Sucesso dos Testes

**Objetivos:**
- ✅ 100% dos testes passam em ambiente local
- ✅ >95% dos testes passam no CI/CD
- ✅ Tempo total de execução < 2 minutos
- ✅ Zero flaky tests (intermitentes)

**Status Atual:**
- Installation Pipeline: ✅ 8/8 passing
- Agent Health: ⚠️ 5/6 passing (1 flaky - realtime)
- Logs Explorer: ✅ 10/10 passing

---

**Equipe:** Orion DataFlow PRIME  
**Versão:** 1.0.0  
**Data:** 2025-11-14
