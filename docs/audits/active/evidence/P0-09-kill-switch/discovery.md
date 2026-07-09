# P0-09 — Kill-switch global · Discovery Note (Sprint 0 · Day 3)

- Date: 2026-07-09
- Owner: Ops Lead
- Mode: read-only inspection
- Depends on: P0-01

## Classificação

**Needs Investigation** (perto de `False Positive` — falta apenas
drill documentado e runbook dedicado).

## Evidência coletada

### Primitiva

`supabase/functions/_shared/feature-flags.ts`:

- Padrão fail-closed documentado (linhas 7-19): "Kill switches default
  to FAIL-CLOSED (`defaultOnError: false`)".
- Função `isKillSwitchEnabled(supabase, flag, tenantId)` (linha 60).
- Padrão: "global disabled = denied for ALL tenants" (linha 7).

### Consumidores comprovados

- `_shared/honeypot/agent-handler.ts` (linhas 52-54): consulta
  `HONEYPOT_ENABLED` antes de aceitar interação — fail-closed real.
- `_shared/hmac.ts` (linha 11): comentário confirmando uso como
  kill-switch.

### Camada de dados

- Tabela `system_kill_switch` existe (`database.types.ts` linha 37641)
  com FKs para tenant (linhas 37677-37734), permitindo scope global
  e por tenant.

### UI operacional

- `src/pages/super-admin/RolloutPolicies/`:
  - `index.tsx` linha 49: instrução operacional documentada
    ("Desligar 'enabled' para TODOS pararem de atualizar
    imediatamente").
  - `useRolloutPolicies.ts` linha 84: toast confirmando ativação/
    desativação (kill-switch).

### Runbook

- Existe `RUNBOOK-EMERGENCY-MODE.md` em `docs/runbooks/`.
- **Não existe** `RUNBOOK-KILL-SWITCH.md` dedicado com procedimento
  passo-a-passo + drill de <60s.
- Cobertura implícita via emergency-mode, mas não auditável como
  drill específico.

## Sinais numéricos

| Sinal                                                | Valor |
| ---------------------------------------------------- | ----- |
| Primitiva de kill-switch em `_shared`                | 1 (`feature-flags.ts`) |
| Padrão fail-closed documentado                       | sim   |
| Tabela SQL de kill-switch                            | 1 (`system_kill_switch`) |
| Callers comprovados                                  | ≥2 (honeypot, hmac ref)|
| UI operacional para toggle                           | sim (RolloutPolicies)  |
| Runbook dedicado                                     | 0     |
| Drill <60s documentado (últimos 90d)                 | 0     |

## Guarda de freeze respeitada

- ❌ Nenhum flag alterado.
- ❌ Nenhuma edge function, tabela ou policy tocada.
- ❌ Nenhum `isKillSwitchEnabled` disparado a partir desta análise.
- ✅ Apenas leitura de código, tipos gerados e docs.

## Próximo passo (fora do Sprint 0)

1. Redigir `RUNBOOK-KILL-SWITCH.md` com procedimento formal:
   `super_admin → toggle → validação em <60s`.
2. Enumerar todos os `isKillSwitchEnabled` callers e mapear cobertura
   por feature crítica (agent updates, honeypot, HMAC, EDR active
   response).
3. Executar drill em ambiente sintético (RC-2.1) e anexar evidência
   `evidence/P0-09-kill-switch/after.md` com timestamps.
4. Se drill passar → `False Positive` (controle existe, apenas
   faltava evidência formal). Se cobertura for parcial → `Confirmed`.
