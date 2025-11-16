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

**macOS:**
- ✅ HMAC usando `openssl -mac HMAC -macopt hexkey:`
- ✅ agent_version incluído no heartbeat e post_installation

### ✅ FASE 4: Versioning
- Nova coluna `agents.agent_version`
- Views atualizadas: `v_agent_lifecycle_state`, `v_agent_health_summary`
- Agentes reportam versão "3.0.0"

### ✅ FASE 5: Script de Reinstalação
- Arquivo: `public/scripts/reinstall-cybershield-agent.ps1`
- Endpoint: `/functions/v1/get-reinstall-script`

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

## 📊 Métricas de Sucesso
- Taxa de instalação: >90%
- Agentes em 'active': >95% após 5 min
- Erros 401: <5%
- Stack overflows: 0
