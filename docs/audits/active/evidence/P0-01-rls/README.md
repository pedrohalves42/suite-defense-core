# P0-01 · RLS Cross-Tenant — Evidence Bundle

| Artefato                        | Origem                                                    | Papel                                          |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `discovery.md`                  | Sprint 0 · Day 1                                          | Classificação inicial (Needs Investigation)    |
| `investigation.md`              | Sprint 1 · pré-fix (read-only, H1/H2/H3)                  | Zera 3 hipóteses estruturais                   |
| `before-structural.txt`         | `psql` read-only 2026-07-10                               | 44/44 tabelas com RLS + `tenant_id` + policies |
| `cross-tenant-probe.sql`        | SQL do simulador `request.jwt.claims` (não executável no sandbox — role `authenticated` requer sessão real) | Referência para execução em CI/psql com privilégios |
| `../../tests/security/cross-tenant-rls.spec.ts` | Teste funcional oficial (2 sessões Supabase reais) | Executor canônico do fechamento P0-01          |
| `../../scripts/security/test-cross-tenant-isolation.ts` | CLI wrapper                                        | Atalho operacional (`npx tsx …`)               |
| `report.json` (após execução)   | vitest                                                    | Matriz completa (tenant × tabela × leak)       |
| `after.sql` (após execução)     | vitest                                                    | Consultas reproduzíveis, uma por probe         |

## Critério de fechamento

```
leaked = 0  em todos os 88 probes (44 tabelas × 2 direções)
        └─▶ P0-01 = False Positive · Closed
leaked > 0  em qualquer probe
        └─▶ P0-01 = Confirmed · abrir fix direcionado à(s) policy(ies)
```

## Como executar

1. Popular `.env.test` (ver `e2e/.env.test.example`) com dois usuários
   sintéticos previamente criados via Cloud → Auth (nenhuma migration).
2. Rodar:
   ```bash
   npx tsx scripts/security/test-cross-tenant-isolation.ts
   ```
3. Anexar `report.json` + `after.sql` ao PR de fechamento.

## Estado atual (2026-07-10)

- Estrutural: **✅ passou** (44/44 tabelas com RLS ativa, `tenant_id` presente e ≥1 policy).
- Funcional cross-tenant: **⏳ pendente** (requer seed de dois usuários
  sintéticos; role `authenticated` não pode ser simulada via `SET ROLE`
  no cliente `psql` do sandbox, por isso o teste vive na camada Supabase
  JS, que passa pelo PostgREST com JWT real).
- Confidence: **95% False Positive** · bloqueador único: execução do
  spec funcional em CI.
