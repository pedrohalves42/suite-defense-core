
# Correção de Erros nos Dashboards Admin

## Diagnóstico

Através da análise de logs e requisições de rede, identifiquei que **várias Edge Functions críticas estão retornando 404 (não encontrado)**. Isso significa que elas existem no código, mas não estão ativas no ambiente de produção.

### Funções Afetadas

| Função | Status | Impacto |
|--------|--------|---------|
| `set-active-tenant` | 404 | Login travado, sincronização de tenant falha |
| `get-agent-dashboard-data` | 404 | "Monitoramento em Tempo Real" não carrega dados |
| `action-center-feed` | 404 | "Central de Ações" fica vazia |
| `heartbeat` | 404 | Agentes não conseguem reportar status |
| `submit-agent-evidence` | 404 | Evidências de segurança não são salvas |
| `process-scheduled-jobs` | 404 | Jobs agendados não executam |
| `invoke-scheduled-jobs` | 404 | Jobs agendados não são iniciados |

### Causa Raiz

As implantações anteriores sofreram **timeout do bundler** (SUPABASE_CODEGEN_ERROR), o que corrompeu o estado de deploy de múltiplas funções. Quando o bundler falha, as funções afetadas não são reimplantadas corretamente.

## Solução

### Passo 1: Reimplantar Funções Críticas (Alta Prioridade)

Reimplantar as 7 funções que estão retornando 404:

```text
Funções a reimplantar:
├── set-active-tenant            (crítico - sincronização de tenant)
├── get-agent-dashboard-data     (crítico - dashboard de monitoramento)
├── action-center-feed           (crítico - central de ações)
├── heartbeat                    (crítico - heartbeat dos agentes)
├── submit-agent-evidence        (crítico - logs de evidência)
├── process-scheduled-jobs       (alto - jobs agendados)
└── invoke-scheduled-jobs        (alto - invocação de jobs)
```

### Passo 2: Otimizar action-center-feed (Prevenção de Timeout)

O arquivo `action-center-feed/index.ts` usa a sintaxe antiga `serve()` que pode causar timeout no bundler. Será modernizado para `Deno.serve()`:

**Antes:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// ...
serve(async (req) => {
```

**Depois:**
```typescript
// Sem import de serve
Deno.serve(async (req) => {
```

Isso reduz o tamanho do bundle e evita timeouts futuros.

### Passo 3: Verificar Funcionamento

Após o deploy, testar cada endpoint com curl para confirmar status 200 e que os dashboards voltam a funcionar.

## Arquivos que Serão Alterados

- `supabase/functions/action-center-feed/index.ts` - Modernizar de `serve()` para `Deno.serve()`

## Resultado Esperado

Após a implementação:
- Login e sincronização de tenant funcionando
- Dashboard "Monitoramento em Tempo Real" carrega dados
- "Central de Ações" exibe items pendentes e resolvidos
- Agentes voltam a enviar heartbeats com sucesso
- Jobs agendados executam normalmente

## Detalhes Técnicos

As funções serão reimplantadas individualmente para evitar timeout do bundler:
1. Deploy de `set-active-tenant`
2. Deploy de `get-agent-dashboard-data`
3. Modificar e deploy de `action-center-feed`
4. Deploy de `heartbeat`
5. Deploy de `submit-agent-evidence`
6. Deploy de `process-scheduled-jobs`
7. Deploy de `invoke-scheduled-jobs`

Cada deploy:
- Compila a função com Deno
- Faz upload para o edge runtime
- Ativa o endpoint para receber requests
