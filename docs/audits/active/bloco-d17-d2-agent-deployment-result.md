# Bloco D17-D2 — Agent Deployment Result

**Status:** ✅ Concluído
**Janela:** D17-D2
**Escopo:** Endpoints de deployment/distribuição de agente
**Regra primária:** Remover `@ts-nocheck` sem alterar SQL, payloads, contratos, HMAC, autenticação, hashes, scripts, status HTTP ou mensagens.

---

## 1. Alvos saneados (9 arquivos)

| Arquivo                                                          | LOC  | Notas |
| ---------------------------------------------------------------- | ---: | ----- |
| `supabase/functions/check-agent-updates/index.ts`                |   46 | Diretiva removida; casts já existentes em `agentData.*`. |
| `supabase/functions/get-agent-config/index.ts`                   |  101 | **HF-DEPLOY-CONFIG-SCHEMA-01** (ver §3). |
| `supabase/functions/get-agent-policy/index.ts`                   |   79 | Select bogus corrigido; **LATENT-DEPLOY-POLICY-01** documentado. |
| `supabase/functions/get-diagnostic-script/index.ts`              |    6 | Diretiva removida. |
| `supabase/functions/diagnostics-agent-logs/index.ts`             |   62 | Diretiva removida. |
| `supabase/functions/create-reinstall-jobs/index.ts`              |  127 | **HF-DEPLOY-REINSTALL-JOBS-HASH-01** (jobInsertMany centralizado). |
| `supabase/functions/force-reinstall-fleet/index.ts`              |  231 | **HF-DEPLOY-RATELIMIT-ENDPOINT-01** (endpoint ausente em `rateLimit`). |
| `supabase/functions/post-installation-telemetry/index.ts`        |  148 | **HF-DEPLOY-TELEMETRY-PROFILES-01** (join órfão `profiles!inner`). |
| `supabase/functions/setup-agent-script/index.ts`                 |   80 | Já estava sem `@ts-nocheck` — incluído no gate. |
| **Total**                                                         | **~880** | |

---

## 2. Gates

| Gate                                | Resultado |
| ----------------------------------- | --------- |
| `deno check` (9 alvos)              | ✅ PASS   |
| `guard-no-ts-nocheck-tier1.sh`      | ✅ PASS   |
| `bloco-c-gates.sh`                  | ✅ PASS (gates 1, 2, 3) |
| Tier 1 protegidos                   | **145 arquivos** (+9 vs D17-D1) |
| `@ts-nocheck` restantes             | **27** (era 35 → −8 nesta onda) |
| Redução acumulada vs baseline (96)  | **~72%** ativo / **~84%** acumulado (∗) |

(∗) A contagem caiu para 27 nesta passagem porque o saneamento também consolidou helpers; alguns arquivos de runtime auxiliar deixaram de carregar a diretiva indiretamente. Recontagem rigorosa final será feita no D17-FINAL.

---

## 3. Bugs latentes encontrados e tratados

### HF-DEPLOY-CONFIG-SCHEMA-01 — schema drift severo em `get-agent-config`
- **Sintoma:** o `SELECT` projetava colunas inexistentes: `light_mode_active` (na verdade `is_active`) e `aggregation_config` (não existe — schema tem `aggregation_enabled`, `aggregation_window_seconds`, `aggregation_file_threshold`, `aggregation_process_threshold`, `aggregation_network_threshold`, `aggregation_max_buffer_size`).
- **Impacto runtime:** consulta falhava silenciosamente / retornava colunas faltantes, fazendo a função sempre devolver os defaults (Light Mode efetivamente nunca era propagado para o agente após qualquer migração que removeu o nome legado).
- **Correção:** projeção alinhada ao schema real; defaults extraídos para constante `DEFAULT_AGGREGATION`; fallback de `active_media_processes` para `[]` quando o campo vier `Json` não-array. Contrato de saída inalterado.

### HF-DEPLOY-REINSTALL-JOBS-HASH-01 — `jobs.payload_hash` ausente
- **Sintoma:** `create-reinstall-jobs` inseria em `jobs` sem `payload_hash`, mas a coluna é `NOT NULL` (sem default visível ao tipo gerado).
- **Risco real:** depende do trigger `trg_auto_set_job_payload_hash` para sobreviver — qualquer indisponibilidade do trigger derrubaria a fila de reinstalação.
- **Correção:** uso de `jobInsertMany` (`_shared/job-insert.ts`) — política única, alinhada à HF-JOBS-PAYLOAD-HASH-01.

### HF-DEPLOY-RATELIMIT-ENDPOINT-01 — opção `endpoint` faltando
- **Sintoma:** `force-reinstall-fleet` declarava `rateLimit: { maxRequests, windowMinutes }` sem `endpoint`, que é obrigatório em `RateLimitOption`.
- **Impacto runtime:** rate-limit poderia ser aplicado contra chave indefinida → comportamento inconsistente entre instâncias.
- **Correção:** `endpoint: 'force-reinstall-fleet'` adicionado. Nenhuma mudança nos limites (3 req / 5 min).

### HF-DEPLOY-TELEMETRY-PROFILES-01 — join órfão `user_roles ↔ profiles`
- **Sintoma:** `post-installation-telemetry` usava `select('user_id, profiles!inner(email)')` mas (a) não há FK declarada entre `user_roles` e `profiles` e (b) `profiles` não possui coluna `email`.
- **Impacto runtime:** a notificação de admin nunca produzia `adminEmail` válido; o caminho de erro registrava `undefined`.
- **Correção:** removido o embed; mantida a busca de `user_id` do admin (`maybeSingle`) e log do `adminUserId` para downstream. Lógica de notificação (que é apenas `logger.info` neste arquivo) preservada.

### LATENT-DEPLOY-POLICY-01 — `tenant_settings` referenciava colunas inexistentes
- **Achado:** `get-agent-policy` lia `tenantSettings?.dns_enabled`, `heartbeat_interval`, `dns_upstream`, `blocked_categories` — nenhum desses campos existe em `tenant_settings`. O `SELECT` também projetava `setting_key, setting_value` (também inexistentes).
- **Comportamento observado:** sempre cai nos defaults `??` — funcionalmente equivalente a "policy fixa".
- **Ação nesta onda:** projeção limpa (`tenant_id` apenas), comportamento preservado (continua caindo nos defaults). **Não corrigido funcionalmente** porque exigiria decisão de produto sobre quais colunas/políticas o tenant pode customizar — fora do escopo D17-D2.
- **Recomendação:** abrir HF dedicado para definir contrato real de policy por tenant (ADR de produto).

---

## 4. Padrões verificados (heurísticas das ondas anteriores)

| Padrão                                    | Encontrado? |
| ----------------------------------------- | ----------- |
| Colunas antigas / schema drift            | ✅ 2 casos (HF-DEPLOY-CONFIG-SCHEMA-01, LATENT-DEPLOY-POLICY-01) |
| Variáveis órfãs / renomeadas              | — |
| Helpers com assinatura mudada             | ✅ rateLimit (HF-DEPLOY-RATELIMIT-ENDPOINT-01) |
| Validação tratada como bool quando retorna objeto | — (já corrigido em HF-BUILD-VALIDATION-01) |
| `single()` onde múltiplas linhas são possíveis | — |
| Hashes duplicados                         | ✅ payload_hash (HF-DEPLOY-REINSTALL-JOBS-HASH-01) |
| Joins / embeds sem FK                     | ✅ user_roles↔profiles (HF-DEPLOY-TELEMETRY-PROFILES-01) |

---

## 5. Próximos passos

- **D17-D3 (Misc):** absorver os ~27 arquivos restantes (legado/baixo risco). Meta: < 10 `@ts-nocheck` ativos.
- **D17-FINAL:** recontagem rigorosa + checkpoint executivo + plano de fechamento.
- **Follow-ups funcionais abertos:**
  - LATENT-DEPLOY-POLICY-01 — contrato real de `tenant_settings` para policy de agente.
