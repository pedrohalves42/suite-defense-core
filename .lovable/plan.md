
# Plano: Completar Sistema de Resiliência Total - Webhooks e Self-Test

## Resumo Executivo

O agente v4.5.0 já possui as funcionalidades P0 de resiliência (Network Watchdog, Task Health Assert, Power Event Detection). Este plano completa a implementação adicionando os itens que faltam para fechar o ciclo de resiliência total.

---

## Estado Atual

### Já Implementado no Agente v4.5.0
- Network Watchdog com `Test-NetworkConnectivity` e `Invoke-NetworkWatchdog`
- Task Health Assert com `Assert-TaskHealth`
- Power Event Detection com `Register-PowerEventWatcher`
- TLS 1.2 forçado para compatibilidade com Windows Server 2012/2016

### Já Implementado no Backend
- UI de configuração de webhooks em `Settings.tsx`
- Edge Function `test-webhook` para testar conectividade
- Campos `alert_webhook_url` e `enable_webhook_alerts` em `tenant_settings`
- Monitor de saúde de agentes com alertas por email

---

## O Que Falta Implementar

### 1. Webhook Alerts no Monitor de Saúde
O `monitor-agent-health` atualmente só envia alertas por email. Precisa também enviar para webhooks configurados (Slack, Teams, etc).

### 2. Endpoint Heartbeat Self-Test
O agente precisa de um endpoint para verificar se o backend realmente recebeu seus heartbeats. Isso permite detectar falhas de comunicação silenciosas.

### 3. Sincronizar Script v4.5.0
Garantir que o script em `supabase/functions/_shared/agent-scripts/` está sincronizado com a versão em `public/agent-scripts/`.

### 4. Registrar v4.5.0 no Banco
Atualizar a tabela `agent_versions` para que o sistema de auto-update reconheça a v4.5.0 como versão mais recente.

---

## Implementação Detalhada

### Tarefa 1: Adicionar Webhooks ao monitor-agent-health

Modificar `supabase/functions/monitor-agent-health/index.ts` para:
1. Verificar se tenant tem `enable_webhook_alerts = true`
2. Enviar POST para `alert_webhook_url` com payload formatado
3. Suportar formatos Slack e Teams (detectar pelo URL)

```typescript
// Função para enviar webhook
async function sendWebhookAlert(webhookUrl: string, agent: any, alertType: 'offline' | 'online') {
  const isSlack = webhookUrl.includes('hooks.slack.com');
  const isTeams = webhookUrl.includes('webhook.office.com');
  
  const payload = isSlack ? {
    text: `Agent ${agent.agent_name} is ${alertType}`,
    blocks: [/* Slack blocks */]
  } : isTeams ? {
    "@type": "MessageCard",
    // Teams format
  } : {
    // Generic JSON
    agent_name: agent.agent_name,
    status: alertType,
    timestamp: new Date().toISOString()
  };
  
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
```

### Tarefa 2: Criar Edge Function heartbeat-self-test

Nova edge function em `supabase/functions/heartbeat-self-test/index.ts`:
- Aceita GET com header `X-Agent-Token`
- Retorna `last_heartbeat` do agente
- Agente compara com hora local para detectar desync

```typescript
// GET /heartbeat-self-test
// Headers: X-Agent-Token
// Response: { agent_id, agent_name, last_heartbeat, server_time }
```

### Tarefa 3: Sincronizar Script v4.5.0

Copiar conteúdo de `public/agent-scripts/cybershield-agent-windows-v4.ps1` para:
- `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v4.ps1`

### Tarefa 4: Registrar v4.5.0 no Banco

Executar SQL para registrar nova versão:
```sql
INSERT INTO agent_versions (platform, version, is_latest, release_notes)
VALUES ('windows', 'v4.5.0', true, 'Total Resilience: Network Watchdog, Task Health Assert, Power Event Detection');

UPDATE agent_versions SET is_latest = false WHERE platform = 'windows' AND version != 'v4.5.0';
```

---

## Arquivos a Modificar/Criar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/monitor-agent-health/index.ts` | Modificar - Adicionar webhook alerts |
| `supabase/functions/heartbeat-self-test/index.ts` | Criar - Novo endpoint de self-test |
| `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v4.ps1` | Sincronizar com public |
| Migração SQL | Registrar v4.5.0 |

---

## Validação Pós-Implementação

1. **Testar Webhook**: Configurar URL de webhook no Settings e disparar alerta de teste
2. **Verificar Self-Test**: Agente v4.5.0 deve logar resultado do self-test a cada 10 heartbeats
3. **Verificar Auto-Update**: Agentes antigos devem receber oferta de update para v4.5.0

---

## Benefícios

- **Notificações em tempo real** via Slack/Teams quando agente fica offline
- **Detecção proativa de falhas** via heartbeat self-test
- **Rollout automático** da v4.5.0 para toda a frota

---

## Seção Técnica

### Fluxo de Webhook Alert
```text
Monitor Cron (cada 5min)
    │
    ├─► Detecta agente offline > 10min
    │       │
    │       ├─► Verifica enable_webhook_alerts
    │       │       │
    │       │       └─► POST para alert_webhook_url
    │       │               │
    │       │               ├─► Slack (hooks.slack.com)
    │       │               ├─► Teams (webhook.office.com)
    │       │               └─► Generic JSON
    │       │
    │       └─► Verifica enable_email_alerts
    │               │
    │               └─► Invoke send-alert-email
    │
    └─► Detecta agente online novamente
            │
            └─► Webhook "agent_online" (opcional)
```

### Fluxo de Heartbeat Self-Test
```text
Agente v4.5.0
    │
    ├─► Heartbeat counter++
    │
    ├─► (counter % 10 == 0)?
    │       │
    │       └─► GET /heartbeat-self-test
    │               │
    │               ├─► Response: { last_heartbeat: "2025-02-01T14:30:00Z" }
    │               │
    │               └─► Compara: (now - last_heartbeat) > 5min?
    │                       │
    │                       ├─► SIM: Log ERROR, força reconnect
    │                       │
    │                       └─► NÃO: Log DEBUG "Self-test OK"
```
