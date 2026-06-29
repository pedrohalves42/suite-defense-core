# Program Closure — Campanha de Saneamento de Tipos (D2 → D19)

**Status:** Encerrada formalmente
**Período:** D2 a D19 (incluindo PP02-A/B, hotfixes correlatos e D18-1/2/3)
**Owner técnico:** Equipe CyberShield
**Data do fechamento:** 2026-06-29

---

## 1. Sumário executivo

A iniciativa nasceu como um esforço de remoção de `@ts-nocheck` e terminou como uma reforma estrutural da disciplina de tipos, do typegen e — mais importante — da postura do código frente a falhas. O retorno mais relevante não foi estético: foi a descoberta e correção de bugs funcionais que estavam mascarados pelo compilador silencioso.

A partir deste marco, novas demandas devem ser tratadas como **melhorias funcionais e de confiabilidade**, não como continuação desta campanha. Qualquer ocorrência futura de `@ts-nocheck` / `@ts-ignore` em código de produção passa a ser tratada como **regressão**.

---

## 2. Métricas finais (D13 → D19)

| Indicador | Baseline (D13) | Final (pós-D19) |
| --- | ---: | ---: |
| `@ts-nocheck` ativos em produção | 96 | **0** |
| `@ts-ignore` ativos em produção | 12+ | **0** |
| Arquivos protegidos pelo gate Tier 1 | 36 | **152** |
| Gates de CI bloqueantes | 1 | **2** (`ts-nocheck-tier1` + `database-types-sync`) |
| Espelho Deno `database.types.ts` | manual | automatizado + SHA256 guard + pre-commit |
| Type Escape Index | ~1362 | ~1338 (estável; restante classificado como boundary legítimo) |
| Casts amplos em `_shared/` | dezenas | centralizados em `_shared/json.ts` |

---

## 3. Bugs funcionais descobertos durante a campanha

Itens que **só apareceram porque a tipagem deixou de mascará-los**:

| ID | Onde | Severidade |
| --- | --- | --- |
| **HOTFIX-AUTH-01** | coluna `metadata_hash` inexistente causando 401 silenciosos em heartbeat | Alta |
| **HOTFIX-AUTH-02** | tipos incorretos na RPC de replay | Média |
| **LATENT-AUTOMATION-01/02/03** | drift de schema em automation runtime, dedupe global ausente, aprovação humana opcional | Alta |
| **LATENT-AUDIT-SCHEMA-01** | tipos `Json` x `Record` inconsistentes na fronteira de auditoria | Média |
| **HF-AI-SCHEMA-DRIFT-01** | colunas inexistentes referenciadas em handlers de IA | Média |
| **HF-JOBS-PAYLOAD-HASH-01** | hash de payload incorreto em jobs | Média |
| **HF-BUILD-DEPLOY-SCHEMA-01 / CACHE-ORIGIN-01 / DUP-DECL-01** | drift em build pipeline | Alta |
| **HF-BUILD-VALIDATION-01** | `validateAgentScriptContent` consumido como booleano em vez de `.valid` | **Crítica** |
| **HF-DEPLOY-CONFIG-SCHEMA-01 / REINSTALL-JOBS-HASH-01 / TELEMETRY-PROFILES-01** | configs/telemetria de deploy | Alta |
| **LATENT-DEPLOY-POLICY-01** | `get-agent-policy` caía em defaults silenciosos | Alta |
| **LATENT-RPC-MISSING-01** | RPCs `check_blast_radius` e `get_runbook_by_type` referenciadas e **nunca existiram** | **Crítica** |
| **HF-LATENT-RPC-MISSING-01a — polaridade invertida no `auto-remediate`** | proteção de blast radius **não rodava** em caso de erro de RPC; ação seguia adiante (fail-open mascarado) | **Crítica** |

O último item — fail-open mascarado em automação destrutiva — é, isoladamente, justificativa suficiente para o ROI de todo o programa.

---

## 4. Correções e mecanismos permanentes

### 4.1 Higiene de tipos
- 152 arquivos Tier 1 protegidos por `scripts/guard-no-ts-nocheck-tier1.sh`.
- Helpers compartilhados (`_shared/`) inteiramente type-clean.
- Casts `Json ↔ Record` centralizados em `_shared/json.ts`.

### 4.2 Typegen (D18-2)
- `src/integrations/supabase/types.ts` como fonte única; mirror Deno copiado byte-a-byte.
- `scripts/sync-database-types.sh` (idempotente) + `scripts/guard-database-types-sync.sh` (SHA256, bloqueante).
- Hook `.husky/pre-commit` faz sync + re-stage automático.
- Workflow `.github/workflows/type-debt-guards.yml` cobre ambos os gates.

### 4.3 Arquitetura
- Fachada oficial `check_blast_radius(p_tenant_id, p_action_type, p_affected_count)` com contrato estável `{ allowed, reason, current_radius, max_radius }`.
- Reaproveitamento de primitivas (`get_adaptive_blast_radius`, `validate_blast_radius`) — sem duplicação.
- `get_runbook_by_type` substituído por `SELECT` direto na tabela `runbooks`.

### 4.4 Comportamento (fail-closed)
- `auto-remediate`, `security-threats`, `create-reinstall-jobs` e ambos os `playbook-automation` agora respondem **503 / fail-closed** quando a validação de blast radius falha.

### 4.5 Observabilidade
- `recordTokenFailure` registra cada 401 de heartbeat em `token_validation_failures`.
- Logs estruturados `[hb-diag]` para diagnóstico de tráfego de agentes.
- Auditoria estruturada em billing (HF-BILLING-AUDIT-01) e contratos de auditoria padronizados (HF-AUDIT-CONTRACT-01).

---

## 5. Riscos remanescentes (fora do escopo desta campanha)

Itens conhecidos que **não** devem ser endereçados como continuação de D2–D19, e sim como trabalho funcional/segurança independente:

| ID | Origem | Tipo |
| --- | --- | --- |
| F-003 | Realtime filter spoofing — REMEDIATION-BACKLOG P2 | Segurança |
| F-005 | Job integrity bypass via `ack-job` — P1 | Segurança/Integridade |
| F-006 | Auditoria ausente em handlers de API externa — P1 | Compliance |
| CLEAN-01 | Hardening derivado da revisão completa | Qualidade |
| PP02-C | Canário do `hmac_success_coalescing` (PP02-A FAIL, PP02-B Inconclusivo) | Performance |
| Testes (`@ts-ignore` em mocks) | 6 ocorrências legítimas em `__tests__/` | Aceito |

---

## 6. Lições aprendidas

1. **Tipagem silenciosa esconde bugs reais.** Mais de uma dezena de bugs funcionais — incluindo dois críticos — só apareceram quando o compilador parou de aceitar escapes.
2. **Inventário > intuição.** O salto de qualidade veio quando substituímos "limpar onde dói" por inventários classificados (D13, D19-B).
3. **Fail-closed por contrato, não por convenção.** A polaridade do `auto-remediate` era um bug "óbvio em retrospecto" — só virou óbvio depois que os tipos forçaram a leitura.
4. **Sem typegen automatizado, drift volta.** A automação de D18-2 (script + SHA256 + pre-commit + CI) é o que torna o ganho permanente.
5. **Canários precisam de tráfego real antes de qualquer leitura.** PP02-A e PP02-B ensinaram a custo zero o que custaria caro em escala maior.
6. **Compatibilidade dupla é dívida disfarçada de prudência.** O HF-01a provou que uma fachada única é menos código, menos contrato e menos manutenção.

---

## 7. Encerramento

A campanha **D2 → D19 está formalmente encerrada**.

A partir desta data:
- Novas ocorrências de `@ts-nocheck` ou `@ts-ignore` em produção = **regressão** (não dívida histórica).
- Novas demandas de tipos só são abertas se houver **bug funcional comprovado** por trás.
- A próxima onda de trabalho deve nascer do backlog funcional (F-003, F-005, F-006, PP02-C, CLEAN-01), não da continuação deste programa.
