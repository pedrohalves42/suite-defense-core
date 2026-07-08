# Pilot Readiness Review

Date: 2026-07-07
Status: **BLOCKED** — depende de Hardening Backlog + RC-2.1 + Commercial Readiness
Prerequisite for: primeiro tenant piloto

Gate específico para o **primeiro tenant piloto**. Diferente do
Commercial Readiness Gate (que valida a operação comercial de forma
ampla), este documento cobre as garantias mínimas que um piloto real
exige para não ser afetado por deficiências operacionais.

Ambos os gates precisam estar verdes antes de aceitar o piloto.

---

## Checklist

| # | Critério | Evidência exigida | Status |
| --- | --- | --- | :-: |
| 1 | Tenant isolado (RLS auditado end-to-end) | `supabase--linter` limpo + teste cross-tenant | ☐ |
| 2 | Backup automático testado (últimas 24h) | log de backup + restore validado | ☐ |
| 3 | Rollback documentado e ensaiado | runbook + timestamp do último ensaio | ☐ |
| 4 | Monitoramento ativo (alertas + dashboard) | screenshot dashboard + alerta de teste disparado | ☐ |
| 5 | SLA definido e comunicado ao piloto | contrato/anexo assinado | ☐ |
| 6 | Canal de suporte definido (email/chat/on-call) | contato documentado + rota de escalonamento | ☐ |
| 7 | Documentação de onboarding pronta | doc revisado por não-dev | ☐ |
| 8 | Zero P0 aberto (hardening-backlog.md) | link para o backlog | ☐ |
| 9 | Zero P1 aberto (hardening-backlog.md) | link para o backlog | ☐ |
| 10 | Break-glass procedure atualizado | `docs/procedures/break_glass_procedure.md` | ☐ |
| 11 | DR plan revisado nos últimos 90 dias | `docs/procedures/disaster_recovery_plan.md` | ☐ |

---

## Regras

- Todo critério deve estar ✅ **e** ter link de evidência preenchido.
- Assinatura de Engineering + Suporte antes de habilitar o tenant
  piloto no sistema.
- Um único piloto por vez até fechar RC-2 com evidência real.

---

## Relação com os demais gates

```
Hardening Backlog (P0=0, P1=0)
        |
        v
RC-2.1 Synthetic Validation (3+ execuções)
        |
        v
Commercial Readiness Gate (todos os 13 critérios ✅)
        |
        v
Pilot Readiness Review (este documento — 11 critérios ✅)
        |
        v
Primeiro Tenant Piloto
        |
        v
RC-2 Evidence Final (agora com workload real)
        |
        v
Decisão RC-2: Promote / Extend / Rollback
```
