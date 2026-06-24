# Bloco B — Inventário Read-Only (B1 + B2)

**Data:** 2026-06-24
**Modo:** read-only. Nenhuma mudança aplicada.
**Pré-requisito:** PP02-B encerrado como NO-TRAFFIC-BY-DESIGN, coalescer global OFF.

---

## B1 — Policies com `USING (true)` / `WITH CHECK (true)`

**Total:** 310 policies, 0 perigosas.

### Quebra por role × cmd

| cmd | role | count | risco |
|---|---|---|---|
| ALL | service_role | 139 | nenhum (bypassa RLS por design) |
| INSERT | service_role | 109 | nenhum |
| UPDATE | service_role | 45 | nenhum |
| SELECT | authenticated | 11 | revisar (ver abaixo) |
| DELETE | service_role | 3 | nenhum |
| SELECT | service_role | 3 | nenhum |

> Policies em `service_role` são esperadas: `service_role` já bypassa RLS, a policy é apenas declarativa.
> **Zero policies em role `public` com `USING(true)`** → security_gate.sql passa.

### 11 SELECT authenticated USING(true) — tabelas de referência global

| tabela | policy | natureza esperada |
|---|---|---|
| compliance_benchmarks | benchmarks_readable_by_authenticated | catálogo global |
| mitre_attack_techniques | anyone_read_mitre | catálogo MITRE público |
| mitre_metadata | mitre_metadata_select_all | catálogo MITRE |
| mitre_rules | mitre_rules_select_all | catálogo MITRE |
| ops_checks | ops_checks_view_all | **REVISAR** — pode conter operacional |
| security_definer_allowlist | Allow read for authenticated | allowlist pública por design |
| software_knowledge_base | software_knowledge_base_select | catálogo software |
| software_vulnerability_baseline | Authenticated users can read vulnerability baseline | baseline público |
| subscription_plans | authenticated_users_can_view_plans | catálogo de planos |
| system_global_state | All authenticated users can read global state | flag global |
| system_state | authenticated_read_system_state | estado global |

**Veredito B1:** 10/11 são tabelas globais sem PII/tenancy → manter. 1 alvo de revisão: `ops_checks` (verificar se há dado operacional sensível antes de fechar como aceito).

CSV completo: `/mnt/documents/blocoB/b1_using_true.csv`.

---

## B2 — SECURITY DEFINER allowlist

**Total:** 437 funções `SECURITY DEFINER` em `public`.
**Sem `search_path`:** **0**.

```sql
SELECT COUNT(*) FILTER (WHERE proconfig IS NULL OR NOT (proconfig::text ILIKE '%search_path%'))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef=true;
-- 0
```

**Veredito B2:** F-001 (Search Path Mutable) está **integralmente remediado em runtime**. Critério `pg_proc WHERE prosecdef AND proconfig IS NULL` retorna vazio.

Próximo passo do B2 não é correção (não há). É **governança**:

1. Verificar se 437 é o número certo — possivelmente há definers que poderiam ser `SECURITY INVOKER`.
2. Cruzar com `security_definer_allowlist` para confirmar que cada definer está justificado.
3. Adicionar trigger/CI que rejeite `CREATE FUNCTION ... SECURITY DEFINER` sem `SET search_path`.

CSV completo: `/mnt/documents/blocoB/b2_definer.csv`.

---

## Próximas decisões (não executadas)

| Ação | Pré-requisito | Risco |
|---|---|---|
| Revisar `ops_checks` policy | leitura do conteúdo da tabela | baixo |
| Reduzir nº de SECURITY DEFINER | revisar caso a caso | médio (regressão) |
| Adicionar lint CI bloqueando definer sem search_path | escrever check em `.github/workflows/security-gate.yml` | nenhum |
| Bloco C (guardrails rápidos) | independente do B | baixo |
| Criar tenant laboratório | conclusão do B | baixo |

Nenhuma migration aplicada nesta fase.
