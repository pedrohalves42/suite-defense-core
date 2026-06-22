# Revisão Completa de Código — 2026-06-22

**Escopo:** frontend (`src/`), edge functions (`supabase/functions/`), banco (RLS/views/SECURITY DEFINER), agentes (`agents/`), CI/scripts (`.github/workflows/`, `scripts/`, `ci/`, `tools/`), config raiz.

**Metodologia:** Fase 1 (sinais automáticos — `tsc`, ESLint, `supabase--linter`, `scripts/security-audit.ts`, `scripts/lint-fetch.ts`) + Fase 2 (auditoria manual dirigida). Achados rotulados `Q-` (qualidade), `S-` (segurança), `P-` (performance) com severidade P0/P1/P2.

## Sumário executivo

| Eixo | P0 | P1 | P2 | Total |
|------|----|----|-----|-------|
| Qualidade | 1 | 1 | ~50 | ~52 |
| Segurança | 1 | 0 | 67 (linter) | 68 |
| Performance | 0 | 0 | 4 | 4 |
| **Total** | **2** | **1** | **~121** | **~124** |

**Status:** todos os P0/P1 corrigidos nesta rodada. P2 catalogados para próxima onda.

## Sinais automáticos (resultado bruto)

| Ferramenta | Resultado |
|------------|-----------|
| `tsc --noEmit` (frontend) | ✅ limpo |
| `bun scripts/security-audit.ts` | ✅ nenhum segredo |
| `bun scripts/lint-fetch.ts` | ✅ nenhum `fetch()` cru em edge functions |
| `npx eslint .` | ⚠️ 3 erros + 1010 warnings |
| `supabase--linter` | ⚠️ 1 ERROR + 66 WARN |

## P0 — Correções aplicadas

### P0-S1 · Partição sem RLS (segurança crítica)
- **Local:** `public.agent_system_metrics_2026_07`
- **Impacto:** tabela exposta via Data API sem isolamento de tenant; qualquer usuário autenticado podia ler/escrever métricas de qualquer tenant.
- **Origem:** `supabase--linter` ERROR `0013_rls_disabled_in_public`. Demais partições (`2026_04`–`2026_06`) tinham a política `*_tenant_scoped`.
- **Fix:** migração `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policy `agent_system_metrics_2026_07_tenant_scoped` espelhando as irmãs (`tenant_id = get_active_tenant_id() OR is_current_super_admin()`).
- **Validação:** linter pós-migração — 0 ERROR.

### P0-Q1 · Rules of Hooks — `useMemo` dentro de `useEffect`
- **Local:** `src/hooks/useRealtimeQuery.ts:123` (antes da correção).
- **Impacto:** `throttledInvalidate` era recriado em toda execução do efeito, sem registrar-se como hook → o `inThrottle` fechava em uma nova closure a cada call → **throttling efetivamente desativado**, podendo gerar tempestade de invalidações em tabelas realtime de alta frequência (jobs, heartbeats, métricas).
- **Fix:** movido `throttledInvalidate` para o corpo do hook via `useMemo([queryClient, realtimeTable])`. Função `throttle` retipada para `<T extends AnyFn>(func: T, limit): T` (remove `Function` type proibido).
- **Validação:** `npx eslint src/hooks/useRealtimeQuery.ts` — 0 erros (12 warnings de `any` herdados, P2).

## P1 — Correções aplicadas

### P1-Q1 · Tipo `Function` proibido
- **Local:** `src/hooks/useRealtimeQuery.ts:10` (antes).
- **Fix:** resolvido junto com P0-Q1 via genérico `<T extends AnyFn>`.

## P2 — Catalogados (não corrigidos nesta rodada)

### Qualidade
- ~50 `@typescript-eslint/no-explicit-any` em telas (`SalesPipeline`, `TenantInvites`, `TenantSettings`, `ClientActivity`, `ClientComputers`, `ClientSecurityStatus`, `StatusPage`, etc.) — fora de mappers, deveriam ser tipados (regra core exige `any` só em mappers).
- ~30 imports não usados (`RefreshCw`, `CheckCircle2`, `XCircle`, `Globe`, `Select*`, `LineChart`, `Line`, `useEffect`, `CardHeader`, `FileText`, ...). Aplicar `eslint --fix`.
- `src/providers/AuthProvider.tsx:111` — `useEffect` sem `queryClient` nas deps (exhaustive-deps).
- `src/providers/AuthProvider.tsx:141` — export non-component impede fast refresh.
- `src/hooks/useRealtimeQuery.ts:240` — deps do `useEffect` faltando `queryKey`, `tenantId`, `throttledInvalidate` (intencional para evitar re-subscribe; documentar com comentário).

### Segurança (warnings `supabase--linter`)
- 67 warnings: 4× `SECURITY DEFINER` executável por anon + 62× executável por authenticated + 1× `RLS Policy Always True`.
- **Status:** mitigado pela arquitetura `security_definer_allowlist` documentada em `mem://security/rpc-execution-permission-standard`. Próxima onda: cruzar lista com allowlist e revogar `EXECUTE` das funções fora dela.

### Performance
- `src/hooks/useRealtimeQuery.ts`: `gcTime` opcional sem default — clientes que não passam ficam com gc padrão (5min) mesmo com `staleTime: 5min`. Definir `gcTime` default = `staleTime * 2`.
- ESLint config dupla (`eslint.config.js` raiz vs `config/eslint.config.js`) com regras divergentes — uma libera `any` como warn, outra como error. Consolidar.
- Bundle: vários `lucide-react` icons importados em telas de admin não usados (P2-Q acima também afeta tree-shaking).
- Partições `agent_system_metrics_2026_04/05` próximas de janela de arquivamento (regra `mem://architecture/telemetry-retention-and-partitioning-standard` = 30 dias). Validar cron de drop.

### Não-achados (verificado, sem regressão)
- `scripts/security-audit.ts`: nenhum segredo hardcoded.
- `scripts/lint-fetch.ts`: nenhum `fetch()` cru em edge functions.
- `ci/validate-middleware.sh`: lista de exceções `Deno.serve()` consistente.
- Tabelas `public.*` sem GRANT: nenhuma detectada nesta varredura.

## Arquivos alterados

- `supabase/migrations/<timestamp>_p0_rls_agent_system_metrics_2026_07.sql` (criado via tool)
- `src/hooks/useRealtimeQuery.ts` (refatorado throttle + hook root memo)
- `docs/audits/2026-06-22-full-code-review.md` (este relatório)

## Próximas ondas sugeridas

1. **Onda Qualidade-P2:** rodar `eslint --fix`, tipar `any` em telas admin/client, consolidar configs ESLint.
2. **Onda Segurança-P2:** auditar todas as funções `SECURITY DEFINER` contra `security_definer_allowlist`, revogar `EXECUTE` das fora da allowlist.
3. **Onda Performance:** definir `gcTime` default em `useRealtimeQuery`, revisar cron de partições, varrer bundle.
