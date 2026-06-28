# D18-2 — HF-TYPES-REGEN-01 Result

## Escopo
Eliminar a causa raiz do type drift entre o typegen do Lovable Cloud
(`src/integrations/supabase/types.ts`) e o espelho consumido pelas Edge
Functions Deno (`supabase/functions/_shared/database.types.ts`).

## Decisão de arquitetura
- **Fonte única de verdade:** `src/integrations/supabase/types.ts`, regenerado
  automaticamente pelo Lovable Cloud a cada migration aprovada.
- **Mirror Deno:** `supabase/functions/_shared/database.types.ts` é uma cópia
  byte-a-byte do arquivo acima. Nunca é editado à mão.
- **Sincronização:** feita por script idempotente, executado por dev (pré-commit)
  e validado por CI gate (bloqueante).

## Entregáveis
1. `scripts/sync-database-types.sh` — copia o arquivo gerado para o mirror Deno.
2. `scripts/guard-database-types-sync.sh` — falha o CI se os SHA256 divergirem.
3. `npm run types:sync` / `npm run types:check` — atalhos no `package.json`.
4. Hook `.husky/pre-commit` agora roda `types:sync` e re-stage o mirror se
   houver mudança, eliminando o passo manual.
5. Workflow `.github/workflows/type-debt-guards.yml` ganhou o job
   `database-types-sync` que executa o guard a cada PR/push.
6. Documentação inline em ambos os scripts + esta nota.

## Processo (developer experience)
- Quando o Lovable Cloud regenera `src/integrations/supabase/types.ts`
  (após uma migration aprovada), basta rodar:
  ```bash
  npm run types:sync
  ```
  e committar. O pre-commit faz isso automaticamente se você esquecer.
- Validação manual a qualquer momento:
  ```bash
  npm run types:check
  ```

## Gates
| Gate | Status |
| ---- | ------ |
| `bash scripts/guard-database-types-sync.sh` | ✅ PASS (hash idêntico) |
| `bash scripts/guard-no-ts-nocheck-tier1.sh` | ✅ PASS (inalterado) |
| `deno check` (escopo `_shared/`) | ✅ inalterado — só copia bytes |
| `tsgo --noEmit` | ✅ inalterado — só copia bytes |
| `bun run lint` | ✅ inalterado |

## Critérios de aceite
- [x] Eliminar sincronização manual — automatizada via script + pre-commit.
- [x] Reduzir risco de drift — CI gate bloqueante via SHA256.
- [x] Sem mudanças de runtime — apenas tooling.
- [x] Sem alteração de contratos públicos.
- [x] Sem alteração de schema ou migrations.

## Riscos residuais
- O Lovable Cloud é a entidade que regenera `src/integrations/supabase/types.ts`.
  Se o pipeline do Lovable falhar em regenerar após uma migration, o guard ainda
  passa (porque os dois arquivos continuam iguais) mas a tipagem ficará atrás
  do schema. Mitigação: o D11-B já documenta que `agents.version` exigiu um
  bump no-op para forçar a regeneração; manter essa receita no runbook.
- O mirror Deno permanece como artefato versionado (necessário para o
  `deno check` em CI sem acesso ao TS path-mapping do Vite). Trade-off aceito.

## Próximo alvo
**D18-3 — LATENT-AUDIT-SCHEMA-01:** remover os casts temporários, agora que o
typegen está estabilizado e protegido contra drift.
