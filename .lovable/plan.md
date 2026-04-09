
# Plano: Eliminação de SELECT * → Colunas Explícitas

## Contexto
52 instâncias de `.select('*')` em 29 arquivos transferem colunas JSONB pesadas desnecessariamente (~2KB extras/linha). Tabelas com maior impacto: `audit_logs` (3 JSONB), `jobs` (2 JSONB), `generated_reports` (2 JSONB), `attack_simulations` (2 JSONB).

## Abordagem
Para cada arquivo: identificar quais colunas são **efetivamente usadas** no componente/hook e substituir `select('*')` por lista explícita. Priorizar tabelas com colunas JSONB.

## Lotes de Execução (6 batches)

### Batch 1 — Repositórios de Infraestrutura (7 instâncias)
Arquivos que mapeiam para tipos definidos em `supabase-tables.ts`:
1. `src/infrastructure/repositories/SupabaseJobRepository.ts` — 5 selects (jobs, job_executions)
2. `src/infrastructure/repositories/SupabaseAgentUpdateRepository.ts` — 2 selects
3. `src/infrastructure/repositories/SupabaseUpdatePackageRepository.ts` — 2 selects
4. `src/infrastructure/adapters/supabase/SupabaseUpdatePackageRepository.ts` — 2 selects

### Batch 2 — Hooks de Dados (10 instâncias)
5. `src/hooks/useCorrelationRules.ts` — 2 selects (correlation_rules, correlation_results)
6. `src/hooks/useGamification.ts` — 2 selects (user_gamification, xp_events)
7. `src/hooks/useSOC2ControlStatus.ts` — 1 select
8. `src/hooks/useSecurityEvents.ts` — selects em security_events
9. `src/hooks/useDetectionRules.ts` — selects em detection_rules

### Batch 3 — Páginas Admin (12 instâncias)
10. `src/pages/admin/SecurityDashboard/useSecurityDashboard.ts` — 2 selects (security_logs, ip_blocklist)
11. `src/pages/admin/ShadowITDiscovery.tsx` — 1 select
12. `src/pages/admin/AttackSimulation.tsx` — 1 select
13. `src/pages/admin/SecurityBenchmark.tsx` — 1 select
14. `src/pages/admin/IdentitySecurity.tsx` — 2 selects
15. `src/pages/admin/RansomwareIncident.tsx` — 2 selects

### Batch 4 — Páginas Tenant (6 instâncias)
16. `src/pages/admin/tenant/TenantSecurity.tsx` — 1 select (audit_logs — 3 JSONB!)
17. `src/pages/admin/tenant/TenantSettings.tsx` — 1 select
18. `src/pages/admin/tenant/TenantLogs.tsx` — 1 select (audit_logs — 3 JSONB!)
19. `src/pages/admin/tenant/TenantInvites.tsx` — 1 select

### Batch 5 — Componentes (6 instâncias)
20. `src/components/admin/ScheduledReportsManager.tsx` — 1 select
21. `src/components/admin/GeneratedReportsList.tsx` — 1 select (generated_reports — 2 JSONB!)
22. `src/components/admin/autonomy/HumanInTheLoopPanel.tsx` — 1 select
23. `src/components/security/TenantClaimAlerts.tsx` — 1 select

### Batch 6 — Utilitários e Super Admin (4 instâncias)
24. `src/lib/audit-integrity.ts` — 1 select (audit_logs — 3 JSONB!)
25. `src/pages/super-admin/RolloutPolicies/useRolloutPolicies.ts` — 1 select
26. `src/lib/tenantQuery.ts` — exemplo em comentário (apenas doc fix)

## Validação
- `npx tsc --noEmit` após cada batch para zero erros de tipo
- Verificar que cada componente continua renderizando os mesmos dados
- Build final completo

## Impacto Estimado
- **Redução de tráfego**: ~60% menos dados transferidos em tabelas com JSONB
- **Economia**: ~2KB/linha × milhares de linhas/dia = GBs/mês de bandwidth economizados
- **Performance**: Queries mais rápidas (PostgreSQL pode usar index-only scans)
