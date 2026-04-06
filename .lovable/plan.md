
# Plano: Eliminação de `any` e `console.*` — Abordagem Faseada

## Métricas Atuais
| Categoria | Contagem |
|---|---|
| `as any` em `src/` | 87 |
| `: any` em `src/` | 218 |
| `as any` em edge functions | 7 |
| `: any` em edge functions | 14 |
| `console.*` em edge functions (prod) | ~95 ocorrências em 8 arquivos |

## Fase 1 — Edge Functions Críticas de Segurança (Prioridade Máxima)
**Escopo:** `feature-flags.ts`, `honeypot/agent-handler.ts`, `honeypot-handler/index.ts`, `serve-honeypot.ts`, `honeypot/rate-limit.ts`, `api-gateway/handlers/honeypot.ts`, `ops-gateway/handlers/honeypot-pool.ts`

- Substituir todos os `console.error/log` por `logger` estruturado (já existe em `_shared/logger.ts`)
- Tipar todos os `any` com tipos concretos
- **~21 ocorrências de `any` + ~95 de `console.*`**

## Fase 2 — `src/` Frontend — `any` mais críticos
**Escopo:** Os 87 `as any` + 218 `: any` no frontend

- Priorizar arquivos com mais ocorrências
- Substituir por tipos concretos, generics, ou `unknown` + type guards
- Trabalhar em lotes de ~20-30 arquivos por iteração

## Fase 3 — Validação e Governança
- Verificar `npx tsc --noEmit --skipLibCheck` passa sem erros
- Confirmar que ESLint `@typescript-eslint/no-explicit-any: "error"` não gera novos warnings
- Atualizar memórias de governança com contagens reais

---

**Começarei pela Fase 1** (edge functions de segurança) que tem o maior impacto em compliance SOC 2 com o menor volume de mudanças.
