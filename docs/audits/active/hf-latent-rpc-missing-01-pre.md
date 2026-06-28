# HF-LATENT-RPC-MISSING-01-PRE — Investigação read-only

**Status:** Concluído (read-only). Nenhum arquivo de runtime alterado.
**Escopo:** responder 4 perguntas sobre as RPCs ausentes `check_blast_radius` e `get_runbook_by_type` antes de decidir a correção (Cenário A/B/C).

---

## 1. Evidências coletadas

### 1.1 Catálogo do banco (`pg_proc`)

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('check_blast_radius','get_runbook_by_type',
                  'get_adaptive_blast_radius','validate_blast_radius');
```

| Função | Existe? |
| --- | --- |
| `check_blast_radius` | ❌ **NÃO existe** |
| `get_runbook_by_type` | ❌ **NÃO existe** |
| `get_adaptive_blast_radius(uuid, text, text)` → `numeric` | ✅ Existe |
| `validate_blast_radius(uuid, text, uuid[])` → `jsonb` | ✅ Existe |

### 1.2 Migrations / git history / changelog

- `rg check_blast_radius supabase/migrations/` → **0 ocorrências**. A função nunca foi criada (nem dropada).
- `git log -- '*check_blast_radius*'` → vazio (jamais foi adicionada como artefato versionado).
- `CHANGELOG.md` → nenhuma menção.
- Citada apenas em `docs/runbooks/GLOSSARIO-TECNICO.md` como "RPC `check_blast_radius`" — referência aspiracional, **não implementação**.
- `get_runbook_by_type` → idem: 0 migrations, 0 changelog, 0 git history.

### 1.3 Recursos relacionados que **existem**

- Tabela `adaptive_blast_radius_config` (config por tenant/severidade).
- Tabela `blast_radius_policies` (política por tenant/action_type).
- Função `get_adaptive_blast_radius(p_tenant_id, p_action_type, p_severity)` → retorna apenas o **percentual máximo permitido**.
- Função `validate_blast_radius(p_tenant_id, p_action_type, p_target_agent_ids uuid[])` → retorna `jsonb` (`allowed`, `reason`, etc.) para uma **lista explícita de agentes**.
- Tabela `runbooks(anomaly_type UNIQUE, title, steps, owner, severity, sla_minutes, tenant_id, ...)`.

### 1.4 Chamadores e contratos esperados

`check_blast_radius` — **duas assinaturas distintas no código**, nenhuma compatível com as RPCs existentes:

| Chamador | Args passados | Retorno consumido |
| --- | --- | --- |
| `create-reinstall-jobs/index.ts:64` | `p_tenant_id, p_action_type, p_affected_count` | `{ allowed, affected_percent, ... }` |
| `src/hooks/useBlastRadius.tsx:65` | `p_tenant_id, p_action_type, p_affected_count` | `BlastRadiusCheck` (jsonb) |
| `auto-remediate/index.ts:88` | `p_tenant_id, p_action_type, p_severity` | `{ allowed, affected_percent }` |
| `ops-gateway/handlers/playbook-automation.ts:68` | `p_tenant_id, p_action_type, p_severity` | `{ allowed }` |
| `ops-playbook/handlers/playbook-automation.ts:68` | idem | idem |
| `api-gateway/handlers/security-threats.ts:163` | idem | idem |

`get_runbook_by_type` — único chamador:

| Chamador | Args | Retorno esperado |
| --- | --- | --- |
| `ops-checks/use-cases/cron-sentinel.use-case.ts:38` | `p_anomaly_type: 'cron_silent_failure'` | linha de `runbooks` (`title`, `steps`, `owner`, `sla_minutes`) |

---

## 2. Respostas às 4 perguntas

### Q1. Essas RPCs já existiram?
**Não.** Nem em migrations versionadas, nem em git history, nem em CHANGELOG. Foram **referenciadas em código sem nunca ser implementadas no banco**.

### Q2. Foram renomeadas?
**Não exatamente.** Para `check_blast_radius` existem duas primitivas **parciais e relacionadas** (`get_adaptive_blast_radius`, `validate_blast_radius`) que cobrem fatias do problema, mas **nenhuma satisfaz o contrato consumido** pelos chamadores (que esperam um jsonb `{allowed, affected_percent, ...}`). Para `get_runbook_by_type` existe a tabela `runbooks` com `anomaly_type UNIQUE` — a operação é equivalente a `SELECT * FROM runbooks WHERE anomaly_type = ?`, mas a RPC encapsuladora não foi criada.

### Q3. Existe implementação equivalente em SQL/Edge?
- `check_blast_radius`: **parcial**. Daria para compor uma facade SQL que combine `get_adaptive_blast_radius` (teto) com a contagem da frota (`agents` por `tenant_id`) e retorne `{ allowed, affected_percent, max_percent }`. Mas hoje **não existe** essa composição em lugar nenhum.
- `get_runbook_by_type`: **equivalente trivial** (`SELECT FROM runbooks WHERE anomaly_type = ?` com filtro `tenant_id` ou global via RLS). Pode ser substituído por consulta direta na tabela ou por uma RPC wrapper de 5 linhas.

### Q4. Qual o comportamento esperado do produto?
- **Blast Radius:** governar automações destrutivas (force-update, auto-remediate, SOAR). Hoje todos os fluxos caem no `catch` ou em `fail-closed` → ações são **bloqueadas silenciosamente** (HTTP 503 ou `blast_radius_unavailable`). Isto está **documentado** (`GLOSSARIO-TECNICO.md`) como feature ativa, mas em runtime **nunca executa** o caminho positivo.
- **Runbook lookup:** `cron-sentinel` deveria resolver o runbook do tipo de anomalia para anexar à task gerada. Hoje sempre retorna `null` → tasks de sentinel são abertas **sem runbook**, sem alerta de erro.

---

## 3. Classificação por RPC

| RPC | Cenário | Justificativa |
| --- | --- | --- |
| `check_blast_radius` | **C — feature parcialmente implementada** | Tabelas e primitivas existem; a facade jsonb consumida pelo código nunca foi criada. Caminho positivo nunca rodou em produção. |
| `get_runbook_by_type` | **B — substituível por equivalente existente** | Tabela `runbooks` com chave única `anomaly_type` cobre 100% do caso de uso. Trivial substituir por SELECT ou wrapper. |

---

## 4. Implicações funcionais (impacto hoje em produção)

| Fluxo | Comportamento atual | Comportamento esperado |
| --- | --- | --- |
| `create-reinstall-jobs` | Retorna HTTP 500 `BLAST_RADIUS_CHECK_FAILED` em **toda** tentativa de reinstalação massiva. | Permitir/bloquear baseado em % da frota. |
| `auto-remediate` | `blastError` cai em `if (!blastError ...)` → check pulado silenciosamente → ação **executa sem validação de blast radius**. ⚠️ Pior cenário: feature de contenção desligada. |  Bloquear se >X% da frota afetada. |
| `ops-playbook` / `ops-gateway` / `api-gateway security-threats` | `catch` → `status: 'blast_radius_unavailable'` → playbook **não executa** (fail-closed). | Executar quando dentro do teto. |
| `useBlastRadius` (UI) | `throw error` → tela quebra ou mostra erro. | UI mostra teto/restantes. |
| `cron-sentinel` | Task de sentinel criada **sem `runbook_id`**, sem alerta. | Anexar runbook quando `anomaly_type` casa. |

**Observação crítica:** o `auto-remediate` tem um bug de polaridade (`if (!blastError && blastCheck && !blastCheck.allowed)`) — quando a RPC não existe, `blastError` está populado, a condição é falsa, e a ação prossegue **ignorando** a validação. Isto inverte a postura fail-closed do restante do código.

---

## 5. Recomendação para HF-LATENT-RPC-MISSING-01

Divisão sugerida em **dois sub-hotfixes independentes**, executados em sequência:

### 5.1 HF-LATENT-RPC-MISSING-01a — `check_blast_radius` (Cenário C)

Criar a RPC no banco como **facade SQL** que:
1. Resolve `max_percent` via `get_adaptive_blast_radius(tenant, action, severity)`.
2. Calcula `affected_percent = p_affected_count / total_agents_tenant * 100`.
3. Retorna `jsonb_build_object('allowed', affected_percent <= max_percent, 'affected_percent', ..., 'max_percent', ..., 'reason', ...)`.
4. Suporta **as duas assinaturas atuais** via parâmetros opcionais (`p_affected_count` OU `p_severity` — quando só `p_severity`, infere `affected_count` da fleet inteira ou retorna apenas o teto).

Alternativa (mais limpa): consolidar **uma única assinatura** e ajustar os 6 chamadores. Recomendo esta — quebra menos a longo prazo.

Adicionalmente: **corrigir a polaridade fail-closed em `auto-remediate/index.ts:88-95`** independentemente da RPC existir. Hoje `blastError` é tratado como "ok, prossiga".

### 5.2 HF-LATENT-RPC-MISSING-01b — `get_runbook_by_type` (Cenário B)

Duas opções, equivalentes em risco:
- **Opção 1:** substituir a chamada RPC por `SELECT` direto da tabela `runbooks` em `cron-sentinel.use-case.ts`. Zero migration.
- **Opção 2:** criar wrapper `CREATE FUNCTION get_runbook_by_type(p_anomaly_type text) RETURNS SETOF runbooks` para manter o estilo RPC.

Recomendo Opção 1 (menos superfície, sem migration).

---

## 6. Próximo passo

Aguardar autorização para abrir **HF-LATENT-RPC-MISSING-01a** (com discussão prévia da assinatura unificada) e **HF-LATENT-RPC-MISSING-01b** (Opção 1 ou 2). Em paralelo, registrar no glossário que `check_blast_radius` passa a ser a **facade oficial** com a assinatura consolidada.
