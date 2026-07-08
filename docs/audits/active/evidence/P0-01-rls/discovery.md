# P0-01 — RLS cross-tenant · Discovery Note (Sprint 0 · Day 1)

- Date: 2026-07-08
- Owner: Security Lead
- Mode: read-only inspection (no runtime changes)

## Perguntas guiadas

1. **Existe hoje?** Sim — RLS está habilitado; padrão do projeto usa
   `get_active_tenant_id()` (ver `mem://index.md` Core Rules).
2. **Como sei?** `supabase--linter` executado em 2026-07-08 retornou
   **71 WARN, 0 ERROR**. Nenhum lint do tipo `rls_disabled_in_public`
   (ERROR) apareceu — se houvesse tabela pública sem RLS, seria ERROR.
3. **Reproduz?** Não foi possível reproduzir violação nesta janela
   read-only. A verificação definitiva exige rodar a query cruzada
   (`select count(*) from <t> where tenant_id <> get_active_tenant_id()`)
   por tabela pública com dois tenants sintéticos.
4. **Custo real?** Provável baixo se nenhuma always-true policy
   estiver em tabela sensível. Precisa triagem dos 71 WARN antes.

## Sinais coletados

- Linter: **71 WARN, 0 ERROR**.
- Composição dos WARN (amostra):
  - `RLS Policy Always True` (0024): **1** ocorrência — precisa nome
    da tabela e verbo (INSERT/UPDATE/DELETE são os riscos reais; SELECT
    é intencionalmente excluído pelo linter).
  - `Public Can Execute SECURITY DEFINER Function` (0028): múltiplas.
  - `Signed-In Users Can Execute SECURITY DEFINER Function` (0029):
    múltiplas.
- Nenhum ERROR-level RLS disabled foi reportado nesta corrida.

## Classificação Discovery

**Needs Investigation.**

Justificativa: o risco cross-tenant não foi provado nem descartado.
A ausência de ERRORs é forte indício de que RLS está ativa em todas
as tabelas públicas, mas:

- 1× policy `always-true` (0024) precisa ser identificada e revisada.
- Warnings 0028/0029 sobre `SECURITY DEFINER` executável por anon/
  authenticated precisam triagem individual: cada função exposta é
  potencial rota de bypass de RLS.

## Próxima ação (fora do Sprint 0)

- Spike com timebox 1 dia: identificar tabela do 0024 + lista de
  funções `SECURITY DEFINER` executáveis por anon.
- Executar query cruzada tenant×tenant sobre tabelas públicas com
  duas contas sintéticas.
- Só então reclassificar para `Confirmed` ou `False Positive`.

## Restrições respeitadas

- Nenhum código de runtime tocado.
- `_shared/reliability/*` intocado.
- Nenhuma alteração de policy/GRANT nesta nota.

## Referências

- `hardening-backlog.md` linha P0-01
- `hardening-tracking-board.md` linha P0-01
- Linter run: 2026-07-08 (71 WARN, 0 ERROR)
