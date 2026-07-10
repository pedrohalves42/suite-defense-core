# P0-01 · RLS Cross-tenant — Closure Checklist (pending final run)

Este arquivo é o **anexo canonico do fechamento** de P0-01. Ele consolida
as evidencias e deixa em branco apenas o resultado do run funcional
(`report.json` + `after.sql`), que sera preenchido automaticamente pelo
spec ao rodar em CI/local com os secrets sintéticos populados.

## Evidencias acumuladas

| Artefato                       | Estado    | Descricao                                                                     |
|--------------------------------|-----------|-------------------------------------------------------------------------------|
| `discovery.md`                 | ✅ pronto | Classificacao inicial (Sprint 0 Day 1) — `Needs Investigation`.               |
| `investigation.md`             | ✅ pronto | Sprint 1 spike H1/H2/H3 = 0 unsafe (read-only).                                |
| `before-structural.txt`        | ✅ pronto | 44/44 tabelas multi-tenant com RLS + `tenant_id` + policies (2026-07-10).      |
| `cross-tenant-probe.sql`       | ✅ pronto | SQL do simulador `request.jwt.claims` (referencia).                            |
| `tests/security/cross-tenant-rls.spec.ts` | ✅ pronto | Executor canonico: 88 probes (44 tabelas x 2 direcoes).             |
| `scripts/security/test-cross-tenant-isolation.ts` | ✅ pronto | CLI wrapper.                                                |
| `supabase/functions/admin-seed-synthetic-tenants` | ✅ pronto | Seed idempotente de 2 tenants + users (protegido por `X-Seed-Token`). |
| `report.json`                  | ⏳ falta  | Gerado pelo spec.                                                              |
| `after.sql`                    | ⏳ falta  | Gerado pelo spec.                                                              |

## Passos para fechar

1. **Rodar o seed** (uma vez, contra o backend gerenciado):

   Pré-requisito: `ALLOW_SYNTHETIC_SEED=true` no environment da função
   (guarda contra execução acidental em produção). Senhas são
   fornecidas pelo caller no body — **nunca voltam na resposta**.

   ```bash
   curl -X POST \
     "$SUPABASE_URL/functions/v1/admin-seed-synthetic-tenants" \
     -H "x-seed-token: $SEED_ADMIN_TOKEN" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "content-type: application/json" \
     -d "{\"tenantAPassword\":\"$SPRINT1_TENANT_A_PASSWORD\",\"tenantBPassword\":\"$SPRINT1_TENANT_B_PASSWORD\"}"
   ```

   A resposta traz apenas `id` + `email` + flags `created.*` (idempotência).
   Copiar esses `id`/`email` para `.env.test` como `TEST_TENANT_A_* / TEST_TENANT_B_*`;
   as senhas em `.env.test` são as mesmas que você acabou de enviar no body
   (armazenadas como secrets `SPRINT1_TENANT_A_PASSWORD` / `_B_PASSWORD`).

2. **Executar o spec**:

   ```bash
   npx tsx scripts/security/test-cross-tenant-isolation.ts
   ```

3. **Ler o resultado** (`docs/audits/active/evidence/P0-01-rls/report.json`):
   - `leaked === 0` e `errored === 0` em 88 probes -> item `False Positive · Closed`.
   - Qualquer `leaked > 0` -> reclassificar como `Confirmed`, abrir fix
     escopado a policy da(s) tabela(s) vazadas (não editar policies em massa).

4. **Fechar no board** (`hardening-tracking-board.md`):
   - Status: `✅` · Discovery: `False Positive`.
   - Evidencia ANTES: `before-structural.txt` (+ `investigation.md`).
   - Evidencia DEPOIS: `report.json` + `after.sql`.

5. **Destravar dependentes**:
   - P0-04 (Auth/MFA) sai de blocked.
   - P0-09 (Kill-switch) sai de blocked.

## Estado atual

- Confidence: **95% False Positive** (H1/H2/H3 + estrutural OK; falta run funcional).
- Runtime tocado: **0 linhas**.
- Runtime tocado nesta rodada: apenas Frente 2 (P0-02, escopo separado).
