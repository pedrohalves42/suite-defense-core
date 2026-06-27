# Program Status — Pós D16 / Pré D17

**Data:** 2026-06-27
**Escopo:** Fechamento do domínio AI (D16-C1/C2/C3) e checkpoint D16-FINAL.

---

## 1. Blocos concluídos (acumulado)

| Bloco | Estado |
| --- | --- |
| D1–D9 (Agent core)            | ✅ |
| D10–D12 (`_shared/`)          | ✅ |
| D13 (inventário)              | ✅ |
| D14-A1 Billing                | ✅ |
| D14-A2 Auth / Identity        | ✅ |
| D14-A3 Anti-abuse / HMAC      | ✅ |
| D14-A4 Release / Signing      | ✅ |
| D15-B1 Ops Gateway / Playbook | ✅ |
| D15-B2 Ops Sync               | ✅ |
| D15-B3 Ops Reports            | ✅ |
| D15-B4 Automation Runtime     | ✅ |
| D16-C1 AI Core                | ✅ |
| D16-C2 AI Analysis            | ✅ |
| D16-C3 AI Security / Closure  | ✅ |
| **D16-FINAL** (checkpoint)    | ✅ |

Hotfixes encerrados nesta janela:
HF-AI-SCHEMA-DRIFT-01, HF-JOBS-PAYLOAD-HASH-01, HF-AUTOMATION-02.

---

## 2. Métricas — programa completo

| Marco                | `@ts-nocheck` | Gate Tier 1 | Redução |
| -------------------- | ---: | ---: | ---: |
| Baseline D13         | 96  | 0   |   — |
| Pós D14-A4           | 78  | 55  | ~19% |
| Pós D15-B1           | 60  | 75  | ~38% |
| Pós D15-B4           | 40  | 100 | ~58% |
| Pós D16-C1           | 33  | 108 | ~66% |
| Pós D16-C2           | 28  | 115 | ~71% |
| **Pós D16-C3**       | **23** | **130** | **~76%** |

- `_shared/` type-clean: ✅
- Domínio AI: ✅ 100% limpo
- Tier A (public/auth/billing/identity/service_role): ✅ 100% limpo

---

## 3. Riscos residuais

### 3.1 Dívida de tipagem
23 arquivos restantes, concentrados em build/release/installer e
distribuição de policies/configs para agentes. Detalhado em
`docs/audits/active/bloco-d16-final-checkpoint.md`.

### 3.2 Hardening funcional (backlog Viktor Hale)
- F-003 (realtime channel isolation)
- F-005 (job integrity / sunset `ack-job` legado)
- F-006 (auditoria de handlers externos via API Key)
- CLEAN-01 (wave de qualidade pós-canário)

### 3.3 Infraestrutura
- HF-TYPES-REGEN-01 (typegen automatizado)
- TYPEGEN-SYNC-01 (CI gate de drift)
- Domain gates segmentados

### 3.4 Operacional
- PP02-C (replanejamento do canário `hmac_success_coalescing` em tenant com
  tráfego garantido)

---

## 4. Próximos blocos

### D17 — reta final do saneamento de tipagem
- **D17-D1** Build / Release (9 arquivos, risco moderado, +9 → 139)
- **D17-D2** Agent Ops / Fleet / Scan (9 arquivos, risco moderado-alto, +9 → 148)
- **D17-D3** Misc / Routing / Feed (2 arquivos + cleanup, +2 → 150)

### Pós D17
- Hardening funcional (F-003/F-005/F-006/CLEAN-01)
- Governança de typegen e domain gates
- Audit hashing chain rotation (backlog Q3)

---

## 5. Recomendação

Abrir **D17-D1 (Build / Release)** como próximo bloco. **PP02-C** pode rodar
em paralelo assim que houver tenant interno com tráfego de agente ativo.
