# Commercial Readiness Gate

Date: 2026-07-07
Status: **OPEN** — nenhum critério ✅ ainda
Owner: pendente
Prerequisite for: primeiro cliente comercial

Gate único que antecede a comercialização. Ortogonal ao gate técnico
RC-2 (que valida o runtime de confiabilidade). Ambos precisam estar
verdes antes de aceitar o primeiro tenant pagante.

---

## Critérios

| Área | Critério | Status | Evidência |
| --- | --- | :-: | --- |
| Runtime | Sem erro crítico aberto (P0=0, P1<=3) | ☐ | — |
| Segurança | RLS auditado (última execução `supabase--linter` sem findings críticos) | ☐ | — |
| Segurança | `has_role()` + `get_active_tenant_id()` cobrem 100% das tabelas com dado por tenant | ☐ | — |
| Agentes | Update automático funcionando em Windows, Linux, macOS | ☐ | — |
| Agentes | Reinstall/recovery testado em cada plataforma | ☐ | — |
| Monitoramento | Alertas (`system_alerts`) disparando corretamente para eventos críticos | ☐ | — |
| Monitoramento | Dashboard operacional exibindo dados reais por tenant | ☐ | — |
| Backup | Restore validado em ambiente isolado (RTO/RPO documentados) | ☐ | — |
| Logs | Rastreáveis por `tenant_id` + `request_id` + `trace_id` end-to-end | ☐ | — |
| Billing | Fluxo Stripe testado (checkout, webhook, quota, cobrança recorrente) | ☐ | — |
| Onboarding | Fluxo completo testado por usuário externo (não-dev) | ☐ | — |
| Rollback | Procedimento documentado e ensaiado ao menos uma vez | ☐ | — |
| Compliance | LGPD/GDPR: política, DPA, retention, right-to-erasure operacional | ☐ | — |

---

## Regra de aprovação

Todos os itens devem estar ✅ **e** ter link de evidência preenchido.

Aprovação requer:

- Assinatura de Engineering.
- Assinatura de Segurança.
- Assinatura de Produto/Comercial.

---

## Relação com RC-2

```
Wave 3A.2 shipped
      |
      +── RC-2 (technical gate — runtime)
      |         └── Hold until synthetic + real workload evidence
      |
      +── Commercial Readiness Gate (business gate — this doc)
                └── OPEN until all criteria met
      |
      ↓  (ambos ✅)
      |
Primeiro cliente piloto
```

Um gate não substitui o outro. RC-2 valida que o **runtime** é
confiável. Este gate valida que a **operação comercial** é viável.
