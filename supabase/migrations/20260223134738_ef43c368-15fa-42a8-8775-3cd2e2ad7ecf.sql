
-- =====================================================
-- COST-OPT: Reduzir frequência de pg_cron jobs
-- Objetivo: Reduzir ~70% das invocações de edge functions via cron
-- =====================================================

-- 1. process-scheduled-jobs: */3 → */15 (reduz 5x)
SELECT cron.alter_job(1, schedule := '*/15 * * * *');

-- 2. security-alert-dispatcher: */30 → 0 */2 (a cada 2h)
SELECT cron.alter_job(16, schedule := '0 */2 * * *');

-- 3. send-report-notification: */30 → 0 */6 (a cada 6h)
SELECT cron.alter_job(30, schedule := '0 */6 * * *');

-- 4. cleanup-stuck-jobs: */30 → 0 */2 (a cada 2h)
SELECT cron.alter_job(33, schedule := '0 */2 * * *');

-- 5. monitor-thresholds (pg_cron direto): 30 min → 0 */2 (a cada 2h)
SELECT cron.alter_job(39, schedule := '0 */2 * * *');

-- 6. integrity-sentinel (pg_cron direto): */30 → 0 */6 (a cada 6h)
SELECT cron.alter_job(73, schedule := '0 */6 * * *');

-- 7. evaluate-software-risk: 0 6 → 0 6 * * 1 (semanal)
SELECT cron.alter_job(88, schedule := '0 6 * * 1');

-- 8. auto-execute-ai-actions (pg_cron direto): */30 → 0 */2 (a cada 2h)
SELECT cron.alter_job(93, schedule := '0 */2 * * *');

-- 9. monitor-agent-health: */30 → 0 */2 (a cada 2h)
SELECT cron.alter_job(95, schedule := '0 */2 * * *');

-- 10. maintenance-cron: */30 → 0 */2 (a cada 2h)
SELECT cron.alter_job(83, schedule := '0 */2 * * *');

-- 11. check-action-effectiveness: 0 * → 0 */6 (a cada 6h)
SELECT cron.alter_job(92, schedule := '0 */6 * * *');

-- 12. evaluate-automation-rules: */30 → 0 */2 (a cada 2h)
SELECT cron.alter_job(100, schedule := '0 */2 * * *');

-- 13. run-rls-tests: 0 */6 → 0 4 * * * (diário)
SELECT cron.alter_job(77, schedule := '0 4 * * *');

-- 14. Desativar jobs redundantes (já cobertos por scheduled_jobs + invoke-scheduled-jobs)
-- ai-system-analyzer já está no scheduled_jobs
SELECT cron.alter_job(14, schedule := '0 4 * * *');

-- 15. generate-weekly-report: */30 (ABSURDO!) → semanal
SELECT cron.alter_job(49, schedule := '0 6 * * 1');

-- 16. hmac-cleanup: */2h → diário
SELECT cron.alter_job(21, schedule := '0 3 * * *');

-- 17. cleanup_old_data_scheduled: 0 * → 0 */6 (a cada 6h)  
SELECT cron.alter_job(34, schedule := '0 */6 * * *');

-- 18. verify-log-integrity: 0 * → 0 */12 (2x/dia)
SELECT cron.alter_job(55, schedule := '0 */12 * * *');

-- 19. process-dlq-retries: 15 * → 0 */3 (a cada 3h)
SELECT cron.alter_job(96, schedule := '0 */3 * * *');

-- 20. process-playbook-trigger-logs: 20 * → 0 */3 (a cada 3h)
SELECT cron.alter_job(97, schedule := '0 */3 * * *');

-- 21. calculate-risk-score: 0 5 * * * → 0 5 * * 1 (semanal)
SELECT cron.alter_job(60, schedule := '0 5 * * 1');

-- 22. process-agent-updates: 0 */6 → 0 */12 (2x/dia)
SELECT cron.alter_job(78, schedule := '0 */12 * * *');

-- 23. calculate-compliance: semanal OK, mantém
-- 24. check-tenant-quotas: 0 * → 0 */6 (a cada 6h)
SELECT cron.alter_job(5, schedule := '0 */6 * * *');
