
# Plano: Correção de Agentes Sem Polling e Limpeza da DLQ

## 📋 Diagnóstico Confirmado

### Problema 1: Apenas PC-Amanda faz polling (CRÍTICO)
| Evidência | Valor |
|-----------|-------|
| Logs de `/poll-jobs` | Apenas PC-Amanda nos logs das últimas horas |
| Versão no banco | Todos mostram `v4.4.0` |
| Causa raiz | **Scripts locais desatualizados** - o campo `agent_version` é atualizado via heartbeat mas não reflete o script instalado |

### Problema 2: DLQ com 2.255 itens pendentes
| Bucket de Idade | Quantidade |
|-----------------|------------|
| Antigos (>7 dias) | 1.659 |
| Médios (3-7 dias) | 388 |
| Recentes (<3 dias) | 208 |

---

## 🔧 Fase A: Forçar Atualização dos Agentes via Force-Update (P0 - CRÍTICO)

### Ação
O mecanismo de force-update já existe e funciona. Quando o agente envia heartbeat, o backend verifica se `force_update_version` está definido e envia o novo script na resposta.

### SQL a Executar
Execute no Lovable Cloud → Run SQL:

```sql
-- Forçar atualização de todos os agentes online (exceto PC-Amanda que já funciona)
UPDATE agents 
SET 
  force_update_version = 'v4.4.0',
  force_update_reason = 'Script local desatualizado - não está fazendo polling de jobs',
  force_update_at = NOW()
WHERE archived_at IS NULL
  AND status = 'active'
  AND last_heartbeat > NOW() - INTERVAL '10 minutes'
  AND agent_name != 'PC-Amanda';
```

### Como Funciona
1. No próximo heartbeat (dentro de ~60 segundos), cada agente receberá:
   ```json
   {
     "force_update": true,
     "target_version": "v4.4.0",
     "script_content_base64": "...",
     "sha256": "...",
     "reason": "Script local desatualizado..."
   }
   ```
2. O agente executa `Apply-ForcedUpdate`:
   - Decodifica Base64
   - Valida SHA256
   - Substitui script local
   - Reinicia Scheduled Task
3. Após reinício, o agente terá o script correto e começará a fazer polling

### Validação
- Aguardar 2-3 minutos após executar SQL
- Verificar logs de `poll-jobs` - devem aparecer novos agentes
- Query para confirmar:
  ```sql
  SELECT agent_name, COUNT(*) 
  FROM job_executions 
  WHERE created_at > NOW() - INTERVAL '5 minutes'
  GROUP BY agent_name;
  ```

---

## 🔧 Fase B: Limpar DLQ Antiga (P1)

### Ação
Resolver automaticamente itens da DLQ com mais de 7 dias (são obsoletos).

### SQL a Executar
```sql
-- Limpar DLQ antiga (>7 dias)
UPDATE failed_jobs_dlq
SET 
  status = 'resolved',
  resolution_source = 'auto_cleanup',
  resolution_notes = 'Limpeza automática de itens antigos (>7 dias sem processar)',
  resolved_at = NOW()
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '7 days';

-- Verificar resultado
SELECT status, COUNT(*) FROM failed_jobs_dlq GROUP BY status;
```

### Resultado Esperado
- ~1.659 itens resolvidos automaticamente
- DLQ pendente reduzida de 2.255 para ~596

---

## 🔧 Fase C: Limpar Jobs Expirados (P2)

### Ação
Jobs muito antigos em `queued` devem ser cancelados para evitar acúmulo.

### SQL a Executar
```sql
-- Cancelar jobs queued há mais de 24 horas (expirados)
UPDATE jobs
SET 
  status = 'cancelled',
  error_message = 'Job expirado - não entregue em 24 horas'
WHERE status = 'queued'
  AND created_at < NOW() - INTERVAL '24 hours';

-- Verificar jobs queued restantes
SELECT 
  a.agent_name,
  COUNT(j.id) as jobs_queued
FROM jobs j
JOIN agents a ON j.agent_id = a.id
WHERE j.status = 'queued'
GROUP BY a.agent_name
ORDER BY jobs_queued DESC;
```

---

## 📊 Resumo de Entregáveis

| Prioridade | Ação | Tipo | Impacto |
|------------|------|------|---------|
| **P0** | Force-update em agentes problemáticos | SQL UPDATE | 10 agentes atualizados |
| **P1** | Limpar DLQ >7 dias | SQL UPDATE | ~1.659 itens resolvidos |
| **P2** | Cancelar jobs expirados | SQL UPDATE | Reduz backlog |

---

## ✅ Validação Pós-Correção

### Em 5 minutos
1. **Logs de poll-jobs**: Devem mostrar TODOS os agentes online
2. **job_executions**: Novas execuções de múltiplos agentes
3. **Jobs queued**: Devem começar a ser entregues

### Em 30 minutos
1. **DLQ pendente**: < 600 itens
2. **Ciclos de saúde**: Melhoria no dashboard

---

## 🔍 Por que PC-Amanda Funciona e os Outros Não?

PC-Amanda provavelmente:
1. Foi reinstalado manualmente mais recentemente
2. Ou teve o force-update aplicado com sucesso anteriormente
3. Ou é um computador que não estava ligado durante períodos de problemas anteriores

Os outros agentes podem ter recebido o heartbeat de atualização de versão (que atualiza `agent_version` no banco) mas **nunca aplicaram o script atualizado** por:
- Erros durante `Apply-ForcedUpdate`
- Scheduled Task não reiniciou corretamente
- Script antigo continuou rodando na memória

O force-update forçará uma nova tentativa de atualização.

---

## Arquivos Modificados
Nenhum arquivo precisa ser modificado. Todas as ações são via SQL no dashboard.

---

## Alternativa: Reinstalação Manual

Se o force-update não funcionar em algum agente específico, usar o script de reinstalação preservando credenciais:

```powershell
# Executar no computador do agente como Administrador
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
```
