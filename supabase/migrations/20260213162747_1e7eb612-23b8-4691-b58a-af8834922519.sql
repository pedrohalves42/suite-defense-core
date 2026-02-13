
-- Fix: Monitoring view using correct column names
CREATE OR REPLACE VIEW v_database_size_report AS
SELECT
    schemaname,
    relname as table_name,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size,
    pg_size_pretty(pg_relation_size(relid)) as table_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as index_size,
    n_tup_ins as rows_inserted,
    n_tup_del as rows_deleted,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

GRANT SELECT ON v_database_size_report TO authenticated;
GRANT SELECT ON v_database_size_report TO service_role;
