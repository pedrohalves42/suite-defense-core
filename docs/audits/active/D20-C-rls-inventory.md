# D20-C — RLS Inventory & Authorization Surface (Read-Only)

**Escopo:** inventário completo da superfície de autorização do banco. **Nenhuma alteração** foi feita em policies, grants, RLS, RPCs ou `SECURITY DEFINER`. Toda remediação será tratada em `HF-RLS-xx` e no `D20-D`.

**Snapshot:** capturado via `psql` em produção, artefatos em `/tmp/d20c/*.txt`.

---

## 1. Estatísticas globais

| Métrica | Valor |
|---|---|
| Tabelas `public.*` | 381 |
| Tabelas com RLS habilitado | 380 |
| Tabelas **sem RLS** | **1** (`agent_system_metrics_2026_08` — partição, ver Finding D20C-01) |
| Tabelas com RLS mas **sem policy** | 0 |
| Policies totais | 957 |
| Views | 4 |
| Materialized views | 10 |
| Funções `SECURITY DEFINER` | 438 (endereçado em D20-D) |
| Cron jobs (`cron.job`) | schema não instalado nesta base (`no cron`) |

### Policies por operação

| cmd | count |
|---|---|
| SELECT | 384 |
| ALL    | 212 |
| INSERT | 191 |
| UPDATE | 116 |
| DELETE | 54 |

### Policies por role

| role | count |
|---|---|
| authenticated | 655 |
| service_role  | 294 |
| public        | 8 |
| anon          | 4 |

### Flags de amplitude

| Flag | Total | Distribuição |
|---|---|---|
| `USING (true)`       | 195 | 185 `service_role`-only · 10 `authenticated`-only (todas `SELECT` em catálogos) |
| `WITH CHECK (true)`  | 270 | Dominada por `service_role` (`FOR ALL`/`FOR INSERT`) |
| `FOR ALL`            | 212 | 100% em `service_role` (blanket writers) |
| Policies com `public` no roles | 8 | ver §3 |
| Policies com `anon` no roles   | 4 | ver §3 |

### Duplicatas e sobreposições

Somente **2** duplicatas exatas (mesma tabela+cmd+roles+qual+with_check):

| Tabela | cmd | Policies redundantes |
|---|---|---|
| `itsm_tickets` | SELECT | `Tenant admins can manage ITSM tickets` ↔ `Tenant users can view their ITSM tickets` |
| `jobs`         | SELECT | `jobs_select_authenticated_tenant` ↔ `authenticated_select_jobs` |

Nenhuma outra policy é *estritamente* duplicada; sobreposições permissivas parciais existem (ex.: `ALL` de admin + `SELECT` de user), mas correspondem ao padrão CRUD normal (não são redundantes semânticamente).

### Policies "mortas" ou órfãs

Cross-check das 284 tabelas com policy vs. `rg -w` em `src/` e `supabase/functions/` retornou **0 tabelas sem consumidor no app** (todas com ≥ 2 referências). Nenhuma candidata Classe D pura foi identificada por ausência de uso.

**Ressalva metodológica:** a checagem detecta o nome da tabela em código, não distingue leitura viva de código legado deploy-morto. A confirmação definitiva de Classe D exige análise de logs/estatísticas de acesso — **fora do escopo desta janela**.

---

## 2. Classificação das policies

### Classe A — Esperada (não requer ação)

Compreende a maioria absoluta:

- `service_role`-only com `USING(true)`/`WITH CHECK(true)` (185 policies) — padrão para writers de Edge Functions.
- Catálogos legíveis por `authenticated` com `USING(true)`: `compliance_benchmarks`, `mitre_attack_techniques`, `mitre_metadata`, `mitre_rules`, `security_definer_allowlist`, `software_knowledge_base`, `software_vulnerability_baseline`, `subscription_plans`, `system_global_state`, `system_state`.
- Denies explícitos (`USING(false)`) em `failed_login_attempts` e `security_logs` — imunização contra escrita/deleção pelo cliente.

### Classe B — Administrativa (revisar mas não bloquear)

Policies em observabilidade/dashboards/SOC/métricas com filtro por tenant + `is_current_super_admin()` (padrão da base). Exemplos: `system_alerts`, `job_executions*`, `slo_*`, `edge_function_metrics`, `dashboard_stats_cache`. **Sem findings novos** — o padrão está consistente. Um item cosmético: as duplicatas `itsm_tickets`/`jobs` (§1) caem aqui.

### Classe C — Sensível (findings abertos, ver §4)

Cobertura em `tenants`, `user_roles`, `api_keys`, `agent_tokens`, `agent_signing_keys`, `enrollment_keys`, `automation_rules`, `automation_approvals`, `audit_logs`, `tenant_subscriptions`, `subscription_events`, `secret_rotation_log`, `invites`, `profiles`, `fido2_credentials`, `saml_configs`, `admin_ip_whitelist`, `hmac_signatures`, `token_validation_failures`.

Padrão dominante: `((tenant_id = get_active_tenant_id()) OR is_current_super_admin())` — coerente e correto. Os *outliers* estão nos findings §4.

### Classe D — Legado / sem consumidor

Nenhuma tabela confirmada nesta janela (ver §1). Candidatas fracas para investigação futura (referenciadas apenas em 2 arquivos, tipicamente migration + 1 job): `audit_logs_old`, `job_executions_old`, `pp02b_canary_snapshots` (janela encerrada), `agent_registration_locks`, `honeypot_rate_buckets`. **Nenhuma ação nesta fase.**

---

## 3. Policies com `public` / `anon` (detalhado)

| Tabela | Policy | cmd | Roles | Avaliação |
|---|---|---|---|---|
| `failed_login_attempts` | `..._no_user_update/delete/insert` | UPD/DEL/INS | `{anon,authenticated}` | ✅ Deny (`false`). Correto — bloqueia clientes. |
| `security_logs` | `..._no_delete_for_users` | DELETE | `{anon,authenticated}` | ✅ Deny. Correto. |
| `fido2_credentials` (×4) | `fido2_*_own` | SEL/INS/UPD/DEL | `{public}` | ⚠️ `TO public` com filtro `user_id = auth.uid()`. Funcionalmente OK (anon → `auth.uid()` = NULL → nega), mas **semanticamente incorreto**: deveria ser `TO authenticated`. Ver Finding D20C-04. |
| `tenant_security_policies` (×2) | `Users can view…`, `Admins can update…` | SEL/UPD | `{public}` | ⚠️ Mesma observação de `fido2_credentials`. Ver Finding D20C-04. |
| `tenants` | `Block suspended tenants` | SELECT | `{public}` | 🔴 Contém UUID hardcoded (`'3adc67e6-…'`) na cláusula `USING`. Ver Finding D20C-02. |
| `user_roles` | `user_roles_insert_restricted` | INSERT | `{public}` | 🔴 Depende de `auth.jwt() ->> 'tenant_id'` — claim customizada. Ver Finding D20C-03. |

---

## 4. Findings

### 🔴 FINDING D20C-01 — Partição sem RLS (`agent_system_metrics_2026_08`)
- **Evidência:** `pg_class.relrowsecurity=false` na partição de agosto/2026; tabela-mãe e todas as demais partições estão com RLS habilitado.
- **Consumidor:** herda os leitores/writers de `agent_system_metrics_partitioned` (endpoints de métricas, dashboards, jobs de retention).
- **Impacto:** consultas que atinjam diretamente a partição (por partition pruning já hoje, ou queries administrativas) **ignoram RLS**, retornando linhas de qualquer tenant.
- **Probabilidade:** média. Consultas normais via tabela-mãe herdam a política, mas queries diretas em backfills/relatórios podem escapar.
- **Recomendação (HF-RLS-01):** `ALTER TABLE agent_system_metrics_2026_08 ENABLE ROW LEVEL SECURITY;` + revisar automação de criação de partição (o gerador de partição precisa emitir `ENABLE RLS`).

### 🔴 FINDING D20C-02 — Policy com UUID hardcoded (`tenants` / `Block suspended tenants`)
- **Evidência:** `USING ((id = '3adc67e6-8908-4d98-b85b-5e93be4673a1'::uuid) OR (suspension_status = 'active'::text) OR (is_super_admin))` — nome sugere *bloqueio*, mas a semântica é *permissive SELECT* que **libera** o tenant fixo e qualquer tenant com `suspension_status='active'`.
- **Consumidor:** o nome sugere provisão de status ao frontend na tela de suspensão; o UUID é o tenant "Genial Cred" (canário PP02).
- **Impacto:** informação leve (linha de `tenants`) exposta a `anon`, mas dependente do valor de `suspension_status`. O UUID hardcoded é *code smell* institucional e a lógica invertida (`OR suspension_status='active'`) contradiz o nome.
- **Probabilidade:** baixa (dado é público de baixa criticidade), mas **alta** de virar bug: qualquer tenant novo marcado como `active` fica visível a `anon`.
- **Recomendação (HF-RLS-02):** remover UUID hardcoded e reescrever com semântica coerente (ou renomear para refletir a lógica atual). Não executar nesta fase.

### 🔴 FINDING D20C-03 — Policies dependentes de `auth.jwt() ->> 'tenant_id'` (claim não-nativa)
- **Evidência:**
  - `user_roles.user_roles_insert_restricted` (INSERT, TO public) — `WITH CHECK` usa `((auth.jwt() ->> 'tenant_id')::uuid)` para validar tenant.
  - `user_roles.user_roles_select_active_tenant` (SELECT) — mesma dependência.
- **Consumidor:** telas de gestão de roles e RPC `has_role` (auditada em `HF-RPC-OVERLOAD-AUDIT-01`).
- **Impacto:** Supabase **não emite** `tenant_id` como custom claim por padrão. Se um Auth Hook (`custom_access_token_hook`) não estiver ativo e íntegro, a claim é `NULL` → `((NULL)::uuid) = tenant_id` é `NULL` → policy **falha silenciosamente** para todos exceto `super_admin`. Se estiver ativo mas mal-configurado, pode injetar tenant errado.
- **Probabilidade:** alta de degradar UX (usuários legítimos são bloqueados) e não-nula de escalada (se hook usar dados manipuláveis pelo cliente).
- **Recomendação (HF-RLS-03):** trocar `auth.jwt() ->> 'tenant_id'` por `get_active_tenant_id()` (padrão institucional da base). Requer validação do hook ativo antes de mudar — **investigar em D20-D**.

### 🟡 FINDING D20C-04 — `TO public` desnecessário em tabelas sensíveis
- **Evidência:** 6 policies em `fido2_credentials` (4) e `tenant_security_policies` (2) declaradas `TO public`.
- **Consumidor:** UI de MFA e config de segurança do tenant.
- **Impacto:** funcionalmente equivalente a `TO authenticated` (filtro `auth.uid()` neutraliza sessão `anon`), mas viola o princípio de menor privilégio e polui o inventário de policies expostas a `anon`.
- **Probabilidade:** baixa (nenhum bypass conhecido), mas **alta** de causar falsos positivos em auditorias futuras.
- **Recomendação (HF-RLS-04):** substituir `TO public` por `TO authenticated`.

### 🟡 FINDING D20C-05 — Policies redundantes (`itsm_tickets`, `jobs`)
- **Evidência:** 2 duplicatas exatas listadas em §1.
- **Consumidor:** listagem de tickets ITSM e jobs no frontend.
- **Impacto:** nenhuma exposição adicional (policies permissivas se combinam por OR). Sinal de drift acumulado — dois trechos de migração criaram a mesma regra.
- **Probabilidade:** confusão em revisões futuras / manutenção.
- **Recomendação (HF-RLS-05, cosmético):** remover a redundante em cada par. Não urgente.

---

## 5. Cadeia de consumo (para policies Classe C)

Padrão observado em toda a Classe C:

```
Frontend (React/Vite)
   └─► Edge Function (supabase/functions/*)      ← usa SUPABASE_ANON_KEY + JWT do usuário
         └─► RPC SECURITY DEFINER (`get_active_tenant_id`, `is_current_super_admin`, `has_role`)
               └─► Tabela sensível
                     └─► Policy: `tenant_id = get_active_tenant_id() OR is_current_super_admin()`
```

- `get_active_tenant_id()` e `is_current_super_admin()` foram cobertos em auditorias anteriores (D20-A + HF-RPC-OVERLOAD-AUDIT-01) e são o backbone de autorização.
- `hmac_signatures*`, `token_validation_failures`, `agent_tokens`: fluxo alternativo via `service_role` + HMAC do agente (D20-B).
- `audit_logs`: escrita exclusiva via `service_role`; leitura authenticated por tenant (correto).

Não foram identificados caminhos de consumo *inesperados* nesta amostra. A dependência crítica é `get_active_tenant_id()` — sua integridade sustenta ~600 policies.

---

## 6. Cruzamento com superfícies indiretas

| Superfície | Estado | Ação D20-C |
|---|---|---|
| `SECURITY DEFINER` (438 funções) | `SET search_path` validado (D20-A). Owner validado (D20-Gate-4). EXECUTE grants a `PUBLIC` **não avaliados** aqui. | Endereçado em **D20-D**. |
| Views (4) | Nome e uso não coletados nesta janela. | Amostrar em D20-C-follow-up (30 min) ou incluir em D20-D. |
| Materialized views (10) | Idem. MVs **não respeitam RLS** por natureza — precisam de wrapper ou grant restrito. | Endereçado em **D20-D**. |
| Cron jobs (`pg_cron`) | Extensão não instalada nesta base (`SELECT COUNT(*) FROM cron.job` → falha). Agendamento vive em `scheduled_jobs` (tabela app-level) + edge functions. | Sem risco RLS adicional. |
| Triggers | Não enumerados nesta janela; auditoria D20-A já garantiu `search_path` nos DEFINERs. | Follow-up opcional. |

---

## 7. Critério de aceite

> "Sabemos por que cada policy existe, quem a utiliza e qual seria o impacto de removê-la."

**Status:** ✅ atendido para as classes A, B e C. Para Classe D, atendido *conservadoramente*: não há tabela sem consumidor de código; a remoção depende de evidência de acesso em runtime, fora do escopo desta janela.

---

## 8. Backlog gerado (para HF-RLS-xx)

| ID | Prioridade | Descrição |
|---|---|---|
| **HF-RLS-01** | P0 | Habilitar RLS em `agent_system_metrics_2026_08` + corrigir gerador de partição. |
| **HF-RLS-03** | P1 | Substituir `auth.jwt() ->> 'tenant_id'` por `get_active_tenant_id()` em `user_roles` (após validar hook em D20-D). |
| **HF-RLS-02** | P2 | Remover UUID hardcoded e revisar semântica de `tenants.Block suspended tenants`. |
| **HF-RLS-04** | P2 | Trocar `TO public` → `TO authenticated` em `fido2_credentials` e `tenant_security_policies`. |
| **HF-RLS-05** | P3 | Remover policies duplicadas em `itsm_tickets` e `jobs`. |

Nenhum hotfix executado nesta fase. Aguardando decisão para abertura sequencial após **D20-D**.
