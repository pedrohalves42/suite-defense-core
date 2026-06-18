# ADR-008 — Hardening Wave 4 (Frontend: relatórios, heartbeat, jobs)

Status: Accepted
Date: 2026-06-18

## Contexto
Auditoria das telas e hooks frontend que consomem `list-reports`, `heartbeat` e
`submit-job-result`. Foco em null-safety, race conditions de tenant, leituras
silenciosamente quebradas e estados de erro ausentes.

## Bugs corrigidos

### B33 — Comparação de versão lexical em `useJobsHealth`
- **Problema**: `latestVersion` e `outdatedAgents` usavam `a.agent_version > max`
  (string compare). `"3.10.9" > "3.9.0"` é `false`, então agentes na 3.10.x eram
  marcados como "desatualizados" vs. um falso "latest" 3.9.x.
- **Solução**: novo util `src/lib/version-compare.ts` (semver tolerante a
  `v` prefix, build metadata e pre-release) + `compareVersions` /
  `isOlderVersion` no hook.

### B34 — `useGeneratedReports` sem filtro de tenant + queryKey global
- **Problema**: `SELECT * FROM generated_reports` confiava só em RLS; `queryKey`
  era `["generated-reports"]` sem `tenant_id`, então trocar de tenant servia
  cache do anterior. `update/delete` faziam `.eq("tenant_id", undefined)` quando
  o tenant ainda não tinha carregado.
- **Solução**: `.eq("tenant_id", activeTenant.id)`, `enabled: !!activeTenant?.id`,
  `queryKey` parametrizada e guards explícitos nas mutations.

### B35 — Export CSV perdendo `software_inventory`
- **Problema**: bloco "Inventário de Software" emitia só o cabeçalho — o loop
  `forEach` estava ausente. CSV silenciosamente incompleto.
- **Solução**: loop adicionado, `data` tratado como `Record<string, unknown>`,
  validação de array em todos os blocos, fallback de `toast.info` quando o
  laudo não tem dados tabulares, try/catch em ambos os exports.

### B36 — `ClientReports` lendo `report.title` nunca selecionado
- **Problema**: o `SELECT` não incluía `title`, mas a UI renderizava
  `<h3>{report.title}</h3>` → todo card aparecia em branco. Além disso usava
  `any` no map e não havia estado de erro.
- **Solução**: `title` adicionado ao select, tipo derivado do retorno do query,
  fallback de título (`Relatório ${report_type}`), e bloco de erro com
  botão "Tentar novamente".

### B37 — `RecentJobsActivity` sem loading/erro
- **Problema**: o componente só renderizava "Nenhum job recente" — falhas de
  rede ou RLS apareciam como lista vazia.
- **Solução**: estados explícitos para `isLoading`, `isError` e empty.

### B39 — `useJobCleanup.previewQuery` sem `enabled`
- **Problema**: o preview de cleanup disparava na montagem mesmo sem tenant,
  consumindo round-trip e mostrando flash de "0 jobs removíveis".
- **Solução**: `enabled: !!tenant?.id`.

### B40 — `useAgentSnapshots` chamando RPC com `p_tenant_id: undefined`
- **Problema**: `enabled` protegia o primeiro fetch, mas `refetch()` manual
  podia rodar com tenant nulo, devolvendo erro de Postgres.
- **Solução**: guard interno no `queryFn`.

### B41 — `usePipelineHealth.computeStatus` com ternário morto
- **Problema**: `hasAnyAgents ? 'no_data' : 'no_data'` — ambos os ramos iguais,
  então tenants vazios eram tratados como "no_data" (badge cinza neutro)
  exatamente como tenants com agentes ativos sem sinal.
- **Solução**: tenant sem agentes agora retorna `'disabled'` (badge
  "Desativado" + tooltip claro), preservando `'no_data'` para o cenário real
  de agentes presentes sem evidência.

## Arquivos alterados
- `src/lib/version-compare.ts` (novo)
- `src/hooks/useJobsHealth.ts`
- `src/hooks/useJobCleanup.ts`
- `src/hooks/useAgentSnapshots.ts`
- `src/hooks/usePipelineHealth.ts`
- `src/components/admin/GeneratedReportsList/useGeneratedReports.ts`
- `src/components/admin/RecentJobsActivity.tsx`
- `src/pages/client/ClientReports.tsx`

## Validação
- `tsc --noEmit -p tsconfig.app.json`: 0 erros.
- Revisão de leitura linha-a-linha dos 8 arquivos alterados.
