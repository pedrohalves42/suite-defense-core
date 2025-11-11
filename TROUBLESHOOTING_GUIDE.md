# 🔧 Guia de Troubleshooting - CyberShield

Este guia completo resolve 100% dos problemas identificados no sistema.

## 📋 Índice
- [Problemas Comuns de Agentes](#problemas-comuns-de-agentes)
- [Erros de Instalação](#erros-de-instalação)
- [Problemas de Autenticação](#problemas-de-autenticação)
- [Ferramentas de Diagnóstico SQL](#ferramentas-de-diagnóstico-sql)
- [FAQ](#faq)

---

## 🤖 Problemas Comuns de Agentes

### ❌ Agente não aparece após instalação

**Sintomas:**
- Instalação concluída mas agente não em `/admin/agent-management`
- Status "pending" sem heartbeat

**Diagnóstico SQL:**
```sql
-- Verificar se agente existe
SELECT * FROM public.agents WHERE agent_name = 'SEU_AGENTE';

-- Diagnosticar problemas automaticamente
SELECT * FROM public.diagnose_agent_issues('SEU_AGENTE');
```

**Soluções:**

1. **Token inválido/expirado:**
   ```sql
   -- Ver tokens do agente
   SELECT * FROM agent_tokens 
   WHERE agent_id = (SELECT id FROM agents WHERE agent_name = 'SEU_AGENTE');
   ```
   - Gere novo instalador em `/admin/agent-installer`
   - Reinstale com credenciais frescas

2. **Firewall bloqueando:**
   ```bash
   # Testar conectividade
   curl -v https://iavbnmduxpxhwubqrzzn.supabase.co
   ```

3. **Agente não rodando:**
   ```powershell
   # Windows
   Get-ScheduledTask -TaskName "CyberShield-Agent"
   ```
   ```bash
   # Linux
   sudo systemctl status cybershield-agent
   ```

---

### ⚠️ Agente offline após funcionar

**Sintomas:**
- Last heartbeat > 5min atrás
- Status mudou para "offline"

**Diagnóstico:**
```sql
SELECT 
  agent_name,
  status,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER / 60 AS minutes_ago,
  os_type,
  os_version
FROM public.agents 
WHERE agent_name = 'SEU_AGENTE';
```

**Soluções:**

1. **Rate limit atingido:**
   ```sql
   SELECT * FROM rate_limits 
   WHERE identifier LIKE '%SEU_AGENTE%' 
   AND blocked_until > NOW();
   ```
   - Aguarde reset (5min)

2. **HMAC inválido:**
   - Reinstale com novo enrollment

3. **Agente parou:**
   ```powershell
   # Windows: Restart task
   Start-ScheduledTask -TaskName "CyberShield-Agent"
   ```

---

### 📊 Métricas não aparecem

**Diagnóstico:**
```sql
-- Ver se métricas estão sendo enviadas
SELECT 
  COUNT(*) as total_metrics,
  MAX(collected_at) as last_metric,
  EXTRACT(EPOCH FROM (NOW() - MAX(collected_at)))::INTEGER / 60 AS minutes_ago
FROM agent_system_metrics 
WHERE agent_id = (SELECT id FROM agents WHERE agent_name = 'SEU_AGENTE');
```

**Soluções:**
1. Script antigo → Reinstale
2. Rate limit → Aguarde 5min
3. Comandos ausentes (Linux) → Instale: `sysstat`, `procps`

---

## 📥 Erros de Instalação

### ❌ "enrollmentKey é obrigatório"

**Causa:** Requisição sem `enrollmentKey` no body

**SQL para verificar:**
```sql
-- Ver últimos erros no log
SELECT * FROM security_logs 
WHERE endpoint = 'enroll-agent' 
AND attack_type = 'invalid_input'
ORDER BY created_at DESC 
LIMIT 5;
```

**Solução:**
- Use SEMPRE o instalador gerado em `/admin/agent-installer`
- Não edite scripts manualmente

---

### ❌ "Invalid agent token"

**Diagnóstico:**
```sql
-- Ver enrollment keys
SELECT 
  key, 
  is_active, 
  expires_at, 
  current_uses, 
  max_uses,
  used_by_agent
FROM enrollment_keys 
WHERE tenant_id = 'SEU_TENANT_ID'
ORDER BY created_at DESC;
```

**Solução:**
1. Gere novo enrollment key
2. Reinstale agente
3. Verifique duplicação de `agent_name`

---

### ❌ "Failed to connect to API"

**Diagnóstico:**
```bash
# Testar conectividade
curl -v https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/heartbeat

# DNS
nslookup iavbnmduxpxhwubqrzzn.supabase.co
```

**Solução:**
1. Firewall: Libere `*.supabase.co:443`
2. Proxy: Configure no script
3. DNS: Use 8.8.8.8

---

## 🔐 Problemas de Autenticação

### 🚫 IP Bloqueado

**Diagnóstico:**
```sql
-- Ver IPs bloqueados
SELECT 
  ip_address,
  reason,
  blocked_until,
  EXTRACT(EPOCH FROM (blocked_until - NOW()))::INTEGER / 60 AS minutes_remaining
FROM ip_blocklist 
WHERE blocked_until > NOW();
```

**Solução (Super Admin):**
```sql
-- Desbloquear IP
DELETE FROM ip_blocklist 
WHERE ip_address = 'SEU_IP';
```

---

### 🔑 CAPTCHA não aparece

**Checklist:**
- [ ] `VITE_TURNSTILE_SITE_KEY` configurado?
- [ ] Console do browser mostra erros JS?
- [ ] Script Cloudflare carregou?

```sql
-- Ver tentativas falhadas
SELECT * FROM failed_login_attempts 
WHERE email = 'seu@email.com' 
ORDER BY created_at DESC;
```

---

## 🛠️ Ferramentas de Diagnóstico SQL

### 1. `diagnose_agent_issues()`

Detecta automaticamente problemas:

```sql
SELECT * FROM diagnose_agent_issues('MEU_AGENTE');
```

**Retorna:**
- `agent_not_found` ❌ Agente não existe
- `no_heartbeat` ❌ Nunca conectou
- `stale_heartbeat` ⚠️ Offline >5min
- `invalid_token` ❌ Token expirado
- `stuck_jobs` ⚠️ Jobs travados
- `no_metrics` ⚠️ Sem métricas
- `healthy` ✅ Tudo OK

---

### 2. `agents_health_view`

Monitoramento em tempo real:

```sql
SELECT 
  agent_name,
  health_status,
  minutes_since_heartbeat,
  pending_jobs,
  completed_jobs,
  os_type
FROM agents_health_view
WHERE tenant_id = 'SEU_TENANT_ID'
ORDER BY health_status DESC;
```

**Status:**
- `online` ✅ Heartbeat <2min
- `warning` ⚠️ Heartbeat 2-5min
- `offline` ❌ Heartbeat >5min
- `never_connected` 🔴 Sem heartbeat

---

### 3. `cleanup_old_data()`

Limpeza de performance:

```sql
SELECT cleanup_old_data();
```

**Remove:**
- Rate limits >1h
- HMAC signatures >5min
- Failed logins >24h
- IP blocklist expirado
- Métricas >30 dias
- Security logs >90 dias

---

## ❓ FAQ

### ⏱️ Quanto tempo até agente aparecer online?

**60 segundos** (primeiro heartbeat)

### 🔄 Posso reinstalar agente com mesmo nome?

**Sim**, mas:
1. Desative agente antigo
2. Gere novo enrollment key
3. Reinstale completamente

### 📊 Quantos agentes posso ter?

- **Free:** 5
- **Starter:** 30
- **Pro:** 200
- **Enterprise:** ♾️

### 🐳 Funciona em Docker?

**Sim**, mas:
- Use bind mount
- Configure restart policy
- Monitore logs do container

### 🔄 Como atualizar script?

1. Gere novo instalador
2. Execute (sobrescreve)
3. Credenciais preservadas

---

## 📞 Suporte

- 📧 **Email:** gamehousetecnologia@gmail.com
- 💬 **WhatsApp:** (34) 98443-2835
- 🎯 **Dashboard:** `/admin/diagnostics`

---

## 📝 Logs Úteis

### Windows
```powershell
# Logs do agente
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Tail 50

# Task info
Get-ScheduledTaskInfo -TaskName "CyberShield-Agent"
```

### Linux
```bash
# Logs systemd
sudo journalctl -u cybershield-agent -n 50 --no-pager

# Status
sudo systemctl status cybershield-agent
```

---

**Última atualização:** 2025-11-11  
**Versão:** 2.0 - Plano Completo de Correção
