# Bloco D11-E — CI Anti-Regression Gate (active `@ts-nocheck`)

**Status:** ✅ Concluído
**Escopo:** gate de CI/local restrito a arquivos Tier 1 / já saneados. Não bloqueia dívida conhecida fora da lista.

## Objetivo

Impedir reintrodução de `@ts-nocheck` **ativo** nos arquivos limpos pelos blocos D2–D11. Dívida pré-existente em outras pastas continua tolerada (alvo do D12+).

## Regex usada

```
^[[:space:]]*(//|/\*)[[:space:]]*@ts-nocheck\b
```

Validada no D11-A. Captura diretivas ativas (`// @ts-nocheck`, `/* @ts-nocheck */`) e ignora menções em JSDoc/docs/auditoria (ex.: `* D3: @ts-nocheck removed.`).

## Arquivos protegidos (escopo bloqueante)

`_shared/`: `agent-auth.ts`, `serve-agent.ts`, `serve-tenant.ts`, `serve-internal.ts`, `error-handler.ts`, `hmac.ts`, `hmac-success-coalescer.ts`
Agent core: `heartbeat/{index,state-updater}.ts`, `poll-jobs/index.ts`, `ack-job/index.ts`, `submit-router/index.ts`, `submit-job-result/index.ts`, `register-agent-key/{index,fingerprint-utils}.ts`
Update/installer: `serve-agent-update/index.ts`, `confirm-force-update/index.ts`, `serve-installer/index.ts`, `serve-dns-filter/index.ts`
Public gateway: `public-gateway/index.ts`, `public-gateway/handlers/{fido2-auth,software-risk}.ts`
Integrações: `stripe-webhook/index.ts`, `saml-sso/index.ts`, `scim-provisioning/{index,user-handlers,group-handlers}.ts`

Total: 28 arquivos protegidos.

## Escopo não bloqueante

- Demais arquivos sob `supabase/functions/**` (104 diretivas ativas restantes, conforme D10 v2 — alvo D12+).
- Comentários documentais/JSDoc com a string `@ts-nocheck`.

## Implementação

- `scripts/guard-no-ts-nocheck-tier1.sh` — itera apenas a lista protegida com `grep -nE` da regex e falha (exit 1) ao primeiro hit. Mantido separado de `scripts/bloco-c-gates.sh` para não misturar guardrails de quality (console/dangerous html/bak) com type-debt.
- `.github/workflows/type-debt-guards.yml` — job `ts-nocheck-tier1` em push/PR para `main`/`develop`.

## Validação

### Teste positivo (estado atual do repo)
```
$ bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

### Teste negativo (inserção temporária)
Inserido `// @ts-nocheck` no topo de `supabase/functions/_shared/hmac.ts`:
```
1:// @ts-nocheck
  ^ active @ts-nocheck in protected file: supabase/functions/_shared/hmac.ts
ERROR: active @ts-nocheck found in protected Tier 1 / type-clean files.
EXIT_NEG=1
```
Revertido (`cp /tmp/hmac.bak`) e re-executado:
```
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT_REVERT=0
```

### Dívida fora do escopo (confirmação de não bloqueio)
```
$ find supabase/functions -name '*.ts' | xargs grep -cE '^[[:space:]]*(//|/\*)[[:space:]]*@ts-nocheck\b' | awk -F: '$2>0' | wc -l
104
```
A dívida segue visível ao scanner D10 v2, mas o gate não falha por ela.

## Integração

- **CI**: `.github/workflows/type-debt-guards.yml` — roda em push/PR para `main`/`develop`.
- **Local**: `bash scripts/guard-no-ts-nocheck-tier1.sh` (mantido fora de `bloco-c-gates.sh` por separação de responsabilidades).

## Riscos residuais

- Lista protegida é estática — novos arquivos saneados (D12+) precisam ser adicionados manualmente ao array `PROTECTED_PATHS`.
- Renomeação/movimentação de um arquivo protegido emite `WARN: protected path not found` mas não falha; a lista precisa ser atualizada na mesma PR.
- Os dois espelhos de `database.types.ts` continuam separados (herdado de D11-B).

## Próximo alvo

**D12** — inventário e limpeza dos `@ts-nocheck` ativos restantes em `supabase/functions/_shared/` (8 conforme D10 v2). Prioridade alta: helper compartilhado propaga erro silencioso para todos os consumers.
