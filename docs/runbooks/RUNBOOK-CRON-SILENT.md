# Runbook: Silêncio de Cron Job

**Severidade**: Média-Alta  
**Meta MTTR**: < 30 minutos  
**Escalação**: Após 2x o intervalo esperado sem execução

---

## Sintomas

- Jobs agendados não executando
- `v_cron_silence` mostrando entradas
- Dados desatualizados em relatórios/métricas
- Heartbeats ausentes em `scheduled_job_heartbeat`

---

## Diagnóstico Rápido

### 1. Verificar View de Silêncio de Cron

```sql
SELECT * FROM v_cron_silence;
```

Mostra jobs que não executaram por 2x o intervalo esperado.

### 2. Verificar Heartbeats dos Jobs

```sql
SELECT 
  job_key,
  last_seen_at,
  expected_interval,
  NOW() - last_seen_at AS duracao_silencio,
  CASE 
    WHEN NOW() - last_seen_at > expected_interval * 2 THEN 'CRITICO'
    WHEN NOW() - last_seen_at > expected_interval THEN 'ALERTA'
    ELSE 'OK'
  END AS status
FROM scheduled_job_heartbeat
ORDER BY last_seen_at ASC;
```

### 3. Verificar Logs de Invocação de Edge Functions

```sql
-- Verificar se o agendador cron está invocando as funções
SELECT 
  timestamp,
  event_message,
  metadata
FROM edge_logs
WHERE function_id = 'seu-id-de-funcao'
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Causas Comuns

### A. Modo de Emergência Ativo

**Sintoma**: Todos os jobs pararam simultaneamente

**Verificar**:
```sql
SELECT * FROM get_system_mode_safe();
```

**Correção**: Ver [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)

### B. Falha no Deploy de Edge Function

**Sintoma**: Função específica não executando

**Verificar**:
```bash
npx supabase functions list
```

**Correção**:
```bash
npx supabase functions deploy nome-da-funcao
```

### C. Exaustão de Conexões do Banco

**Sintoma**: Funções com timeout ou falhas de conexão

**Verificar**:
```sql
SELECT count(*) FROM pg_stat_activity 
WHERE state = 'active';
```

**Correção**:
1. Encerrar conexões ociosas
2. Revisar configurações de connection pooling
3. Otimizar queries de longa duração

### D. Problema no Agendador

**Sintoma**: Nenhuma invocação nos logs de Edge

**Verificar**: Dashboard → Edge Functions → Schedules

**Correção**:
1. Verificar se o cronograma está configurado
2. Reativar se desabilitado
3. Contatar suporte se persistir

### E. Loop de Erro na Função

**Sintoma**: Função executa mas falha imediatamente

**Verificar**:
```bash
npx supabase functions logs nome-da-funcao --tail
```

**Correção**: Debugar e corrigir o código da função

---

## Procedimento de Recuperação

### Imediato (< 10 min)

1. **Identificar quais jobs estão silenciosos**
   ```sql
   SELECT * FROM v_cron_silence ORDER BY silence_duration DESC;
   ```

2. **Verificar modo do sistema**
   ```sql
   SELECT * FROM get_system_mode_safe();
   ```

3. **Disparo manual se crítico**
   ```bash
   curl -X POST "${SUPABASE_URL}/functions/v1/nome-do-job" \
     -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
   ```

### Investigação (< 20 min)

1. **Revisar logs da função**
   ```bash
   npx supabase functions logs nome-do-job --tail 100
   ```

2. **Verificar erros nas últimas execuções**
   ```sql
   SELECT * FROM scheduled_jobs
   WHERE job_type = 'nome_do_job'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **Verificar dependências**
   - Tabelas do banco existem
   - Secrets necessários configurados
   - APIs externas acessíveis

### Correção e Verificação

1. **Aplicar correção** (redeploy, corrigir config, etc.)

2. **Disparo manual para verificar**

3. **Atualizar heartbeat**
   ```sql
   SELECT update_job_heartbeat('nome_do_job', '5 minutes'::interval);
   ```

4. **Monitorar próxima execução agendada**

---

## Configuração de Heartbeat de Jobs

### Adicionando Heartbeat a Novos Jobs

Todo job agendado deve chamar `update_job_heartbeat` ao final:

```typescript
// Na Edge Function
await supabase.rpc('update_job_heartbeat', {
  p_job_key: 'meu-nome-de-job',
  p_expected_interval: '10 minutes'
});
```

### Intervalos Esperados

| Job | Intervalo Esperado |
|-----|-------------------|
| `security-alert-dispatcher` | 5 minutos |
| `run-rls-tests` | 1 hora |
| `cleanup-jobs` | 6 horas |
| `generate-reports` | 24 horas |

---

## Monitoramento

### Criar Alerta para Jobs Silenciosos

```sql
-- Adicionar ao security-alert-dispatcher
INSERT INTO system_alerts (alert_type, severity, message, resolved)
SELECT 
  'cron_silence',
  'warning',
  'Job ' || job_key || ' silencioso por ' || silence_duration,
  false
FROM v_cron_silence
WHERE silence_duration > expected_interval * 2;
```

### Query para Dashboard

```sql
SELECT 
  job_key,
  last_seen_at,
  expected_interval,
  ROUND(EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 60) AS minutos_desde_ultima_execucao,
  CASE 
    WHEN NOW() - last_seen_at > expected_interval * 3 THEN '🔴 CRÍTICO'
    WHEN NOW() - last_seen_at > expected_interval * 2 THEN '🟠 ALERTA'
    WHEN NOW() - last_seen_at > expected_interval THEN '🟡 ATRASADO'
    ELSE '🟢 OK'
  END AS saude
FROM scheduled_job_heartbeat
ORDER BY 
  CASE WHEN NOW() - last_seen_at > expected_interval * 2 THEN 0 ELSE 1 END,
  last_seen_at ASC;
```

---

## Prevenção

1. **Sempre adicionar chamadas de heartbeat a jobs agendados**
2. **Monitorar `v_cron_silence` no dashboard de observabilidade**
3. **Configurar alertas para jobs 2x além do intervalo esperado**
4. **Documentar intervalos esperados no código do job**

---

## Runbooks Relacionados

- [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)
- [RUNBOOK-EDGE-500.md](./RUNBOOK-EDGE-500.md)
