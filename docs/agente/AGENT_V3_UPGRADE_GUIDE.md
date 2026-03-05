# CyberShield Agent v3.0.0 - Upgrade Guide

## 🎯 Mudanças Críticas

### ✅ FASE 1: HMAC Backend (HEX Encoding)
- Backend agora usa HEX em vez de UTF-8 para HMAC
- Compatível com PowerShell e Bash
- Fallback para UTF-8 (retrocompatibilidade)

### ✅ FASE 2-3: Agent Fixes
**Windows:**
- ✅ Body handling corrigido (string vazia em vez de "{}")
- ✅ Stop em 401/403 (sem loop infinito)
- ✅ Removido Enter-DegradedMode e Test-AgentHealthCheck
- ✅ HMAC usando HEX via Convert-HexToBytes
- ✅ Send-PostInstallationEvent adicionado (envia após primeiro heartbeat)
- ✅ Validação de HMAC_SECRET (formato HEX, 64 chars)

**macOS:**
- ✅ HMAC usando `openssl -mac HMAC -macopt hexkey:`
- ✅ agent_version incluído no heartbeat e post_installation
- ✅ send_post_installation_event adicionado

**Linux:**
- ✅ Suporte para post_installation

### ✅ FASE 4: Versioning
- Nova coluna `agents.agent_version`
- Views atualizadas: `v_agent_lifecycle_state`, `v_agent_health_summary`
- Agentes reportam versão "3.0.0"

### ✅ FASE 5: Script de Reinstalação
- Arquivo: `public/scripts/reinstall-cybershield-agent.ps1`
- Endpoint: `/functions/v1/get-reinstall-script`

### ✅ FASE 6: Installation Health Monitoring
- **track-installation-event** agora aceita:
  - event_type: `post_installation`, `post_installation_unverified`
  - platform: `macos`, `windows`, `linux`
- Nova RPC function: `installation_health_summary()`
- Dashboard card `InstallationHealthCard` mostra métricas em tempo real
- Ferramentas de teste e diagnóstico em `tools/`

### ✅ FASE 6: Installation Health Monitoring
- **track-installation-event** agora aceita:
  - event_type: `post_installation`, `post_installation_unverified`
  - platform: `macos`, `windows`, `linux`
- Nova RPC function: `installation_health_summary()`
- Dashboard card `InstallationHealthCard` mostra métricas em tempo real
- Ferramentas de teste e diagnóstico em `tools/`

## 🚀 Como Testar

### Windows:
```powershell
# 1. Reinstalar agente problemático
.\reinstall-cybershield-agent.ps1 -EnrollmentKey "xxx" -ServerUrl "https://xxx.supabase.co"

# 2. Verificar logs
Get-Content C:\CyberShield\logs\agent.log -Tail 50

# Esperado: 
# - ✅ Heartbeat OK
# - ✅ post_installation registrado
# - SEM erros 401
```

### macOS:
```bash
# 1. Baixar e instalar
curl -sL "https://xxx.supabase.co/functions/v1/serve-installer/yyy?os_type=macos" -o install.sh
sudo bash install.sh

# 2. Verificar
sudo launchctl list | grep cybershield
sudo tail -f /Library/Logs/CyberShield/agent.log
```

### Banco:
```sql
-- Verificar versão
SELECT agent_name, agent_version, lifecycle_stage, health_status
FROM v_agent_health_summary
ORDER BY last_heartbeat DESC;

-- Encontrar desatualizados
SELECT agent_name, agent_version, outdated
FROM v_agent_health_summary  
WHERE outdated = true;
```

---

## 📊 Validação de Instalação

### 1. Testes Automatizados de Schema

**Script:** `tools/test-track-installation-event.sh`

```bash
export SUPABASE_URL="https://iavbnmduxpxhwubqrzzn.supabase.co"
export ACCESS_TOKEN="your_jwt_token"
./tools/test-track-installation-event.sh
```

**Resultado esperado:**
```
🎉 TODOS OS TESTES PASSARAM!
✅ track-installation-event aceita post_installation + macos
```

### 2. Smoke Tests SQL

**Verificar lifecycle por OS:**
```bash
psql "$DATABASE_URL" < tools/sql/smoke-test-lifecycle.sql
```

**Output esperado:**
```
 os_type | lifecycle_stage | count | pct_within_os
---------|-----------------|-------|---------------
 macos   | active          |    10 | 100.0
 windows | active          |    23 |  92.0
```

**Verificar taxa de sucesso:**
```bash
psql "$DATABASE_URL" < tools/sql/smoke-test-installation-health.sql
```

**Output esperado:**
```
 platform | success_rate_pct | status
----------|-----------------|----------
 macos    |           100.0 | 🟢 HEALTHY
 windows  |            92.0 | 🟡 WARNING
```

### 3. Dashboard Visual

1. Login como admin
2. Navegar para `/admin/agent-health`
3. Verificar card **Installation Health** no topo
4. Confirmar:
   - 🟢 macOS destacado (border verde)
   - 📊 Taxa de sucesso por OS
   - 🔄 Auto-refresh a cada 60s

---

## 📈 Métricas de Sucesso

| Métrica | Target | Como Verificar |
|---------|--------|----------------|
| Taxa de instalação bem-sucedida | >95% | Dashboard card ou SQL |
| Agentes em `active` após instalação | >90% | `smoke-test-lifecycle.sql` |
| Tempo médio para atingir `active` | <2 min | `smoke-test-installation-health.sql` Query 2 |
| Erros 401 (HMAC) | <1% | Logs do backend |
| Agentes travados em `installing` | <5% | `smoke-test-lifecycle.sql` Query 3 |

---

## 🔧 Troubleshooting

### Problema: Agent não envia post_installation

**Windows:**
1. Verificar se função `Send-PostInstallationEvent` existe no script
2. Confirmar que é chamada após `Send-Heartbeat` no bootstrap
3. Regenerar installer

**macOS:**
1. Verificar logs: `sudo tail -f /Library/Logs/CyberShield/agent.log`
2. Procurar por "Sending post_installation event"
3. Se ausente, reinstalar com novo script

**SQL para debug:**
```sql
-- Ver se agente enviou evento
SELECT * FROM installation_analytics
WHERE agent_name = 'problematic-agent'
ORDER BY created_at DESC;

-- Diagnosticar problemas
SELECT * FROM diagnose_agent_issues('problematic-agent');
```

### Problema: Dashboard card não carrega

**Causa:** RPC function `installation_health_summary()` não existe.

**Solução:**
```sql
-- Verificar se existe
SELECT proname FROM pg_proc WHERE proname = 'installation_health_summary';

-- Se não existir, rodar migration do arquivo:
-- supabase/migrations/[timestamp]_create_installation_health_summary.sql
```

### Problema: Taxa de sucesso < 80%

**Ações:**
1. 🔴 Parar novos deploys imediatamente
2. Rodar `tools/sql/smoke-test-installation-health.sql` Query 3 (Top 5 erros)
3. Verificar erros comuns:
   - HMAC verification failed → Verificar enrollment_keys válidos
   - Network timeout → Verificar firewall/DNS
   - Permission denied → Verificar UAC/sudo
4. Corrigir causa raiz antes de liberar novos agentes

---

## 📚 Documentação Adicional

- [TESTING_INSTALLATION_HEALTH.md](./TESTING_INSTALLATION_HEALTH.md) - Guia completo de validação
- [tools/README.md](../tools/README.md) - Ferramentas de teste
- [CYBERSHIELD_SECURITY_AUDIT_2025.md](./CYBERSHIELD_SECURITY_AUDIT_2025.md) - Auditoria de segurança

---

## ✅ Checklist de Upgrade

### Pré-deployment
- [ ] Migration de `installation_health_summary()` aplicada
- [ ] Script de testes bash funciona (100%)
- [ ] Dashboard card carrega corretamente
- [ ] Smoke tests SQL retornam dados válidos

### Pós-deployment
- [ ] Teste E2E Windows: agente envia post_installation
- [ ] Teste E2E macOS: agente envia post_installation
- [ ] Taxa de sucesso global >= 95%
- [ ] Nenhum agente stuck em installing > 30 min
- [ ] Tempo médio de instalação < 2 minutos

### Monitoramento Contínuo
- [ ] Dashboard card atualiza a cada 60s
- [ ] Alertas configurados para success_rate < 90%
- [ ] Queries de diagnóstico documentadas
- [ ] Runbook de troubleshooting atualizado
