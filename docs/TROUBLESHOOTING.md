# 🔧 CyberShield - Guia de Troubleshooting

> Guia completo para diagnóstico e resolução de problemas

**Versão:** 1.0.0  
**Última atualização:** 2026-02-08

---

## 📋 Índice

1. [Diagnóstico Rápido](#1-diagnóstico-rápido)
2. [Problemas de Instalação](#2-problemas-de-instalação)
3. [Problemas de Autenticação](#3-problemas-de-autenticação)
4. [Problemas com Agentes](#4-problemas-com-agentes)
5. [Problemas com Jobs](#5-problemas-com-jobs)
6. [Problemas de API](#6-problemas-de-api)
7. [Problemas de Performance](#7-problemas-de-performance)
8. [Problemas de Rede](#8-problemas-de-rede)
9. [Edge Functions](#9-edge-functions)
10. [Queries de Diagnóstico](#10-queries-de-diagnóstico)
11. [Contato com Suporte](#11-contato-com-suporte)

---

## 1. Diagnóstico Rápido

### Checklist de Primeiro Nível

```bash
□ O site está acessível? (https://cybershield-audit.lovable.app)
□ O usuário consegue fazer login?
□ Os agentes aparecem no dashboard?
□ Os jobs estão sendo executados?
□ As notificações estão chegando?
```

### Comandos de Verificação

```bash
# Verificar status do sistema
npm run validate:system

# Verificar saúde do banco
# Executar no Cloud > Database > SQL Editor:
SELECT * FROM check_system_health();

# Verificar logs de Edge Functions
# Lovable Cloud > Edge Functions > [Função] > Logs
```

### Status de Serviços

| Serviço | URL de Verificação |
|---------|-------------------|
| Dashboard | https://cybershield-audit.lovable.app |
| API | https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/health |
| Auth | https://iavbnmduxpxhwubqrzzn.supabase.co/auth/v1/health |

---

## 2. Problemas de Instalação

### ❌ "npm install" falha com erros de dependências

**Sintoma:**
```
npm ERR! peer dep missing: react@^18.0.0
```

**Solução:**
```bash
# 1. Limpar cache
rm -rf node_modules
rm package-lock.json

# 2. Limpar cache do npm
npm cache clean --force

# 3. Reinstalar
npm install
```

---

### ❌ "Node version incompatible"

**Sintoma:**
```
error engine: unsupported Node.js version
```

**Solução:**
```bash
# Usando nvm
nvm install 20
nvm use 20

# Verificar
node --version  # Deve ser >= 18.0.0
```

---

### ❌ Erro de permissão no Windows

**Sintoma:**
```
EPERM: operation not permitted
```

**Solução:**
```powershell
# 1. Executar PowerShell como Administrador
# 2. Navegar até pasta do projeto
# 3. Limpar e reinstalar

Remove-Item -Recurse -Force node_modules
npm install
```

---

### ❌ Porta 8080 já em uso

**Sintoma:**
```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solução:**
```bash
# Linux/macOS
lsof -i :8080
kill -9 <PID>

# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F

# Ou usar outra porta
npm run dev -- --port 3000
```

---

## 3. Problemas de Autenticação

### ❌ "Invalid login credentials"

**Causas possíveis:**
1. Email/senha incorretos
2. Conta não confirmada
3. Conta desativada

**Diagnóstico:**
```sql
-- Verificar status do usuário
SELECT id, email, email_confirmed_at, banned_until
FROM auth.users
WHERE email = 'usuario@email.com';
```

**Soluções:**
1. Verificar se email está correto
2. Reenviar email de confirmação
3. Verificar se `banned_until` é null

---

### ❌ "Email not confirmed"

**Sintoma:** Usuário não consegue logar após cadastro

**Solução (Desenvolvimento):**
```sql
-- Confirmar email manualmente (APENAS PARA DEV/TESTE)
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email = 'usuario@email.com';
```

**Solução (Produção):**
1. Verificar logs de envio de email
2. Verificar pasta de spam
3. Reenviar email de confirmação

---

### ❌ "Session expired" frequente

**Sintoma:** Usuário é deslogado constantemente

**Causas:**
1. Timeout de sessão muito curto
2. Problema de sincronização de relógio
3. Token JWT expirado

**Diagnóstico:**
```sql
-- Verificar sessões ativas
SELECT * FROM active_sessions 
WHERE user_id = 'user-uuid'
ORDER BY last_activity_at DESC;
```

**Solução:**
1. Verificar horário do servidor/cliente
2. Limpar localStorage/cookies
3. Fazer novo login

---

### ❌ "User not found after login"

**Sintoma:** Login bem-sucedido mas sem perfil

**Causa:** Trigger de criação de perfil falhou

**Solução:**
```sql
-- Criar perfil manualmente
INSERT INTO profiles (id, user_id, full_name)
VALUES (gen_random_uuid(), 'user-auth-uuid', 'Nome do Usuário')
ON CONFLICT DO NOTHING;
```

---

## 4. Problemas com Agentes

### ❌ Agente não aparece no Dashboard

**Checklist:**
1. Enrollment Key válida?
2. Agente consegue acessar a internet?
3. Firewall bloqueando?

**Diagnóstico:**
```sql
-- Verificar enrollment attempts
SELECT * FROM agent_evidence_logs
WHERE event_type LIKE 'enroll%'
ORDER BY created_at DESC
LIMIT 20;

-- Verificar enrollment keys
SELECT id, key_prefix, is_active, expires_at, current_uses, max_uses
FROM enrollment_keys
WHERE key_prefix = 'ABC123';  -- Primeiros 6 caracteres da key
```

---

### ❌ Agente "offline" no Dashboard

**Sintoma:** Agente mostra status offline mesmo funcionando

**Diagnóstico:**
```sql
-- Verificar último heartbeat
SELECT id, name, status, last_heartbeat, 
       NOW() - last_heartbeat as time_since_heartbeat
FROM agents
WHERE name = 'nome-do-agente';
```

**Causas e Soluções:**

| Causa | Solução |
|-------|---------|
| Heartbeat não chegando | Verificar conectividade de rede |
| Firewall bloqueando | Liberar `*.supabase.co:443` |
| Agente crashado | Verificar logs locais do agente |
| Serviço parado | Reiniciar serviço CyberShield |

**Reiniciar Agente:**
```bash
# Windows (como Admin)
Restart-Service CyberShieldAgent

# Linux/macOS
sudo systemctl restart cybershield-agent
```

---

### ❌ Agente em "safe mode"

**Sintoma:** Agente parou de executar jobs

**Causa:** Múltiplas falhas consecutivas (proteção automática)

**Diagnóstico:**
```sql
-- Verificar eventos de safe mode
SELECT * FROM agent_safe_mode_events
WHERE agent_id = 'agent-uuid'
ORDER BY entered_at DESC
LIMIT 5;
```

**Solução:**
1. Verificar logs de falha no Dashboard
2. Corrigir causa raiz (ex: permissão, disco cheio)
3. Aprovar recuperação no Dashboard ou via:

```sql
-- Resolver safe mode
UPDATE agent_safe_mode_events
SET resolved_at = NOW(), resolved_by = 'admin-user-id'
WHERE agent_id = 'agent-uuid' AND resolved_at IS NULL;
```

---

### ❌ Muitos agentes "stuck" em instalação

**Diagnóstico:**
```sql
-- Verificar agentes stuck
SELECT * FROM v_problematic_agents
WHERE status = 'installing'
AND created_at < NOW() - INTERVAL '30 minutes';
```

**Solução:**
```sql
-- Cleanup de agentes stuck
SELECT cleanup_problematic_agent('agent-uuid', 'Stuck na instalação por mais de 30min');
```

---

## 5. Problemas com Jobs

### ❌ Jobs não estão sendo criados

**Diagnóstico:**
```sql
-- Verificar jobs recentes
SELECT job_type, status, COUNT(*)
FROM jobs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY job_type, status;
```

**Causas possíveis:**
1. Agente não está polling
2. Rate limit atingido
3. Feature desabilitada para tenant

---

### ❌ Jobs stuck em "delivered"

**Sintoma:** Jobs foram entregues mas não completados

**Diagnóstico:**
```sql
-- Jobs stuck
SELECT id, job_type, agent_id, delivered_at,
       NOW() - delivered_at as time_stuck
FROM jobs
WHERE status = 'delivered'
AND delivered_at < NOW() - INTERVAL '1 hour'
ORDER BY delivered_at;
```

**Solução:**
```sql
-- Requeue jobs stuck
UPDATE jobs
SET status = 'queued', delivered_at = NULL, delivery_attempts = delivery_attempts + 1
WHERE status = 'delivered'
AND delivered_at < NOW() - INTERVAL '1 hour';
```

---

### ❌ Jobs falhando consistentemente

**Diagnóstico:**
```sql
-- Top erros de jobs
SELECT job_type, error_message, COUNT(*) as count
FROM jobs
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY job_type, error_message
ORDER BY count DESC
LIMIT 10;
```

**Ações por tipo de erro:**

| Erro | Ação |
|------|------|
| `HMAC validation failed` | Verificar sincronização de chaves |
| `Timeout exceeded` | Aumentar timeout ou otimizar job |
| `Access denied` | Verificar permissões do agente |
| `File not found` | Verificar path no payload |

---

## 6. Problemas de API

### ❌ 401 Unauthorized

**Causas:**
1. API Key ausente
2. API Key inválida
3. API Key expirada

**Verificação:**
```bash
# Testar API Key
curl -v -X GET \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/api-tenant-info \
  -H "Authorization: Bearer sk_your_key"
```

**Diagnóstico:**
```sql
-- Verificar status da API Key
SELECT id, name, is_active, expires_at, last_used_at
FROM api_keys
WHERE key_hash = 'hash-da-chave';  -- Hash SHA256
```

---

### ❌ 429 Too Many Requests

**Sintoma:** Rate limit excedido

**Diagnóstico:**
```sql
-- Verificar rate limits
SELECT * FROM rate_limits
WHERE identifier = 'api-key-id'
ORDER BY window_start DESC
LIMIT 5;
```

**Solução:**
1. Aguardar período de cooldown (5 min padrão)
2. Implementar caching no cliente
3. Reduzir frequência de requisições

---

### ❌ 500 Internal Server Error

**Diagnóstico:**
1. Verificar logs da Edge Function no Lovable Cloud
2. Buscar erros no período:

```sql
-- Erros de API recentes
SELECT * FROM api_request_logs
WHERE status_code >= 500
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## 7. Problemas de Performance

### ❌ Dashboard lento

**Diagnóstico:**
```sql
-- Queries lentas (se disponível)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- > 1 segundo
ORDER BY total_exec_time DESC
LIMIT 10;
```

**Ações:**
1. Verificar índices nas tabelas mais usadas
2. Limpar dados antigos (audit_logs, metrics)
3. Verificar tamanho do banco

---

### ❌ Edge Functions lentas

**Diagnóstico via logs:**
```
Lovable Cloud > Edge Functions > [função] > Logs
```

**Métricas a observar:**
- Execution time > 10s
- Memory usage alto
- Conexões DB abertas

**Solução:**
1. Otimizar queries dentro da função
2. Adicionar `.limit()` em SELECTs
3. Usar índices apropriados

---

## 8. Problemas de Rede

### ❌ Agente não conecta

**Teste de conectividade:**
```bash
# Windows
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443

# Linux/macOS
nc -zv iavbnmduxpxhwubqrzzn.supabase.co 443
curl -I https://iavbnmduxpxhwubqrzzn.supabase.co
```

**Verificar DNS:**
```bash
nslookup iavbnmduxpxhwubqrzzn.supabase.co
```

---

### ❌ CORS Error no navegador

**Sintoma:**
```
Access to fetch at '...' has been blocked by CORS policy
```

**Verificar:**
1. Edge Function tem headers CORS corretos?
2. Método OPTIONS está respondendo?

**Teste:**
```bash
curl -X OPTIONS \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/api-tenant-info \
  -H "Origin: https://cybershield-audit.lovable.app" \
  -v
```

---

## 9. Edge Functions

### ❌ Function não deploya

**Verificar:**
1. Sintaxe TypeScript válida
2. Imports corretos (usar `https://esm.sh/`)
3. Arquivo `index.ts` presente

**Exemplo de import correto:**
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
```

---

### ❌ "Deno error" nos logs

**Erros comuns:**

| Erro | Solução |
|------|---------|
| `Module not found` | Verificar URL do import |
| `Permission denied` | Verificar se secret existe |
| `TypeError` | Verificar tipos TypeScript |

---

### ❌ Secret não disponível

**Verificar:**
```typescript
// Na Edge Function
const apiKey = Deno.env.get('MY_SECRET');
if (!apiKey) {
  console.error('MY_SECRET not configured');
  throw new Error('Configuration error');
}
```

**Solução:**
1. Verificar se secret foi adicionado no Lovable Cloud
2. Redeploy da função após adicionar secret

---

## 10. Queries de Diagnóstico

### Saúde Geral do Sistema

```sql
-- Dashboard de saúde
SELECT 
  (SELECT COUNT(*) FROM agents WHERE status = 'active') as active_agents,
  (SELECT COUNT(*) FROM agents WHERE last_heartbeat < NOW() - INTERVAL '5 minutes') as offline_agents,
  (SELECT COUNT(*) FROM jobs WHERE status = 'queued') as pending_jobs,
  (SELECT COUNT(*) FROM jobs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as failed_jobs_24h,
  (SELECT COUNT(*) FROM quarantined_files WHERE status = 'quarantined') as quarantined_files;
```

### Agentes Problemáticos

```sql
-- Agentes com problemas
SELECT * FROM v_problematic_agents
ORDER BY issue_severity DESC, last_heartbeat DESC
LIMIT 20;
```

### Jobs com Problemas

```sql
-- Jobs falhados agrupados por tipo e erro
SELECT 
  job_type,
  LEFT(error_message, 100) as error_preview,
  COUNT(*) as occurrences,
  MAX(created_at) as last_occurrence
FROM jobs
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY job_type, LEFT(error_message, 100)
ORDER BY occurrences DESC
LIMIT 20;
```

### Audit Trail

```sql
-- Eventos de segurança recentes
SELECT event_type, user_id, ip_address, details, created_at
FROM audit_logs
WHERE event_type IN ('login_failed', 'permission_denied', 'suspicious_activity')
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;
```

### Métricas de API

```sql
-- Performance de API
SELECT 
  endpoint,
  COUNT(*) as total_requests,
  AVG(response_time_ms) as avg_response_time,
  MAX(response_time_ms) as max_response_time,
  COUNT(*) FILTER (WHERE status_code >= 400) as errors
FROM api_request_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY endpoint
ORDER BY total_requests DESC;
```

---

## 11. Contato com Suporte

### Informações a Fornecer

Ao contatar suporte, inclua:

1. **Identificação:**
   - Tenant ID / Nome da organização
   - Email do usuário afetado
   - Nome/ID do agente (se aplicável)

2. **Descrição do Problema:**
   - O que estava tentando fazer?
   - O que aconteceu vs. o que esperava?
   - Quando começou o problema?

3. **Evidências:**
   - Screenshots de erros
   - Logs relevantes (ofuscar dados sensíveis)
   - Console do navegador (F12 > Console)
   - Network requests (F12 > Network)

4. **Ambiente:**
   - Browser e versão
   - Sistema operacional
   - Versão do agente

### Canais de Suporte

| Canal | SLA | Uso |
|-------|-----|-----|
| Email `suporte@cybershield.com` | 24h | Issues não-críticas |
| Chat no Dashboard | 4h (horário comercial) | Dúvidas gerais |
| Telefone de Emergência | 1h | Incidentes P0/P1 |

### Níveis de Severidade

| Nível | Descrição | Exemplo |
|-------|-----------|---------|
| **P0 - Crítico** | Sistema indisponível | Dashboard não carrega |
| **P1 - Alto** | Funcionalidade crítica impactada | Agentes não reportam |
| **P2 - Médio** | Funcionalidade degradada | Relatórios lentos |
| **P3 - Baixo** | Issue cosmética | Typo na interface |

---

## Changelog

### v1.0.0 (2026-02-08)
- Documentação inicial de troubleshooting
- Queries de diagnóstico SQL
- Guia de contato com suporte
