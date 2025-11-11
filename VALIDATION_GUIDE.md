# ✅ Guia de Validação Completa - CyberShield

Checklist 100% para validar funcionalidade após correções.

## 📋 Checklist Rápido

- [ ] **Auth:** Signup, login, CAPTCHA, bloqueio IP
- [ ] **Agents:** Instalação Windows/Linux, heartbeats
- [ ] **Metrics:** Coletadas a cada 5min
- [ ] **Jobs:** Criados, entregues, executados
- [ ] **Security:** Rate limits, HMAC, validações
- [ ] **Diagnostics:** Funções SQL operacionais

---

## 1️⃣ Autenticação

### Signup
```sql
-- Validar novo usuário
SELECT 
  u.email,
  p.full_name,
  t.name as tenant,
  ur.role
FROM auth.users u
JOIN profiles p ON p.user_id = u.id
JOIN user_roles ur ON ur.user_id = u.id
JOIN tenants t ON t.id = ur.tenant_id
WHERE u.email = 'pedrohalves42@gmail.com';
```

### Login + CAPTCHA
- [ ] 1 erro: Mensagem
- [ ] 3 erros: CAPTCHA
- [ ] 5 erros: IP bloqueado 30min

```sql
-- Ver bloqueios
SELECT * FROM ip_blocklist WHERE ip_address = 'SEU_IP';

-- Ver tentativas
SELECT * FROM failed_login_attempts 
WHERE email = 'pedrohalves42@gmail.com' 
ORDER BY created_at DESC LIMIT 5;
```

---

## 2️⃣ Agentes

### Gerar Instalador
```sql
-- Verificar key criado
SELECT * FROM enrollment_keys 
ORDER BY created_at DESC LIMIT 1;

-- Verificar agente
SELECT * FROM agents WHERE agent_name = 'TESTE-WIN-01';

-- Verificar token
SELECT * FROM agent_tokens 
WHERE agent_id = (SELECT id FROM agents WHERE agent_name = 'TESTE-WIN-01')
AND is_active = true;
```

### Instalação Windows
```powershell
# Executar comando one-click
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?id=XXX | iex
```

**Validar:**
- [ ] Pasta: `C:\ProgramData\CyberShield\`
- [ ] Credenciais: `credentials.json`
- [ ] Task: `CyberShield-Agent`
- [ ] Heartbeat em 60s

```sql
-- Ver heartbeat
SELECT 
  agent_name,
  status,
  last_heartbeat,
  os_type,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER / 60 AS minutes_ago
FROM agents 
WHERE agent_name = 'TESTE-WIN-01';

-- Health check
SELECT * FROM agents_health_view 
WHERE agent_name = 'TESTE-WIN-01';
```

### Instalação Linux
```bash
curl -fsSL https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?id=XXX | sudo bash

# Verificar serviço
sudo systemctl status cybershield-agent
```

### Métricas (aguardar 5min)
```sql
-- Verificar métricas
SELECT 
  cpu_usage_percent,
  memory_usage_percent,
  disk_usage_percent,
  collected_at
FROM agent_system_metrics
WHERE agent_id = (SELECT id FROM agents WHERE agent_name = 'TESTE-WIN-01')
ORDER BY collected_at DESC LIMIT 5;
```

---

## 3️⃣ Jobs

### Criar Job
```sql
-- Job criado
SELECT * FROM jobs 
WHERE agent_name = 'TESTE-WIN-01' 
ORDER BY created_at DESC LIMIT 1;
```

### Job Entregue (60s)
```sql
-- Status "delivered"
SELECT 
  id, type, status, 
  created_at, delivered_at
FROM jobs 
WHERE agent_name = 'TESTE-WIN-01' 
ORDER BY created_at DESC;
```

### Job Concluído
```sql
-- Status "completed"
SELECT 
  id, type, status, 
  created_at, delivered_at, completed_at
FROM jobs 
WHERE agent_name = 'TESTE-WIN-01' 
ORDER BY created_at DESC;
```

---

## 4️⃣ Segurança

### Rate Limiting
```bash
# Testar heartbeat: 3 req/min
for i in {1..5}; do 
  curl -X POST https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/heartbeat \
    -H "X-Agent-Token: TOKEN";
done
# Espera: 3 OK, 2 Rate Limited (429)
```

```sql
SELECT * FROM rate_limits 
WHERE identifier LIKE '%TESTE-WIN-01%' 
ORDER BY window_start DESC;
```

### HMAC Signature
```bash
# Testar inválido
curl -X POST https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/heartbeat \
  -H "X-Agent-Token: TOKEN" \
  -H "X-HMAC-Signature: invalid"
# Espera: 401 Unauthorized
```

```sql
-- Ver assinaturas usadas
SELECT * FROM hmac_signatures 
WHERE agent_name = 'TESTE-WIN-01' 
ORDER BY used_at DESC LIMIT 10;
```

---

## 5️⃣ Analytics

```sql
-- Installation events
SELECT 
  event_type,
  platform,
  agent_name,
  created_at
FROM installation_analytics
WHERE tenant_id = 'SEU_TENANT_ID'
ORDER BY created_at DESC LIMIT 20;
```

---

## 6️⃣ Stripe

```sql
-- Verificar subscription
SELECT 
  t.name,
  sp.name as plan,
  ts.status,
  ts.device_quantity
FROM tenant_subscriptions ts
JOIN tenants t ON t.id = ts.tenant_id
JOIN subscription_plans sp ON sp.id = ts.plan_id
WHERE t.id = 'SEU_TENANT_ID';

-- Features habilitadas
SELECT feature_key, enabled, quota_limit
FROM tenant_features
WHERE tenant_id = 'SEU_TENANT_ID';
```

---

## 7️⃣ Diagnóstico

### Função `diagnose_agent_issues()`
```sql
-- Agente saudável
SELECT * FROM diagnose_agent_issues('TESTE-WIN-01');
-- Esperado: { "issue_type": "healthy" }
```

### View `agents_health_view`
```sql
SELECT 
  agent_name,
  health_status,
  minutes_since_heartbeat
FROM agents_health_view
WHERE tenant_id = 'SEU_TENANT_ID';
```

---

## 8️⃣ Cleanup

```sql
SELECT cleanup_old_data();
```

Valida remoção de:
- Rate limits >1h
- HMAC signatures >5min
- Failed logins >24h
- Métricas >30d

---

## 🚨 Troubleshooting

Problemas? Consulte:
1. **TROUBLESHOOTING_GUIDE.md** ← Guia completo
2. **Logs:** Edge functions, console
3. **SQL:** `SELECT * FROM diagnose_agent_issues('AGENTE')`

---

**Última atualização:** 2025-11-11  
**Versão:** 2.0
