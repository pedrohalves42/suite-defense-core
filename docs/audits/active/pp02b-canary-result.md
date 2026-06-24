# PP02-B — Resultado do canário `hmac_success_coalescing`

**Status:** ENCERRADO DEFINITIVAMENTE — NO-TRAFFIC-BY-DESIGN
**Janela:** 2026-06-23 20:08:49Z → 21:09:00Z (T+0 → T+60)
**Leitura final:** 2026-06-24 13:36Z (T+16h após T+60)
**Encerramento:** 2026-06-24 — todos os tenants foram desativados por corte de gastos (sem cliente ativo). Não há condição operacional para retomar este canário no ambiente atual. Coalescer permanece **OFF global**. Próxima validação de runtime do `hmac_success_coalescing` exigirá **tenant laboratório interno** (ver Bloco F do plano mestre). Override de tenant já removido em migration anterior.
**Owner:** plano mestre §Fase 0 / §5.1

---

## 1. Configuração do canário

| Item | Valor |
|---|---|
| Flag | `hmac_success_coalescing` |
| Global | `enabled=false` (mantida OFF) |
| Override | tenant `2584d2cd-8b99-4ca7-a8e2-b61256e82b3e` (Genial Cred), `enabled=true` |
| Agente canário | `Pc-Yasmin-Tocantins` (`2ce7686c-afe1-431c-928d-7036d5b954aa`) |
| Heartbeat na abertura | 2026-06-23 20:00:53Z (~8min ANTES de T+0) |

## 2. Snapshots coletados

| Janela | rows_written | distinct_agents | hits | token_validation_failures | hb_age (s) | v_coal | v_auth | v_hb |
|---|---|---|---|---|---|---|---|---|
| T+30 | 0 | 0 | 0 | 0 | 2.286 (~38min) | FAIL | PASS | FAIL |
| T+60 | 0 | 0 | 0 | 0 | 4.086 (~68min) | FAIL | PASS | FAIL |

## 3. Classificação por grupo

| Grupo | Veredito | Justificativa |
|---|---|---|
| coalescer | **NO-TRAFFIC** | 0 rows porque o único agente do tenant parou antes da janela abrir. Não é falha do coalescer. |
| auth/HMAC | **PASS** | 0 `token_validation_failures` em ambas janelas. HOTFIX-AUTH-01 e HOTFIX-AUTH-02 confirmados estáveis. |
| hotfix/waitUntil | **PASS (por ausência)** | 0 erros de `Cache dispatch failed` / `waitUntil scheduling failed`. Sem dispatch porque sem tráfego. |

## 4. Causa raiz da inconclusividade

Pc-Yasmin tem heartbeat intermitente. No T+0 já havia gap de 59min; a janela inteira passou em silêncio. Verificação de tenants candidatos em T+16h confirmou que **nenhum tenant da plataforma teve heartbeat nos últimos 30 min**; o único com HB nas últimas 24h é o próprio tenant canário.

Query de candidatos executada (read-only):

```sql
SELECT tenant_id, COUNT(*) FILTER (WHERE last_heartbeat > now() - interval '5 minutes') AS active_recent
FROM agents
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id
HAVING COUNT(*) FILTER (WHERE status='active' AND last_heartbeat > now() - interval '5 minutes') >= 1;
-- 0 rows
```

## 5. Decisão

1. **Rollback do override** — remover o tenant override da flag `hmac_success_coalescing`. Motivo: inadequação de tenant, NÃO bug.
2. **Global permanece OFF.**
3. **NÃO expandir** nesta rodada.
4. **NÃO iniciar Bloco B** (Segurança DB/RLS/RPC) até esta linha do plano estar fechada — o que esta documentação fecha.
5. Próxima rodada PP02-B requer **pré-condição de eligibilidade**: tenant com ≥1 agente `status=active` e `last_heartbeat < 5 min` no momento da ativação do override.

## 6. Pendência sistêmica observada

A ausência total de heartbeat recente na plataforma é um sinal independente do PP02-B. Pode indicar:

- agentes parados em produção (caso operacional)
- ambiente pós-incidente ainda sem reativação
- problema upstream em `heartbeat`/`poll-jobs` que não disparou alerta

Recomendação: investigação separada antes da próxima tentativa de canário. **Não tratar dentro deste artefato.**

## 7. Evidências

- Tabela: `public.pp02b_canary_snapshots` (T+30, T+60)
- Flag: `public.feature_flags` id `b07ac461-bc8d-469d-a58e-d3aa0135ccfd` (override a remover) e `89a83db8-d3a0-4a5e-aebc-5e66d23a857f` (global, permanece OFF)

## 8. Rollback aplicado

Migration: `DELETE` do override `b07ac461-bc8d-469d-a58e-d3aa0135ccfd` em `public.feature_flags`. Registro do snapshot preservado para auditoria.
