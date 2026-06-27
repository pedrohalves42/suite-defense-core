# Bloco D14-A4 — Public / Release / Signing — Resultado

**Status:** ✅ PASS  
**Data:** 2026-06-27  
**Escopo:** Saneamento de tipagem em superfície de Release/Signing/API Gateway sem alterar runtime, criptografia ou contratos públicos.

---

## 1. Arquivos saneados (7 alvos)

| Arquivo | `deno check` |
|---|---|
| `supabase/functions/register-agent-release/index.ts` | ✅ |
| `supabase/functions/sign-release/index.ts` | ✅ |
| `supabase/functions/promote-agent-v5/index.ts` | ✅ |
| `supabase/functions/api-gateway/handlers/agent-ops.ts` | ✅ |
| `supabase/functions/api-gateway/handlers/security-advisor.ts` | ✅ |
| `supabase/functions/api-gateway/handlers/security-scanning.ts` | ✅ |
| `supabase/functions/api-gateway/handlers/security-threats.ts` | ✅ |

### Natureza das correções
- Remoção da diretiva `// @ts-nocheck`.
- Anotações explícitas `: any` em parâmetros de callback (`.map`/`.filter`/`.find`) sobre coleções tipadas como `any` (sem reescrever lógica).
- Cast `as never` em `.upsert()` / `.insert()` quando o payload é construído como `Record<string, unknown>` (preserva integralmente o objeto enviado).
- Nenhuma mudança em: algoritmo de hash, assinatura Ed25519/ECDSA, validação de assinatura, política de rollout, distribuição, HMAC, tenant binding, status HTTP ou contrato público.

---

## 2. API-GATEWAY-DRIFT-01 — Absorvido

Erros de tipo transitivos pré-existentes corrigidos para que `deno check supabase/functions/api-gateway/index.ts` retorne limpo:

| Arquivo | Correção | Tipo |
|---|---|---|
| `api-gateway/handlers/admin.ts` | 4 `(x: any)` em `.map/.find` (linhas 212, 223, 228, 229) | drift |
| `api-gateway/handlers/billing.ts` | 3 `(x: any)` em `.some` (linhas 195, 212, 492) | drift |
| `api-gateway/handlers/enrollment.ts` | 1 `(r: any)` em `.find` (linha 92) | drift |
| `api-gateway/handlers/tenant-api.ts` | `userId: null` → `userId: undefined` em 3 chamadas a `createAuditLog` (linhas 67, 102, 139) — alinhamento com contrato HF-AUDIT-CONTRACT-01 | drift |
| `api-gateway/index.ts` | `type SB = any;` adicionado (referenciado em linha 171) | drift |
| `api-gateway/index.ts` | `(validationErr as Error).message` (linha 234) | drift |

---

## 3. Bugs latentes encontrados e corrigidos (registrados separadamente)

Conforme regra do bloco, cada bug latente é registrado em separado:

### BUG-D14A4-01 — Import órfão `./honeypot.ts` em `api-gateway/index.ts`
- **Severidade:** ALTA (cold-start failure potencial).
- **Local:** `supabase/functions/api-gateway/index.ts:47`.
- **Sintoma:** `import { handleActivateAgentHoneypot, handleRevertAgentHoneypot } from './honeypot.ts'` apontava para caminho inexistente. O módulo real é `./handlers/honeypot.ts`.
- **Impacto:** O api-gateway falharia ao carregar (TS2307 + erro Deno em runtime ao primeiro request). Provavelmente mascarado por cache de bundle anterior.
- **Correção:** path corrigido para `./handlers/honeypot.ts`. Nenhuma mudança em assinatura, comportamento ou rota (`security:activate-agent-honeypot` / `security:revert-agent-honeypot` permanecem idênticos).

### BUG-D14A4-02 — Símbolo não importado: `handleRevenueProjectionsV2`
- **Severidade:** ALTA (rota `billing:revenue-projections` quebrada).
- **Local:** `supabase/functions/api-gateway/index.ts:170`.
- **Sintoma:** `ACTION_TO_FUNCTION` referencia `handleRevenueProjectionsV2`, mas o símbolo não estava no bloco de imports de `./handlers/billing-v2.ts`.
- **Impacto:** O módulo nunca carregaria; `billing:revenue-projections` retornaria erro 500.
- **Correção:** adicionado ao `import` de `./handlers/billing-v2.ts` (handler exportado e disponível desde antes; era apenas import faltante).

### BUG-D14A4-03 — `signWithPrivateKey(document_hash, undefined)` em `sign-release`
- **Severidade:** MÉDIA (NPE/TypeError ao chamar `sign-document` sem `ECDSA_PRIVATE_KEY` no ambiente).
- **Local:** `supabase/functions/sign-release/index.ts` (case `sign-document`).
- **Sintoma:** O código lia `Deno.env.get('ECDSA_PRIVATE_KEY')` (potencialmente `undefined`) e o passava direto para `signWithPrivateKey`, sem validação. Outros casos do mesmo arquivo (ex. `sign-existing`) já faziam essa checagem.
- **Correção:** validação explícita `if (!privateKey) return respond({ error: 'Missing ECDSA_PRIVATE_KEY secret' }, 400);`. Mudança de comportamento mínima: substitui crash não tratado por resposta 400 estruturada — alinhado ao padrão dos demais ramos do switch. Algoritmo, formato e fluxo de assinatura permanecem inalterados.

---

## 4. Follow-ups abertos

| ID | Descrição | Prioridade |
|---|---|---|
| API-GATEWAY-DRIFT-02 | Estender `deno check` por arquivo no CI para todos os handlers de `api-gateway/` — atualmente o gate verifica apenas presença de `@ts-nocheck`, não drift transitivo. | Média |
| BILLING-CONTRACT-01 | `billing.ts` mantém `type SB = any`; planejar migração gradual para `SupabaseClient<Database>` (sem mudança runtime). | Baixa |
| TENANT-API-AUDIT-01 | `tenant-api.ts` chama `createAuditLog` sem `userId` em rotas de API externa (correto pelo novo contrato), mas convém anexar `api_key_id` como ator principal em `details` (já presente) e documentar. | Baixa |
| HONEYPOT-PATH-01 | Auditoria one-shot de todos os `import './...'` no gateway para garantir que não há outro path órfão similar. | Média (próxima onda) |
| TYPEGEN-SYNC-01 | (já catalogado) sincronização automática de `database.types.ts` no CI. | Média |

---

## 5. Expansão dos gates

- `scripts/guard-no-ts-nocheck-tier1.sh` agora protege **55 arquivos** (era 48). +7 alvos de D14-A4.
- Gate executado pós-mudança: **PASS**.

---

## 6. Consumidores validados

| Consumer | Resultado |
|---|---|
| `deno check supabase/functions/api-gateway/index.ts` (gateway principal — consome todos os handlers tocados) | ✅ PASS |
| `deno check` individual dos 7 alvos de D14-A4 | ✅ PASS |
| `bash scripts/guard-no-ts-nocheck-tier1.sh` (gate Tier 1) | ✅ PASS |
| Handlers `admin.ts`, `billing.ts`, `enrollment.ts`, `tenant-api.ts` (afetados por drift) | ✅ PASS (compilam isoladamente e via gateway) |

---

## 7. Inventário pós-D14-A4

- `@ts-nocheck` ativos em `supabase/functions/**`: **78** (eram 85 antes de D14-A4).
- Tier A (release/signing/api-gateway crítico): **0** restantes.
- Próxima onda recomendada: **D15 — Ops Platform** (maior superfície operacional).

---

## 8. Garantias de não-regressão

- HMAC, replay protection, política de rollout, distribuição de releases, ordem de operações em `agent_releases`/`agent_versions`, status codes e shapes de resposta: **inalterados**.
- Auto-sign (Ed25519/ECDSA), fallback manual de assinatura, validação de versão embedded, normalização de line endings por plataforma: **inalterados**.
- Auditoria (`createAuditLog`): contratos preservados; apenas alinhamento `null`→`undefined` para conformidade com HF-AUDIT-CONTRACT-01.
