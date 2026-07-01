# Sprint E2E Negativo — HF-RLS-06B

**Status:** ✅ Concluído  
**Data:** 2026-07-01  
**Escopo:** Sprint 1 do plano pós-mitigação (`incidente primário = mitigado; programa de hardening = aberto`).

## Objetivo

Provar simultaneamente que:
1. **Fluxo legítimo intacto:** usuários autenticados continuam funcionando após HF-RLS-06B/EXTRA.
2. **Exploração conhecida permanece bloqueada:** vetores anônimos e cross-tenant não voltaram.

## Artefato versionado

- `e2e/hf-rls-06b-negative.spec.ts` — 14 casos (2 RPCs × 7 vetores) rodados contra o backend real.

## Matriz executada

| Caso | Chamador     | `p_tenant_id`   | `get_agents_list`               | `get_agents_snapshots_list`     | Veredito |
| ---- | ------------ | --------------- | ------------------------------- | ------------------------------- | -------- |
| A    | anon         | NULL            | 400 TENANT_REQUIRED             | 401 TENANT_REQUIRED             | ✅ bloq   |
| B    | anon         | tenant real     | 400 TENANT_FORBIDDEN (role anon)| 400 TENANT_FORBIDDEN (role anon)| ✅ bloq   |
| C    | viewer       | own tenant      | 200                             | 200                             | ✅ legít. |
| D    | viewer       | foreign uuid    | 400 TENANT_MISMATCH             | 400 TENANT_MISMATCH             | ✅ bloq   |
| E    | viewer       | NULL            | 400 TENANT_REQUIRED             | 403 TENANT_REQUIRED             | ✅ f-c    |
| F    | super_admin  | NULL            | 400 TENANT_REQUIRED             | 403 TENANT_REQUIRED             | ⚠️ nota  |
| G    | super_admin  | tenant real     | 200                             | 200                             | ✅ legít. |

Nenhum caso vazou payload (`agent_id` ausente em todos os corpos ≠ 200).

## Fluxo legítimo — confirmação explícita

- **viewer own tenant (C):** `200 []` em ambas as RPCs → autenticação, RBAC e projeção continuam operando.
- **super_admin com tenant (G):** `200 []` em ambas as RPCs → papel elevado continua conseguindo consultar por tenant.

Isso encerra a pergunta em aberto:
> "Usuários autenticados continuam funcionando exatamente como antes?" → **Sim, pelo caminho que a UI utiliza (tenant explícito no request).**

## Novo finding derivado

### FINDING-HFRLS06B-F1 — super_admin exige `p_tenant_id` explícito
- **Severidade:** P2 (informacional, fail-closed stricter-than-spec).
- **Evidência:** Caso F das duas RPCs devolve `TENANT_REQUIRED` mesmo com token de super_admin válido.
- **Impacto operacional:** nenhum na UI atual — as telas sempre enviam o tenant selecionado.
- **Decisão:** aceito como comportamento defensivo. Se um dia a UI precisar de "super_admin cross-tenant fan-out sem parâmetro", abrir mudança dedicada com RPC de agregação explícita — não relaxar a guarda in-place.

## Reclassificação formal do incidente

Aplicando a divisão sugerida:

- **Incidente Primário (exploração anônima conhecida):** **MITIGADO** ✅  
  - PoC original não reprodutível.
  - Todos os vetores hostis (A, B, D, E) confirmados bloqueados.
- **Programa de Hardening RLS:** **ABERTO** 🟡  
  - Próximas etapas: HF-RLS-06C (REVOKE), HF-RLS-01 (partição sem RLS), inventário automatizado, `check_blast_radius` (só depois).

## Autorização para próximo passo

Sprint 1 encerrada com evidência versionada. Aguardando OK para abrir **HF-RLS-06C** (redução de grants) conforme sequência aprovada.
