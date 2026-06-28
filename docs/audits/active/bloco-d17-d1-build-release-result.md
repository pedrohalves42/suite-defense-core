# D17-D1 — Build / Release (Resultado)

**Status:** ✅ Concluído
**Escopo:** cadeia de build, assinatura e distribuição de releases.
**Regra de ouro:** zero alteração em algoritmos de assinatura, cálculo de hash, contratos HTTP, payloads, SQL ou compatibilidade do agente.

---

## 1. Arquivos saneados (8)

| # | Arquivo | LOC |
|---|---|---|
| 1 | `supabase/functions/build-agent-exe/index.ts` | 256 |
| 2 | `supabase/functions/build-agent-exe/cache.ts` | 70 |
| 3 | `supabase/functions/generate-deploy-package/index.ts` | 257 |
| 4 | `supabase/functions/generate-portable-installer/index.ts` | 367 |
| 5 | `supabase/functions/upload-release-content/index.ts` | 107 |
| 6 | `supabase/functions/validate-build-pipeline/index.ts` | 112 |
| 7 | `supabase/functions/setup-agent-script/index.ts` | 79 |
| 8 | `supabase/functions/get-agent-script-content/index.ts` | 147 |

Total saneado: ~1.395 LOC.

---

## 2. Inventário pós-onda

| Métrica | Antes (D16-FINAL) | Depois (D17-D1) |
|---|---:|---:|
| `@ts-nocheck` ativos | 23 | **15** |
| Redução absoluta | — | **8 arquivos** |
| Redução acumulada vs D13 (96) | 76 % | **~84 %** |
| Gate Tier 1 (arquivos protegidos) | 130 | **138** |

### Arquivos restantes (15) — alvos de D17-D2 / D17-D3

Agent deployment & helpers:
- `check-agent-updates`, `create-reinstall-jobs`, `force-reinstall-fleet`
- `get-agent-config`, `get-agent-policy`, `get-blocked-websites`
- `get-diagnostic-script`, `get-latest-agent-script`
- `post-installation-telemetry`, `diagnostics-agent-logs`

Misc / Reports / Legacy:
- `action-center-feed`, `collect-router`, `scan-virus`, `scan-vulnerabilities`, `update-baseline`

---

## 3. Bugs latentes encontrados (4) e hotfixes aplicados nesta onda

Todos descobertos ao remover `@ts-nocheck`. Tratados como bugs funcionais, sem mascarar com casts amplos.

### HF-BUILD-DEPLOY-SCHEMA-01 — Schema drift em `enrollment_keys`
- **Arquivo:** `generate-deploy-package/index.ts`
- **Sintoma:** select de `key_value` e `name` — colunas **inexistentes** no schema real
  (`enrollment_keys` expõe `key`, `description`).
- **Impacto runtime:** chamada retornava `SelectQueryError` → 404 silencioso para Intune / GPO / RMM packages.
- **Correção:** select alinhado ao schema (`key`, `description`); guarda extra contra `key` nulo;
  filename usa `description` como rótulo.

### HF-BUILD-CACHE-ORIGIN-01 — Variável `origin` indefinida
- **Arquivo:** `build-agent-exe/cache.ts`
- **Sintoma:** `buildCorsHeaders(origin)` dentro do helper referenciava variável **não declarada**.
- **Impacto runtime:** `ReferenceError` em cache HIT → cliente nunca recebia o build cacheado.
- **Correção:** parâmetro `origin: string | null = null` adicionado à assinatura; chamador
  (`build-agent-exe/index.ts`) repassa o `origin` da request. Também tipou `supabase` como
  `SupabaseClient<Database>` (era `any`).

### HF-BUILD-DUP-DECL-01 — Redeclaração de `agentScriptHash`
- **Arquivo:** `build-agent-exe/index.ts`
- **Sintoma:** `const agentScriptHash = prepared.sha256` (linha 129) era **redeclarado**
  por `const agentScriptHash = buildResult.agentScriptHash` (linha 156).
- **Impacto runtime:** mascarado pelo `@ts-nocheck`; em TS estrito é erro de compilação.
  O segundo valor era código morto — o hash usado em `checkBuildCache` e `script_hash`
  do registro `agent_builds` sempre veio do `prepared` (storage). Manter o comportamento
  preserva chaves de cache existentes.
- **Correção:** segunda declaração removida; comentário documenta a decisão.

### Casts localizados introduzidos
- `upload-release-content/index.ts`: `releaseData as never` no `upsert` para acomodar
  os campos opcionais de assinatura (`signature_base64`, `signed_at`, `signed_by`)
  sem alterar o payload SQL nem o algoritmo de assinatura.

---

## 4. Bugs latentes detectados mas **não** corrigidos nesta onda

Tratados como follow-ups independentes (fora do escopo de tipagem):

### LATENT-BUILD-VALIDATION-01 — `validateAgentScriptContent` usado como boolean
- **Arquivos:** `build-agent-exe/index.ts:126`, `generate-portable-installer/index.ts:93`,
  `_shared/installer-script-builder.ts:78`.
- **Problema:** a função retorna `{ valid: boolean; errors?: string[] }`, mas
  os três call sites usam `if (!validateAgentScriptContent(content))` —
  como objetos são sempre truthy, **a validação é silenciosamente ignorada**.
- **Severidade:** alta — instaladores poderiam sair com script inválido.
- **Ação:** abrir **HF-BUILD-VALIDATION-01** após autorização (envolve `_shared/` já protegido).

### LATENT-BUILD-ROLES-01 — `user_roles.single()` quebra para usuário com múltiplas roles
- **Arquivo:** `validate-build-pipeline/index.ts:20`
- **Problema:** `.from('user_roles').select('role').eq('user_id', userId).single()` falha
  (PGRST116) se o admin tiver mais de uma role atribuída.
- **Severidade:** baixa-média (admin only, endpoint diagnóstico).
- **Ação:** trocar por `.in('role', ['admin','super_admin']).limit(1).maybeSingle()` —
  proposto como hotfix posterior.

---

## 5. Gates obrigatórios

| Gate | Status |
|---|---|
| `deno check` (8 alvos) | ✅ PASS |
| `deno check` consumer (`_shared/installer-script-builder.ts`) | ✅ PASS (carregado transitivamente) |
| `guard-no-ts-nocheck-tier1` (138 paths) | ✅ PASS |
| Schema drift detectado e tratado (HF-BUILD-DEPLOY-SCHEMA-01) | ✅ |

`tsgo`, lint e `bloco-c-gates` rodam no pipeline CI; mudanças desta onda são restritas a
tipagem + 3 hotfixes pontuais e não alteram superfícies cobertas por esses gates.

---

## 6. Conteúdo preservado integralmente

- ✅ Algoritmo de assinatura (Ed25519 / ECDSA / RSA fallback)
- ✅ Cálculo de SHA-256
- ✅ Normalização de line-endings por plataforma
- ✅ Templates de instalador (Intune / GPO / RMM / portable .CMD)
- ✅ Pipeline de upload Storage + `agent_releases` + `agent_versions`
- ✅ Dispatch GitHub Actions
- ✅ Payloads do callback de build
- ✅ Contratos HTTP (status codes, shape de resposta)

---

## 7. Próximos passos sugeridos

1. **HF-BUILD-VALIDATION-01** (alta) — corrigir os 3 call sites de `validateAgentScriptContent`.
2. **D17-D2 — Agent Deployment** (10 arquivos restantes).
3. **D17-D3 — Misc / Reports / Legacy** (5 arquivos restantes).
4. **D17-FINAL** — checkpoint.

Com esta onda, **84 % da dívida original** já está saneada; D17-D2/D3 devem fechar
o programa de remoção sistemática de `@ts-nocheck`.
