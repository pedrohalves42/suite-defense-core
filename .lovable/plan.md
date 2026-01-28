

# 🔍 Análise dos 8 Playbooks Inativos - Problemas e Correções

## Resumo Executivo

Após análise profunda, identifiquei **3 problemas raiz** que impedem os 8 playbooks de executar:

| Problema | Impacto | Playbooks Afetados |
|----------|---------|-------------------|
| **Falta cron para processar `ai_action_logs` pendentes** | 219 triggers de playbook pendentes há 21 dias | 1 (Job crítico) |
| **Falta trigger/cron para eventos DNS** | 710 bloqueios e 20+ eventos 10+/hora não detectados | 2 (DNS, Múltiplos Acessos) |
| **Falta integração de dados upstream** | Nenhum dado de vulnerabilidade, software de risco | 5 (Vuln, Software Risk, Nav Suspeita) |

---

## 📊 Evidências Encontradas

### 1. `ai_action_logs` com 219 Triggers Pendentes (NUNCA processados)

```
action_type: playbook_trigger_evaluation
status: pending = 219 (100% não processados)
oldest: 2026-01-07 (21 dias atrás!)
```

**Causa**: O trigger `tr_playbook_on_job_failure` insere eventos em `ai_action_logs`, mas **não existe cron/função que processe esses logs** para chamar `evaluate-playbook-triggers`.

**Playbook afetado**: "Job crítico falhou repetidamente"

### 2. Bloqueios DNS Que Deveriam Acionar Playbooks

**Dados existentes**:
- 710 bloqueios DNS nos últimos 7 dias
- 20+ eventos com 10+ bloqueios/hora (threshold do playbook é 10)
- Categorias bloqueadas: apenas "social" (0 de malware/c2/botnet)

**Playbooks afetados**:
- "DNS bloqueou múltiplas tentativas" - condição met (10+ bloqueios/hora existe)
- "Múltiplos Acessos Maliciosos" - condição NÃO met (0 categorias maliciosas)
- "Navegação Suspeita Detectada" - condição NÃO met (0 categorias suspeitas)

**Causa**: 
1. Não existe trigger em `agent_web_activity` para chamar `evaluate-playbook-triggers`
2. Não existe cron para varrer bloqueios e disparar playbooks

### 3. Dados Upstream Faltando

| Playbook | Dados Necessários | Status |
|----------|-------------------|--------|
| Vulnerabilidade Crítica | Tabela `software_vulnerability_baseline` ou similar | ❌ Sem dados de vuln com CVSS |
| Software de Alto Risco | `software_inventory.risk_level = high/critical` | ⚠️ Só "unknown", "low", "medium" |
| Navegação Suspeita | `category IN (malware, phishing, suspicious)` | ❌ Só "social" |

### 4. Jobs Críticos Falhando Repetidamente (Deveriam ter acionado playbook)

```
agent feba35aa-b478: 21 falhas em collect_antivirus_status
agent feba35aa-b478: 20 falhas em software_inventory_collect  
agent db27a406-b510: 20 falhas em light_vuln_scan
... (20+ agentes com 3+ falhas em jobs críticos)
```

**Mas**: O playbook "Job crítico falhou repetidamente" tem 0 execuções porque os eventos ficaram em `ai_action_logs.status = 'pending'`.

---

## 🛠️ Plano de Correção

### Fase 1: Processar `ai_action_logs` Pendentes (P0)

**Criar cron para processar eventos de trigger de playbook:**

```sql
SELECT cron.schedule(
  'process-playbook-trigger-events-every-5min',
  '*/5 * * * *',
  $$
  WITH pending_events AS (
    SELECT id, action_data
    FROM ai_action_logs
    WHERE action_type = 'playbook_trigger_evaluation'
      AND status = 'pending'
    LIMIT 50
  )
  UPDATE ai_action_logs
  SET status = 'processing'
  WHERE id IN (SELECT id FROM pending_events);
  
  -- Nota: A chamada real à Edge Function será via http_post
  SELECT net.http_post(
    url:='https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/evaluate-playbook-triggers',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_FUNCTION_SECRET')
    ),
    body:=jsonb_build_object(
      'tenant_id', pe.action_data->>'tenant_id',
      'trigger_type', pe.action_data->>'trigger_type',
      'agent_id', pe.action_data->>'agent_id',
      'context', pe.action_data
    )
  )
  FROM pending_events pe;
  $$
);
```

**Alternativa mais simples - Criar Edge Function processadora:**

Criar uma nova Edge Function `process-playbook-trigger-logs` que:
1. Busca `ai_action_logs` com `status = 'pending'` e `action_type = 'playbook_trigger_evaluation'`
2. Para cada log, chama internamente `evaluate-playbook-triggers`
3. Marca o log como `processed`

### Fase 2: Criar Trigger para Bloqueios DNS (P1)

**Criar função e trigger para detectar múltiplos bloqueios:**

```sql
CREATE OR REPLACE FUNCTION trigger_playbook_on_multiple_dns_blocks()
RETURNS TRIGGER AS $$
DECLARE
  v_blocked_count INTEGER;
  v_tenant_id UUID;
BEGIN
  -- Só processar bloqueios
  IF NOT NEW.is_blocked THEN
    RETURN NEW;
  END IF;
  
  -- Contar bloqueios na última hora para este agente
  SELECT COUNT(*), t.id INTO v_blocked_count, v_tenant_id
  FROM agent_web_activity aw
  JOIN agents a ON aw.agent_id = a.id
  JOIN tenants t ON a.tenant_id = t.id
  WHERE aw.agent_id = NEW.agent_id
    AND aw.is_blocked = true
    AND aw.created_at > NOW() - INTERVAL '1 hour'
  GROUP BY t.id;
  
  -- Se atingiu 10 bloqueios, criar evento para playbook
  IF v_blocked_count >= 10 THEN
    INSERT INTO ai_action_logs (
      tenant_id,
      action_type,
      action_data,
      status
    ) VALUES (
      v_tenant_id,
      'playbook_trigger_evaluation',
      jsonb_build_object(
        'trigger_type', 'dns_blocked',
        'agent_id', NEW.agent_id,
        'blocked_count', v_blocked_count,
        'time_window_hours', 1,
        'latest_domain', NEW.domain,
        'category', NEW.category
      ),
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_playbook_on_dns_blocks
  AFTER INSERT ON agent_web_activity
  FOR EACH ROW
  WHEN (NEW.is_blocked = true)
  EXECUTE FUNCTION trigger_playbook_on_multiple_dns_blocks();
```

### Fase 3: Processar 219 Eventos Pendentes Imediatamente (P0)

**Processar em lote os eventos antigos:**

Chamar manualmente a Edge Function ou criar uma query que converta os eventos em execuções de playbook:

```sql
-- Marcar eventos como processados (já muito antigos para serem úteis)
UPDATE ai_action_logs
SET 
  status = 'expired',
  processed_at = NOW(),
  notes = 'Expirado: evento de 21+ dias sem processamento. Corrigido via recovery plan.'
WHERE action_type = 'playbook_trigger_evaluation'
  AND status = 'pending'
  AND created_at < NOW() - INTERVAL '7 days';
```

### Fase 4: Melhorar Dados Upstream (P2)

Para os playbooks de vulnerabilidade e software de risco funcionarem, é necessário:

1. **Scan de Vulnerabilidades**: Garantir que `scan-vulnerabilities` Edge Function está rodando e populando dados
2. **Risk Level em Software**: Garantir que `evaluate-software-risk` está classificando software corretamente
3. **Categorias de DNS**: Verificar se o serviço de categorização de URLs está retornando categorias além de "social"

---

## 📋 Resumo de Alterações

| Tipo | Descrição | Prioridade |
|------|-----------|------------|
| **Edge Function** | Criar `process-playbook-trigger-logs` | P0 |
| **Cron Job** | `process-playbook-trigger-events-every-5min` | P0 |
| **Trigger** | `tr_playbook_on_dns_blocks` em `agent_web_activity` | P1 |
| **Data Update** | Expirar 219 eventos pendentes antigos | P0 |
| **Investigação** | Verificar pipeline de vulnerabilidades | P2 |

---

## ✅ Validação Pós-Implementação

```sql
-- 1. Verificar ai_action_logs processados
SELECT status, COUNT(*) 
FROM ai_action_logs 
WHERE action_type = 'playbook_trigger_evaluation'
GROUP BY status;

-- 2. Verificar playbooks executando
SELECT p.name, COUNT(pe.id) as executions
FROM playbooks p
LEFT JOIN playbook_executions pe ON pe.playbook_id = p.id
WHERE p.is_enabled = true
GROUP BY p.id, p.name
ORDER BY executions DESC;

-- 3. Verificar trigger de DNS ativo
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'tr_playbook_on_dns_blocks';
```

---

## Notas Importantes

1. **O trigger `tr_playbook_on_job_failure` existe e funciona**, mas os eventos vão para `ai_action_logs` que **nunca são processados**.

2. **Não existe nenhum cron** que chame `evaluate-playbook-triggers` periodicamente. A Edge Function só é chamada manualmente ou via `useTriggerManualPlaybook`.

3. **Bloqueios DNS de 10+ por hora existem** (20 eventos), mas o playbook "DNS bloqueou múltiplas tentativas" já executou 2 vezes - provavelmente via trigger manual. O problema é que não há automação.

4. **Categorias maliciosas (malware, c2, botnet)**: 0 registros. Isso pode indicar:
   - Rede segura (sem ameaças reais)
   - Serviço de categorização não está classificando corretamente
   - Bloqueios estão funcionando apenas para "social" (redes sociais)

