
# Fase 1D: Inline Report Namespace (8 proxied → handlers)

## Contexto
- **149 funções standalone** atualmente (meta: < 60)
- ops-gateway tem **8 report:** proxied via HTTP (double cold-start)
- Inlinar essas 8 elimina 8 cold starts extras por chamada

## Funções a Inlinar (8)

| Função | Middleware | Linhas | Handler Destino |
|--------|-----------|--------|-----------------|
| `generate-compliance-report` | serveTenant | 370 | `handlers/report-generators.ts` |
| `generate-executive-report` | serveInternal | 171 | `handlers/report-generators.ts` |
| `generate-explainable-report` | serveTenant | 175 | `handlers/report-generators.ts` |
| `generate-security-report` | serveTenant | 429 | `handlers/report-generators.ts` |
| `generate-weekly-report` | serveInternal | 316 | `handlers/report-scheduled.ts` |
| `auto-generate-report` | serveInternal | 159 | `handlers/report-scheduled.ts` |
| `scheduled-report-generator` | serveInternal | 212 | `handlers/report-scheduled.ts` |
| `list-reports` | serveAgent | 28 | `handlers/report-scheduled.ts` |

### ⚠️ Exceções Importantes
- `generate-compliance-report` (370 linhas) e `generate-security-report` (429 linhas) são grandes — verificar se possuem sub-módulos antes de decidir inlinar
- `list-reports` usa `serveAgent` — precisará adaptação para `assertInternalCaller`

## Funções Mantidas Standalone (não nesta fase)
- Todas as **playbook complexas** (6): já documentadas na Fase 1C
- Todas as **submit-* HMAC** (7): requerem raw body
- Todas as **agent-facing** (agent:*, serveAgent/HMAC): auth incompatível
- Todas as **build:*** e **security:*** proxied: fase futura

## Plano de Execução

### Etapa 1: Análise de sub-módulos
- Verificar imports de cada função report para mapear dependências
- Funções com >400 linhas + sub-módulos complexos podem ser mantidas standalone

### Etapa 2: Criar handlers
- `supabase/functions/ops-gateway/handlers/report-generators.ts` — geradores sob demanda
- `supabase/functions/ops-gateway/handlers/report-scheduled.ts` — scheduled/cron reports

### Etapa 3: Registrar no ops-gateway/index.ts
- Mover de `ACTION_TO_FUNCTION` (proxy) para `INLINED_HANDLERS`

### Etapa 4: Frontend
- Buscar hooks/componentes que chamam essas funções diretamente
- Migrar para `callGateway('report', ...)`

### Etapa 5: Deletar standalone + Deploy
- Deletar as 8 pastas de funções
- Deletar deploys remotos
- Atualizar docs

### Etapa 6: Validação
- TypeScript build check
- Testar endpoint via curl

## Ganhos Esperados
- **-8 cold starts** por chamada report
- **-8 funções standalone** (149 → 141)
- **Economia**: ~$2-5/mês em compute por eliminar double cold-start
