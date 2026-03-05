# Monitor de Agentes Stuck - Documentação

## Visão Geral

O `monitor-stuck-agents` é um Edge Function que monitora automaticamente agentes que ficaram travados em estado `pending` sem enviar heartbeat.

## Critérios de Detecção

Um agente é considerado **stuck** quando:
- ✅ Status = `pending`
- ✅ `last_heartbeat` = NULL (nunca enviou heartbeat)
- ✅ Criado há mais de **10 minutos**

## Funcionamento

### Execução Automática
- **Frequência**: A cada 10 minutos (cron: `*/10 * * * *`)
- **Trigger**: Supabase Edge Runtime scheduler

### Ações Realizadas

1. **Query de agentes stuck**
   ```sql
   SELECT id, agent_name, status, enrolled_at, tenant_id, last_heartbeat
   FROM agents
   WHERE status = 'pending'
     AND last_heartbeat IS NULL
     AND enrolled_at < NOW() - INTERVAL '10 minutes';
   ```

2. **Criação de alertas** (`system_alerts`)
   - Severidade: `high` se stuck > 60 min, `medium` se 10-60 min
   - Tipo: `stuck_agent`
   - Metadata: agent_id, agent_name, minutes_stuck, etc.

3. **Log de segurança** (`security_logs`)
   - Registra evento `stuck_agents_detected`
   - Lista de todos os agentes afetados

## Response Format

### Sucesso (sem agentes stuck)
```json
{
  "success": true,
  "stuck_agents": 0,
  "message": "No stuck agents detected",
  "timestamp": "2025-01-19T17:00:00.000Z"
}
```

### Sucesso (com agentes stuck)
```json
{
  "success": true,
  "stuck_agents": 2,
  "alerts_created": 2,
  "agents": [
    {
      "id": "uuid-123",
      "name": "teste-vm-01",
      "minutes_stuck": 15
    },
    {
      "id": "uuid-456",
      "name": "teste-vm-02",
      "minutes_stuck": 32
    }
  ],
  "timestamp": "2025-01-19T17:00:00.000Z"
}
```

### Erro
```json
{
  "success": false,
  "error": "Query error: ...",
  "requestId": "uuid",
  "timestamp": "2025-01-19T17:00:00.000Z"
}
```

## Troubleshooting

### Por que um agente ficou stuck?

As causas mais comuns são:

1. **Credenciais inválidas**
   - Token ou HMAC secret incorretos
   - Verificar: `SELECT * FROM agent_tokens WHERE agent_id = 'uuid'`

2. **Script não executou**
   - Scheduled Task não foi criada
   - PowerShell bloqueado (ExecutionPolicy)
   - Arquivo com Zone.Identifier

3. **Rede bloqueada**
   - Firewall bloqueando conexão ao backend
   - Proxy não configurado

4. **Erro silencioso no script**
   - Sintaxe inválida (PowerShell 5.1 vs 7+)
   - Exceção não tratada antes do heartbeat

### Como investigar?

1. **Verificar logs do monitor**
   ```bash
   # Via Supabase logs
   supabase functions logs monitor-stuck-agents --tail
   ```

2. **Verificar alertas criados**
   ```sql
   SELECT * FROM system_alerts
   WHERE type = 'stuck_agent'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **Diagnosticar agente específico**
   ```sql
   SELECT * FROM public.diagnose_agent_issues('nome-do-agente');
   ```

4. **Limpar e reinstalar**
   ```sql
   -- Via RPC
   SELECT cleanup_problematic_agent('uuid-do-agente');
   ```

## Integração com Dashboard

O dashboard de Admin (`/admin/agent-troubleshooting`) consome os alertas criados por este monitor e exibe:
- Lista de agentes stuck
- Tempo em estado stuck
- Botões de ação (diagnosticar, limpar, regenerar credenciais)

## Configuração

O monitor está configurado em `supabase/config.toml`:

```toml
[functions.monitor-stuck-agents]
verify_jwt = false
schedule = "*/10 * * * *"  # A cada 10 minutos
```

## Testes Manuais

Para testar manualmente o monitor:

```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/monitor-stuck-agents \
  -H "apikey: $SUPABASE_ANON_KEY"
```

## Métricas

O monitor expõe as seguintes métricas via response:
- `stuck_agents`: Número de agentes detectados
- `alerts_created`: Número de alertas criados
- `agents[]`: Lista de agentes afetados com tempo stuck

## Alertas vs. Logs

| Tipo | Destino | Propósito |
|------|---------|-----------|
| **system_alerts** | Dashboard Admin | Notificação visual para operadores |
| **security_logs** | Auditoria | Registro de segurança para análise histórica |

## Próximos Passos

Após a detecção de um agente stuck:
1. ✅ Alerta criado automaticamente
2. 📧 (Futuro) Enviar email para admin do tenant
3. 🔧 (Futuro) Auto-remediation: limpar e notificar

## Referências

- Edge Function: `supabase/functions/monitor-stuck-agents/index.ts`
- Config: `supabase/config.toml`
- Dashboard: `src/pages/admin/AgentTroubleshooting.tsx`
- RPC Diagnóstico: `public.diagnose_agent_issues()`
