# Runbook: Falha de Banco de Dados / Degradacao PostgreSQL

**Severidade**: Critica
**Meta MTTR**: < 15 minutos
**Escalacao**: Imediata para L2

---

## Sintomas

- Edge Functions retornando erros 500 com mensagens de conexao
- Latencia elevada em queries (>1s p95)
- Timeouts em operacoes de banco
- Dashboard mostrando dados desatualizados
- Heartbeats falhando em massa
- Logs mostrando `connection refused` ou `too many connections`

---

## Diagnostico Rapido

### 1. Verificar Saude do Banco

```sql
SELECT count(*) as conexoes_ativas,
       state,
       wait_event_type
FROM pg_stat_activity
GROUP BY state, wait_event_type
ORDER BY count(*) DESC;
```

### 2. Verificar Queries Lentas

```sql
SELECT pid, now() - pg_stat_activity.query_start AS duracao,
       query, state, wait_event_type
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state != 'idle'
ORDER BY duracao DESC;
```

### 3. Verificar Tamanho das Tabelas

```sql
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

### 4. Verificar Locks

```sql
SELECT blocked_locks.pid AS blocked_pid,
       blocking_locks.pid AS blocking_pid,
       blocked_activity.query AS blocked_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.relation = blocked_locks.relation
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

---

## Causas Comuns

| Causa | Frequencia | Impacto |
|-------|-----------|---------|
| Connection pool esgotado | Alta | Todas as funcoes falham |
| Query lenta sem indice | Alta | Degradacao progressiva |
| Lock contention em tabela quente | Media | Writes bloqueados |
| Tabela de telemetria muito grande | Media | Scans lentos |
| Vacuum nao executando | Baixa | Bloat, degradacao |
| Failover de replica | Baixa | Downtime temporario |

---

## Procedimento de Resolucao

### Nivel 1 — Mitigacao Imediata

1. **Matar queries travadas** (>60s):
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE duration > interval '60 seconds'
     AND state = 'active'
     AND query NOT LIKE '%pg_stat%';
   ```

2. **Verificar Edge Functions com mais erros**:
   - Consultar logs das funcoes mais chamadas (heartbeat, poll-jobs)
   - Ativar modo de emergencia se necessario

3. **Verificar se cleanup-cron esta executando**:
   ```sql
   SELECT * FROM scheduled_job_heartbeat
   WHERE job_name LIKE '%cleanup%'
   ORDER BY last_run_at DESC;
   ```

### Nivel 2 — Investigacao

1. **Analisar plano de queries lentas**:
   ```sql
   EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
   <query_lenta_aqui>;
   ```

2. **Verificar indices ausentes**:
   ```sql
   SELECT schemaname, tablename, attname, n_distinct, correlation
   FROM pg_stats
   WHERE schemaname = 'public'
     AND tablename IN ('agent_telemetry', 'jobs', 'agents', 'security_events')
   ORDER BY tablename, attname;
   ```

3. **Verificar bloat**:
   ```sql
   SELECT relname, n_dead_tup, n_live_tup,
          round(n_dead_tup::numeric / greatest(n_live_tup, 1) * 100, 2) AS dead_pct
   FROM pg_stat_user_tables
   WHERE n_dead_tup > 10000
   ORDER BY n_dead_tup DESC;
   ```

### Nivel 3 — Recuperacao

1. **Executar cleanup manual**:
   - Chamar `cleanup-router` com acao `telemetry`
   - Chamar `cleanup-router` com acao `stuck-jobs`

2. **VACUUM em tabelas criticas**:
   ```sql
   VACUUM (VERBOSE, ANALYZE) agent_telemetry;
   VACUUM (VERBOSE, ANALYZE) jobs;
   ```

3. **Escalar para suporte Supabase** se o problema persistir

---

## Prevencao

| Acao | Frequencia | Responsavel |
|------|-----------|-------------|
| Cleanup de telemetria | Diario (cron) | maintenance-cron |
| Verificacao de indices | Semanal | DBA |
| Monitoramento de conexoes | Continuo | health-monitor |
| Review de queries lentas | Quinzenal | Engineering |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Ops | Versao inicial |
