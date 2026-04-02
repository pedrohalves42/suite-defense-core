# Runbook: Operações do Honeypot

## Ativação Manual de Honeypot (Flipping)

### Pré-requisitos
- Role: admin ou security
- Step-up auth (MFA recente)
- Motivo com mínimo 5 caracteres
- Cooldown de 24h desde última mudança de estado

### Procedimento
1. Identificar o agente comprometido na Central de Computadores
2. Chamar `activate-agent-honeypot` com `agent_id` e `reason`
3. O agente continuará autenticando normalmente
4. Todas as requisições serão desviadas para respostas fake
5. Nenhum job real será executado
6. Monitorar interações no HoneypotDashboard

### Verificação
- Confirmar no `audit_logs` que a ação foi registrada
- Confirmar que `agents.honeypot_mode = 'flipped'`
- Monitorar `honeypot_interactions` para atividade do agente

---

## Reversão de Honeypot

### Pré-requisitos
- Mesmos requisitos de ativação
- Cooldown de 24h

### Procedimento
1. Chamar `revert-agent-honeypot` com `agent_id` e `reason`
2. O sistema irá:
   - Reverter `honeypot_mode` para `'none'`
   - Invalidar TODOS os tokens ativos
   - Gerar um novo token
3. **IMPORTANTE**: O novo token deve ser redistribuído ao agente real
4. O agente só voltará a operar normalmente após receber o novo token

### Verificação
- Confirmar `honeypot_mode = 'none'`
- Confirmar token antigo inativo
- Confirmar novo token ativo
- Aguardar heartbeat com novo token

---

## Kill Switch

### Desativar Globalmente (sem deploy)
```sql
-- Inserir flag global desabilitada
INSERT INTO feature_flags (key, enabled, tenant_id)
VALUES ('HONEYPOT_ENABLED', false, NULL)
ON CONFLICT (key, tenant_id) DO UPDATE SET enabled = false;
```

### Reativar
```sql
UPDATE feature_flags SET enabled = true
WHERE key = 'HONEYPOT_ENABLED' AND tenant_id IS NULL;
```

### Desativar por Tenant
```sql
INSERT INTO feature_flags (key, enabled, tenant_id)
VALUES ('HONEYPOT_ENABLED', false, '<tenant_id>')
ON CONFLICT (key, tenant_id) DO UPDATE SET enabled = false;
```

---

## Alertas

| Tipo | Severidade | Ação |
|------|-----------|------|
| `honeypot_multi_target` | high | Investigar varredura de rede |
| `honeypot_malicious_payload` | critical | Coletar artefatos, escalar |
| `honeypot_volume_anomaly` | medium | Verificar rate limit, ajustar |

### Dedupe
- Alertas são deduplicados em janelas de 10 minutos
- Máximo 10 alertas por execução do cron
- Se houver supressão, verificar manualmente

---

## Limpeza e Retenção

- `honeypot_interactions`: limpeza automática > 30 dias (cron diário)
- `honeypot_rate_buckets`: limpeza > 24h
- `honeypot_blocks`: limpeza > 24h
- `honeypot_hourly_stats`: reter 90 dias

---

## Falso Positivo

### Identificação
- Agente legítimo flipado por engano
- Interação classificada como maliciosa sendo benigna

### Procedimento
1. Reverter imediatamente (ver seção Reversão)
2. Redistribuir token
3. Registrar incidente no `audit_logs`
4. Revisar critérios de classificação
5. Atualizar padrões de regex se necessário
