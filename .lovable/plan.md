
# Plano: Correção de Agentes Sem Polling e Limpeza da DLQ

## Diagnóstico Atualizado

### Estado Atual do Sistema

| Métrica | Valor | Status |
|---------|-------|--------|
| Agentes fazendo polling | 1 (apenas Pc-Vidro-Planalto) | CRÍTICO |
| Agentes online (heartbeat < 1 min) | 2 (PC-Amanda, Pc-Vidro-Planalto) | OK |
| Agentes "dormindo" (heartbeat 18+ min) | 9 agentes | Desligados/Standby |
| DLQ pendente total | 601 itens | Melhorou (era 2.255) |
| DLQ antiga (>7 dias) | 0 | LIMPA |
| DLQ recente (<1 dia) | 165 | Precisa atenção |

### Por Que Apenas Pc-Vidro-Planalto Faz Polling?

A investigação revelou que:

1. **Force-update foi aplicado** e depois limpo (campos `force_update_*` estão `nil`)
2. **Apenas 2 agentes estão verdadeiramente online** (heartbeat < 1 min)
3. **Pc-Vidro-Planalto** está fazendo polling corretamente (24 execuções/hora)
4. **PC-Amanda** está online mas com 0 execuções - script ainda antigo
5. **Os outros 9 agentes** têm heartbeat de ~18 minutos atrás - provavelmente desligados ou em standby

**Causa Raiz**: Os scripts antigos não processam o campo `force_update` do response do heartbeat. Eles simplesmente ignoram e continuam rodando o código antigo sem polling.

---

## Ações Necessárias

### Fase A: Reinstalar Agentes que Não Estão Fazendo Polling (P0 - CRÍTICO)

O mecanismo de force-update **não funciona** para agentes com scripts muito antigos porque eles não têm o código para processar o `force_update` no response.

**Solução**: Usar o script de reinstalação preservando credenciais diretamente nos computadores afetados.

#### Para PC-Amanda (online mas sem polling)

Execute **no computador do PC-Amanda** como Administrador:

```text
powershell
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
```

O script irá:
1. Detectar automaticamente AgentName, AgentToken, HmacSecret do script existente
2. Fazer backup do script atual
3. Baixar a versão mais recente via `/serve-agent-update`
4. Reinstalar e iniciar o agente
5. Preservar toda a identidade e histórico no dashboard

#### Para Agentes Offline (quando ligarem)

Os 9 agentes com heartbeat antigo estão offline/desligados. Quando voltarem:
1. Executar o mesmo script de reinstalação
2. Ou aguardar um novo force-update quando tiverem script capaz de processar

---

### Fase B: Forçar Update Quando Agentes Reconectarem (P1)

Para garantir que agentes offline recebam update quando reconectarem:

**SQL para definir force-update para todos os agentes exceto Pc-Vidro-Planalto:**

```sql
-- Forçar atualização quando agentes reconectarem
UPDATE agents 
SET 
  force_update_version = 'v4.4.0',
  force_update_reason = 'Reinstalação forçada - script sem loop de polling',
  force_update_at = NOW()
WHERE archived_at IS NULL
  AND status = 'active'
  AND agent_name NOT IN ('Pc-Vidro-Planalto');
```

**NOTA**: Isso só funcionará se o agente tiver um script que processa force_update. Caso contrário, será necessária reinstalação manual.

---

### Fase C: Limpar DLQ Restante (P2)

A DLQ foi reduzida de 2.255 para 601 itens. Para limpar o restante:

```sql
-- Opção 1: Marcar DLQ média (3-7 dias) como resolvida
UPDATE failed_jobs_dlq
SET 
  status = 'resolved',
  resolution_source = 'auto_cleanup',
  resolution_notes = 'Limpeza automática - DLQ pendente há mais de 3 dias',
  resolved_at = NOW()
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '3 days';

-- Opção 2: Verificar DLQ recente antes de resolver
SELECT 
  job_type,
  COUNT(*) as count,
  MIN(created_at) as oldest
FROM failed_jobs_dlq
WHERE status = 'pending'
  AND created_at > NOW() - INTERVAL '3 days'
GROUP BY job_type
ORDER BY count DESC;
```

---

## Validação Pós-Correção

### Imediata (após reinstalar PC-Amanda)
1. Verificar logs de `/poll-jobs` - deve aparecer "PC-Amanda"
2. Verificar `job_executions` - deve ter novas execuções de PC-Amanda
3. Verificar jobs queued - devem ser entregues

### Em 24-48 horas (quando outros agentes ligarem)
1. Monitorar heartbeats dos 9 agentes offline
2. Verificar se recebem force-update ou precisam reinstalação manual
3. Confirmar polling funcionando para todos

### DLQ
1. Query: `SELECT status, COUNT(*) FROM failed_jobs_dlq GROUP BY status`
2. Pendente deve ser < 200 após limpeza

---

## Resumo de Entregáveis

| Prioridade | Ação | Responsável | Tipo |
|------------|------|-------------|------|
| **P0** | Reinstalar PC-Amanda via script | Usuário | Script no computador |
| **P1** | Definir force-update para outros agentes | SQL no dashboard | SQL UPDATE |
| **P2** | Limpar DLQ média (3-7 dias) | SQL no dashboard | SQL UPDATE |
| **P3** | Reinstalar agentes offline quando ligarem | Usuário | Script no computador |

---

## Comando de Reinstalação (Copiar e Colar)

Para qualquer agente que não esteja fazendo polling, executar **no computador do agente** como Administrador:

```text
powershell -ExecutionPolicy Bypass -Command "irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex"
```

Este comando:
- Detecta credenciais automaticamente do script existente
- Baixa a versão v4.4.0 com loop de polling funcionando
- Preserva identidade no dashboard
- Cria backup do script antigo
