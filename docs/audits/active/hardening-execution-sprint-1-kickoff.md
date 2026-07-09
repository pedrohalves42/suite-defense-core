# Hardening Execution — Sprint 1 Kickoff

- Date: 2026-07-09
- Owner: Reliability Program
- Precedes: `hardening-sprint-0-discovery.md` (✅ COMPLETE, 10/10 classificados)
- Succeeds into: RC-2.1 Synthetic Validation Plan

---

## Transição de fase

```text
Sprint 0 Discovery        ✅ COMPLETE
Runtime Freeze            🔒 Redefinido (ver escopo abaixo)
Wave 3B                   🔒 BLOCKED
R5                        🔒 BLOCKED
```

O `Runtime Freeze` **não** é levantado. Ele é **reescopado** para permitir
exclusivamente correções auditáveis dos itens P0/P1 já classificados.

### Escopo do freeze durante Sprint 1+

| Ação                                                | Permitido |
| --------------------------------------------------- | :-------: |
| Corrigir bugs P0/P1 classificados no Sprint 0       |    ✅     |
| Alterar `runtime`/`_shared/reliability/*` para P0   |    ✅     |
| Criar migrations, policies, GRANTs para P0          |    ✅     |
| Escrever testes automatizados para P0/P1            |    ✅     |
| Publicar runbooks e evidence bundles                |    ✅     |
| Iniciar Wave 3B                                     |    ❌     |
| Iniciar R5                                          |    ❌     |
| Desenvolver features novas                          |    ❌     |
| Refatorações grandes sem link direto a P0/P1        |    ❌     |

Qualquer PR de Sprint 1+ deve referenciar o ID (`P0-XX` ou `P1-XX`) no título
e anexar ao Evidence Bundle correspondente.

---

## Ordem canônica de execução

Baseada no grafo de dependências do board:

```text
Sprint 1 — Segurança          Sprint 2 — Reliability
  P0-01  RLS                    P0-05  Idempotency
  P0-04  Auth/MFA server-side   P0-03  Scan recovery
  P0-10  Segredos em logs

Sprint 3 — Agent               Sprint 4 — Operação
  P0-02  Heartbeat               P0-08  Backup/Restore
  P0-06  Rollback                P0-09  Kill-switch
                                 P0-07  Installer signing
```

### Regra de progresso

- **Um P0 por vez por área** (paralelismo apenas entre áreas independentes).
- Cada P0 percorre obrigatoriamente:

```text
Discovery → Fix → Testes → Evidence BEFORE/AFTER → Review → Close
```

- Um item só fecha (`✅`) com par `before.*` + `after.*` no diretório
  `evidence/P0-XX-*/`.
- Reabertura vira `P0-XX-R1` e exige nova evidência.

---

## Item ativo agora

```text
▶ P0-01 — RLS cross-tenant
  Fase: Investigation (spike read-only pré-fix)
  Doc:  evidence/P0-01-rls/investigation.md
```

Motivo do primeiro pick: pré-requisito estrutural de P0-04, P0-05 e P0-09.
Corrigir controles apoiados em isolamento incompleto invalida evidência.

---

## Gates que permanecem bloqueados

```text
RC-2.1 Synthetic Validation     🔒 (requer P0 = 0)
Commercial Readiness Gate       🔒 (requer P1 ≤ 3 aceitos)
Pilot Tenant                    🔒 (requer P0 = 0 e P1 = 0)
Wave 3B                         🔒
R5                              🔒
```
