# Bloco D9-B — Funções `serve-*` restantes expostas

## Resultado: NO-OP (inventário vazio)

O inventário inicial não encontrou nenhuma função `serve-*` em
`supabase/functions/` que ainda tenha `@ts-nocheck`. Todas as bordas
públicas desse grupo já foram fechadas em PRs anteriores.

---

## Inventário

Comando:

```bash
ls supabase/functions/ | grep ^serve-
rg -ln "@ts-nocheck" supabase/functions/ | grep serve-
```

### Funções `serve-*` existentes

| Função | Status | Onde foi tratada |
|---|---|---|
| `serve-agent-update` | ✅ tipada, sem `@ts-nocheck` | **D8-B** (não retrabalhada — fora de escopo D9-B) |
| `serve-installer` | ✅ tipada, sem `@ts-nocheck` | **D9-B (rodada anterior)** |
| `serve-dns-filter` | ✅ tipada, sem `@ts-nocheck` | **D9-B (rodada anterior)** |

### Ocorrências remanescentes de `@ts-nocheck` com prefixo `serve-`

```
supabase/functions/_shared/serve-tenant.ts:1
supabase/functions/_shared/serve-agent.ts:1
```

Ambas são **helpers compartilhados** em `_shared/`, não edge functions
expostas. **Fora do escopo declarado do D9-B** ("funções `serve-*`
restantes expostas"). Ficam registradas como candidatos para um PR
dedicado de tipagem de `_shared/` (sugerido: **D9-X — `_shared/serve-*`
helpers**), porque são consumidos por múltiplas funções e o blast
radius de tipagem é diferente do de uma borda pública.

---

## Classificação solicitada

```
1. já tratado:          serve-agent-update, serve-installer, serve-dns-filter
2. exposto publicamente: (nenhum pendente)
3. interno/admin:        (nenhum pendente)
4. legado:               (nenhum)
5. não aplicável:        _shared/serve-tenant.ts, _shared/serve-agent.ts
                         (não são edge functions; fora de escopo D9-B)
```

---

## Ações executadas

Nenhuma alteração de código. Apenas inventário read-only.

- ❌ Nada removido
- ❌ Nada tipado
- ❌ Runtime intocado
- ❌ `serve-agent-update` **não** foi retrabalhada (conforme instrução)

---

## Gates

Como não houve mudança de código, os gates pesados não foram
re-executados nesta etapa. Os últimos verdes válidos permanecem os
registrados em `bloco-d9-a-result.md` e na rodada anterior do D9-B
(serve-installer / serve-dns-filter).

Verificação final do inventário:

```bash
rg -n "@ts-nocheck" supabase/functions/serve-*
# 0 ocorrências
```

✅ **0 ocorrências de `@ts-nocheck` nas funções `serve-*` alvo do D9-B.**

---

## Riscos residuais

- `_shared/serve-tenant.ts` e `_shared/serve-agent.ts` continuam com
  `@ts-nocheck`. Não são borda pública, mas são importados por funções
  já tipadas — qualquer mudança neles precisa ser tratada como PR
  próprio, com revisão de todos os call sites.
- Nenhum risco novo introduzido (zero código alterado).

---

## Próximo passo recomendado

Conforme o plano: avançar para **D9-C — `stripe-webhook/index.ts`**.

Opcional, fora do trilho D9: abrir **D9-X** dedicado aos helpers
`_shared/serve-*.ts`, com escopo isolado e validação dos consumidores.
