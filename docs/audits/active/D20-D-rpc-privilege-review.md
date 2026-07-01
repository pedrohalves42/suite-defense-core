# D20-D — RPC / SECURITY DEFINER / JWT Hook Review (Read-Only)

**Escopo:** avaliar `SECURITY DEFINER`, `EXECUTE` grants, JWT hook customizado, views/materialized views e caminhos indiretos de bypass de RLS como **um único sistema de autorização**.

**Regra desta janela:** **nenhum hotfix aplicado.** Toda remediação vira `HF-RLS-xx` para o D20-E.

Artefatos brutos em `/tmp/d20d/*.txt`.

---

## 1. Inventário SECURITY DEFINER

**Total:** 438 funções `SECURITY DEFINER` no schema `public`, todas com owner `postgres` (validado em D20-Gate-4) e `SET search_path` (validado em D20-A).

### Distribuição de `EXECUTE` grants

| Grant | Funções | Interpretação |
|---|---|---|
| `PUBLIC` (implícito ou explícito) | **6** | ⚠️ Superfície exposta. Detalhado em §2. |
| `anon` (explícito) | **3** | ⚠️ Chamável sem sessão. Detalhado em §2. |
| `authenticated` (explícito) | 63 | Superfície RPC oficial do frontend. Amostra em §3. |
| Restritas (`postgres` / `service_role` / `sandbox_exec` apenas) | **375** | ✅ Chamadas somente por edge functions e triggers internos. |

**Contraste importante com o Finding D20-GATE-01:** a suspeita inicial de que "a maioria das 438 concede `EXECUTE TO PUBLIC`" **não se confirmou**. O guard `assert_security_definer_owner.sql` inspecionava apenas ownership; o padrão real é o oposto — 85% (375/438) estão devidamente restritas. **O D20-GATE-01 pode ser fechado como falso positivo**, com uma ressalva: as 6+3 exposições reais existem e são endereçadas abaixo.

---

## 2. Funções com exposição PUBLIC / anon (detalhe crítico)

### 2.1 `PUBLIC EXECUTE` (6 funções)

| Função | Args | Risco | Análise |
|---|---|---|---|
| `enforce_critical_job_evidence()` | — | ✅ P3 | **Trigger function** (`AFTER INSERT/UPDATE ON jobs`). O grant PUBLIC é inerte — só o trigger a executa. Manter. |
| `check_tenant_suspension(uuid)` | tenant | 🟡 P2 | Usada em fluxos pré-auth (splash de suspensão). Retorna somente boolean — leak mínimo. Restringir a `anon+authenticated` seria mais preciso, mas não urgente. |
| `get_agents_list(uuid, bool)` | tenant, incl_arch | 🔴 **P0** | **Listagem completa de agents por tenant, PUBLIC.** Depende de checagem interna via `is_current_super_admin()` / `get_active_tenant_id()`. Precisa ser confirmado que a função rejeita chamador não-autenticado. Ver Finding D20D-01. |
| `get_agents_list(uuid, bool, uuid)` | tenant, incl_arch, agent | 🔴 **P0** | Mesma classe. |
| `get_agents_snapshots_list(uuid)` | tenant | 🔴 **P0** | Snapshots de agents por tenant. Mesma exposição. |
| `has_role(uuid, text, uuid)` | user, role, tenant | 🟡 **P1** | Overload 3-arg (pós-`HF-RPC-OVERLOAD-AUDIT-01`). Chamável por `PUBLIC+anon+authenticated`. Retorna boolean — não vaza dados, mas permite **oráculo de roles** (probing). Ver Finding D20D-03. |

### 2.2 `anon EXECUTE` explícito (3 funções)

| Função | Análise |
|---|---|
| `enforce_critical_job_evidence()` | Trigger — inerte. |
| `has_role(uuid, text, uuid)` | Já contabilizado acima. |
| `check_blast_radius(uuid, text, integer, text)` | 🔴 **P1**. Migração `20260628171343` fez `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated, service_role`. **`anon` persistiu de estado anterior.** Chamável sem sessão. Ver Finding D20D-02. |

### 2.3 Funções restritas — comportamento validado

Amostra das 63 `authenticated`-EXECUTE mostra padrão consistente: prefixo `get_*` para leituras tenant-scoped, `_assert_*` para guards, `archive_*`/`acknowledge_*` para escritas tenant-scoped. Todas presumidamente delegam ao par `get_active_tenant_id()` + `is_current_super_admin()`. **Verificação profunda por função é backlog D20-E.**

---

## 3. Validação do `custom_access_token_hook`

**Pergunta central do bloco.** Resultado da inspeção:

| Verificação | Resultado |
|---|---|
| Função existe no DB (busca por `%access_token_hook%`, `%custom%hook%`, `%jwt_hook%`) | ❌ **Nenhuma função encontrada** |
| Instalada e ativa (configurada em `auth.hooks`) | ❌ Não aplicável (não existe) |
| Injeta `tenant_id` no JWT | ❌ Não |
| Injeta `roles` no JWT | ❌ Não |
| Injeta `is_super_admin` | ❌ Não (mas Supabase pode expor esta claim nativamente para users com `auth.users.is_super_admin=true`) |

### Impacto sobre as 5 policies que consomem `auth.jwt() ->>`

| Tabela / Policy | Claim consumida | Situação real |
|---|---|---|
| `cve_database` / `Service role can manage CVE database` | `role='service_role'` | ✅ **Nativa do Supabase** (PostgREST injeta). Funciona. |
| `cve_sync_status` / `Service role can manage sync status` | `role='service_role'` | ✅ Idem. |
| `tenants` / `Block suspended tenants` | `is_super_admin::boolean` | 🟡 Depende do bit em `auth.users`. Provavelmente sempre `false` para usuários regulares — semantica ainda quebrada (ver D20C-02). |
| `user_roles` / `user_roles_insert_restricted` (INSERT, TO public) | `tenant_id` | 🔴 **Sempre `NULL`** — a claim não é injetada. Resultado: `((NULL)::uuid = tenant_id)` avalia para `NULL`, tratado como `false`. O `WITH CHECK` só passa via ramo `is_current_super_admin()`. |
| `user_roles` / `user_roles_select_active_tenant` | `tenant_id` | 🔴 Mesma degradação. O ramo `(user_id = auth.uid())` compensa parcialmente (usuários veem apenas seu próprio registro). **Não há bypass**, mas há **quebra funcional silenciosa**: usuários não veem os demais registros do seu tenant, apenas os próprios. |

### Reclassificação do Finding D20C-03

O Finding D20C-03 muda de perfil:

- **Não é vulnerabilidade de escalada** (a claim ausente cai em `NULL`, fecha).
- **É bug funcional latente** — a policy foi escrita presumindo um hook que nunca foi implantado. Frontend de gestão de roles opera hoje através dos ramos `is_current_super_admin()` e `user_id = auth.uid()`; qualquer feature que dependa de "admin listar todos os roles do meu tenant" está quebrada silenciosamente.
- **Prioridade rebaixada de P1 → P2**, mas **escopo ampliado**: precisa de HF-RLS que troque `auth.jwt() ->> 'tenant_id'` por `get_active_tenant_id()` (que é a fonte de verdade da base).

---

## 4. Grafo de autorização consolidado

```
Frontend
   │
   ▼
JWT (Supabase Auth)
   │  claims nativas: sub, email, role, aud, exp
   │  claim custom "tenant_id":  ❌ NÃO INJETADA  (D20D-04)
   │  claim custom "is_super_admin": nativa se auth.users.is_super_admin=true
   │
   ▼
Edge Function (verify_jwt=false; validação em código via getClaims)
   │  Client construído com Authorization: Bearer <JWT>
   │
   ▼
RPC pública (63 authenticated + 6 PUBLIC + 3 anon)
   │
   ▼
SECURITY DEFINER
   │  owner=postgres | search_path fixado | 375 restritas + 63 pub-auth
   │
   ▼
Guards internos: get_active_tenant_id()  +  is_current_super_admin()
   │  ← fonte de verdade real da autorização
   │
   ▼
Tabela com RLS (380/381)
   │  Policies dominantes: (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
   │
   ▼
Views (93, todas SECURITY INVOKER) / MVs (4, sem grant a anon/authenticated)
```

**Observações:**

- **93/93 views são `SECURITY INVOKER`** — respeitam RLS do chamador. Nenhum bypass estrutural via view.
- **4/4 MVs sem grant a `anon`/`authenticated`** — só `postgres`/`service_role`/`sandbox_exec` leem. Sem exposição direta ao usuário final.
- A base de confiança repousa em `get_active_tenant_id()` e `is_current_super_admin()` — a saúde delas foi validada em D20-A e HF-RPC-OVERLOAD-AUDIT-01.

---

## 5. Bypass indireto de RLS (§5 do escopo)

Padrão perigoso procurado:

```
Tabela com RLS correta → RPC SECURITY DEFINER com SELECT sem filtro → vazamento
```

### Casos suspeitos (auditoria estática, sem execução)

As 6 funções `PUBLIC EXECUTE` de §2.1 são exatamente esse padrão: rodam com privilégios do owner (`postgres`, que ignora RLS) e retornam dados por tenant. Precisam demonstrar filtro rigoroso no corpo.

**Backlog D20-E (leitura de corpo):**
- `get_agents_list(uuid, bool)` — validar se o `p_tenant_id` recebido é **cruzado** com `get_active_tenant_id()` do chamador (ou `is_current_super_admin`), e não usado cegamente como filtro.
- `get_agents_list(uuid, bool, uuid)` — idem.
- `get_agents_snapshots_list(uuid)` — idem.
- `check_tenant_suspension(uuid)` — se retorna apenas boolean para tenant pedido, aceitável; se retorna metadata, revisar.

**Se qualquer uma dessas 3 `get_*` NÃO cruzar `p_tenant_id` com `get_active_tenant_id()`, existe bypass cross-tenant.** Esta verificação exige leitura do corpo (`pg_get_functiondef`) e será tratada como Finding D20D-01 no D20-E.

### Guards já validados

- `has_role` (2-arg, restrita a service_role) — usada por RLS de outras tabelas. Auditada em `HF-RPC-OVERLOAD-AUDIT-01`.
- `has_role` (3-arg, PUBLIC) — retorna boolean, sem SELECT sem filtro. Não é bypass, mas é oráculo (D20D-03).

---

## 6. Findings do D20-D

### 🔴 FINDING D20D-01 — 3 RPCs `PUBLIC EXECUTE` que retornam dados por tenant
- **Evidência:** `get_agents_list(uuid, bool)`, `get_agents_list(uuid, bool, uuid)`, `get_agents_snapshots_list(uuid)` com `EXECUTE TO PUBLIC` (via `acldefault`) e `SECURITY DEFINER`.
- **Consumidor:** Dashboards de agents (Admin UI RLS Sync). Uso legítimo requer `authenticated`, nunca `anon`.
- **Impacto:** se o corpo confia em `p_tenant_id` recebido do cliente sem cruzar com `get_active_tenant_id()`/`is_current_super_admin()`, qualquer chamador (incluindo anon) pode enumerar agents de qualquer tenant informando o UUID. **Confirmação depende de leitura do corpo (deferida ao D20-E).**
- **Probabilidade:** alta se não houver guard interno; média se houver.
- **Recomendação (HF-RLS-06):** (a) confirmar guard interno; (b) revogar PUBLIC e conceder somente `authenticated`.

### 🔴 FINDING D20D-02 — `check_blast_radius` com `anon EXECUTE` residual
- **Evidência:** migração `20260628171343` fez `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated, service_role`, mas `anon` permanece com EXECUTE (estado herdado de versão anterior).
- **Consumidor:** `ops-playbook`, `ops-gateway`, `create-reinstall-jobs`, `auto-remediate` — todos edge functions autenticadas.
- **Impacto:** RPC ficha-espelho da fachada oficial de política de raio de explosão. Chamável por `anon` permite reconhecimento de política (`can I do action X on tenant Y?`) sem sessão.
- **Probabilidade:** baixa de exploração, alta de aparecer em auditoria externa.
- **Recomendação (HF-RLS-07):** `REVOKE EXECUTE ON FUNCTION check_blast_radius(...) FROM anon;`

### 🟡 FINDING D20D-03 — `has_role(uuid, text, uuid)` como oráculo público
- **Evidência:** overload 3-arg com `EXECUTE TO PUBLIC` + `anon` + `authenticated`.
- **Consumidor:** validado como legítimo por `HF-RPC-OVERLOAD-AUDIT-01` — chamado por policies via `authenticated`; nenhuma chamada explícita do frontend precisa de `PUBLIC`.
- **Impacto:** permite probing de `(user_id, role, tenant_id)` — o retorno boolean vaza a resposta sem consumir sessão. Sem escalada direta.
- **Probabilidade:** média (reconhecimento).
- **Recomendação (HF-RLS-08):** revogar `PUBLIC`+`anon`; manter apenas `authenticated`+`service_role`.

### 🟡 FINDING D20D-04 — `custom_access_token_hook` inexistente
- **Evidência:** nenhuma função em `pg_proc` corresponde a padrões de hook JWT customizado.
- **Consumidor:** 3 policies em `tenants` / `user_roles` presumem claim `tenant_id` no JWT.
- **Impacto:** não é escalada (branch avalia `NULL` → `false`). É **degradação funcional silenciosa** — cenários de "admin do tenant vê todos os roles" ficam quebrados dependendo do frontend.
- **Probabilidade:** confirmada (bug latente).
- **Recomendação (HF-RLS-03, revisado):** trocar `auth.jwt() ->> 'tenant_id'` por `get_active_tenant_id()` nas policies de `user_roles` (não em `tenants`, que deve ser resolvido em D20C-02 conjuntamente).

### 🟢 FINDING D20-GATE-01 — Fechado (falso positivo)
- **Origem:** guard `assert_security_definer_owner.sql` sinalizou 438 funções owned por `postgres`, sugerindo EXECUTE TO PUBLIC amplo.
- **Realidade:** 375/438 estão devidamente restritas a `postgres`/`service_role`. Apenas 6 têm `PUBLIC` real (endereçadas em D20D-01/03).
- **Ação:** fechar; incorporar aos findings D20D-01/02/03.

---

## 7. Views e materialized views

| Tipo | Total | Risco |
|---|---|---|
| Views | 93 | ✅ **100% `SECURITY INVOKER`** — respeitam RLS do chamador. |
| MVs  | 4  | ✅ Somente `postgres`/`service_role`/`sandbox_exec` têm SELECT. Nenhuma exposição a `anon`/`authenticated`. |

**Nenhum finding.** A camada de views/MVs está institucionalmente disciplinada.

---

## 8. Backlog priorizado para D20-E

| ID | Prioridade | Descrição | Bloqueia | Origem |
|---|---|---|---|---|
| **HF-RLS-06** | **P0** | Confirmar guard interno em `get_agents_list*` e `get_agents_snapshots_list`; revogar PUBLIC. | 3 RPCs | D20D-01 |
| **HF-RLS-01** | **P0** | Habilitar RLS em `agent_system_metrics_2026_08` + corrigir gerador de partição. | 1 partição | D20C-01 |
| **HF-RLS-07** | P1 | `REVOKE EXECUTE ... FROM anon` em `check_blast_radius`. | 1 RPC | D20D-02 |
| **HF-RLS-03** | P2 | Substituir `auth.jwt() ->> 'tenant_id'` por `get_active_tenant_id()` em `user_roles` (2 policies). | 2 policies | D20D-04 |
| **HF-RLS-08** | P2 | Revogar `PUBLIC`+`anon` de `has_role(uuid,text,uuid)`. | 1 RPC | D20D-03 |
| **HF-RLS-02** | P3 | Revisar `tenants."Block suspended tenants"` (UUID hardcoded + semântica invertida). | 1 policy | D20C-02 |
| **HF-RLS-04** | P3 | `TO public` → `TO authenticated` em `fido2_credentials`, `tenant_security_policies`. | 6 policies | D20C-04 |
| **HF-RLS-05** | P3 | Remover policies duplicadas (`itsm_tickets`, `jobs`). | 2 pares | D20C-05 |
| **HF-RLS-09** | P3 | Restringir `check_tenant_suspension` de `PUBLIC` para `anon+authenticated`. | 1 RPC | D20D-01 |

---

## 9. Critério de saída — verificação

| Entregável | Estado |
|---|---|
| Inventário completo das 438 `SECURITY DEFINER` | ✅ `sd_all.txt` + §1 |
| Inventário de todos os `EXECUTE` grants | ✅ §1, §2 |
| Validação do `custom_access_token_hook` | ✅ §3 — **não existe** |
| Matriz JWT → Hook → Claims → Policy → RPC → Tabela | ✅ §4 |
| Classificação de risco por função | ✅ §2 (exposição) + §1 (restritas) |
| Fila priorizada de hotfixes (D20-E) | ✅ §8 |
| Nenhum hotfix aplicado durante inventário | ✅ Confirmado |

**D20-D encerrado.** A cadeia de confiança entre autenticação, autorização, RLS e funções privilegiadas está mapeada. O risco estrutural remanescente é **finito e nomeado**: 3 P0 (partição + 3 RPCs) e 5 itens P1–P3.

Aguardando autorização para abrir **D20-E** com a fila da §8 (recomendo executar HF-RLS-01 e HF-RLS-06 primeiro, dado que são P0 e independentes).
