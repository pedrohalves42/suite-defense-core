# Bloco C — Guardrails rápidos

**Data:** 2026-06-24
**Status:** APLICADO
**Escopo:** limpeza + anti-regressão. Sem mexer em auth/HMAC/heartbeat/jobs/RLS/RPC/migrations funcionais.

---

## C1 — Remover .bak versionado

- **Removido:** `supabase/functions/ops-gateway/legacy/check.ts.bak` (diretório vazio também removido).
- **Documentado:** `docs/archive/ops-gateway-check-bak.md` com ponteiro para git history.
- **Gitignore:** adicionados `*.bak`, `*.orig`, `*~`.

## C2 — JSON-LD seguro

- **Novo helper:** `src/lib/safe-json-ld.ts` — `serializeJsonLd()` escapa `<`, `>`, `&`, U+2028, U+2029.
- **Refatorado:** `src/components/landing/SEO.tsx` passa o payload pelo helper; `dangerouslySetInnerHTML` é o único caminho viável para `<script type="application/ld+json">`, então fica permitido por allowlist (com `eslint-disable` comentado) — não há mais string crua serializada inline.
- **Testes:** `src/lib/__tests__/safe-json-ld.test.ts` cobre `</script>`, `&`, U+2028/U+2029 e round-trip.

## C3 — console.* migrados para logger

| Arquivo | Antes | Depois |
| --- | --- | --- |
| `src/lib/url-safety.ts` | `console.warn` | `logger.warn` (dynamic import para evitar ciclo) |
| `src/hooks/useRoutePrefetch.ts` | `console.warn` | `logger.warn` |
| `src/components/admin/SecurityMonitor.tsx` | `console.error` | `logger.error` |
| `supabase/functions/_shared/audit.ts` | `console.error` x2 | `logger.error` x2 |
| `supabase/functions/_shared/hexagonal/repositories/check.repository.ts` | `console.warn` | dynamic `logger.warn` (best-effort) |

Allowlist preservada (último recurso, justificada):
- `src/lib/logger.ts`, `supabase/functions/_shared/logger.ts` — wrappers
- `src/test/**`, `__tests__/**`, `*.test.*`, `*.spec.*` — testes
- `src/components/ErrorBoundary.tsx`, `src/PublicApp.tsx` — error boundaries de último recurso

## C4 — Gates anti-regressão

- **Script:** `scripts/bloco-c-gates.sh` cobre:
  - C-GATE-1: `*.bak` / `*.orig` versionados
  - C-GATE-2: `dangerouslySetInnerHTML={` fora da allowlist (`FormattedText.tsx`, `SEO.tsx`)
  - C-GATE-3: `console.(log|warn|error|debug)` fora dos wrappers/testes/error boundaries
- **Workflow:** `.github/workflows/bloco-c-gates.yml` em push/PR para `main`+`develop`.

---

## Validação local

```
$ bash scripts/bloco-c-gates.sh
==> C-GATE-1: forbid versioned *.bak / *.orig    PASS
==> C-GATE-2: dangerouslySetInnerHTML allowlist  PASS
==> C-GATE-3: console.* outside wrappers/...     PASS
BLOCO C GATES PASSED
```

## Fora do escopo (intocado)

- `supabase/functions/_shared/hmac.ts`
- `supabase/functions/_shared/agent-auth.ts`
- `supabase/functions/heartbeat/**`
- `supabase/functions/submit-job-result/**`, `ack-job/**`
- `feature_flags`, RLS/RPC, migrations funcionais

## Próximo

Pendente decisão do usuário: avançar para limpeza de `@ts-nocheck` em caminho crítico (Bloco D) ou iniciar criação de tenant laboratório.
