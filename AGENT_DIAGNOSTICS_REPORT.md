# 🔍 RELATÓRIO DE DIAGNÓSTICO - Agentes Desconectados

**Data:** 2025-11-11  
**Agentes Analisados:** TESTEMIT, AGENT-01

---

## 📊 RESUMO EXECUTIVO

| Agente | Status | Heartbeat | Enrollment | Tokens Ativos | Métricas |
|--------|--------|-----------|------------|---------------|----------|
| **TESTEMIT** | ⚠️ pending | ❌ Nunca | ❌ Não rastreado | ✅ 1 ativo | ❌ 0 |
| **AGENT-01** | ⚠️ pending | ❌ Nunca | ❌ Não rastreado | ✅ 1 ativo | ❌ 0 |

---

## 🔴 PROBLEMAS IDENTIFICADOS

### 1. Agentes Nunca Conectaram
```
Status: pending
Last Heartbeat: NULL
OS Type: unknown
OS Version: NULL
Hostname: NULL
```

**Diagnóstico:** Agentes criados no banco mas **nunca executaram** o instalador.

---

### 2. Enrollment Keys Não Rastreadas
```sql
SELECT * FROM enrollment_keys WHERE used_by_agent IN ('TESTEMIT', 'AGENT-01');
-- Resultado: 0 registros
```

**Diagnóstico:** O campo `used_by_agent` não foi preenchido, indicando que:
- Agentes foram criados manualmente (não via `auto-generate-enrollment`)
- OU trigger `update_enrollment_key_usage()` não foi executado

---

### 3. Sem Installation Analytics
```sql
SELECT * FROM installation_analytics WHERE agent_name IN ('TESTEMIT', 'AGENT-01');
-- Resultado: 0 registros
```

**Diagnóstico:** Nenhum evento de instalação rastreado:
- ❌ `generated` (instalador gerado)
- ❌ `downloaded` (instalador baixado)
- ❌ `command_copied` (comando copiado)
- ❌ `installed` (agente instalado)
- ❌ `failed` (instalação falhou)

---

### 4. Tokens Válidos Mas Nunca Usados

| Agente | Token ID | Status | Criado | Usado | Expira |
|--------|----------|--------|--------|-------|--------|
| TESTEMIT | `562e6bc1-...` | ✅ ACTIVE | 2025-11-11 01:28 | ❌ NULL | 2026-11-11 |
| AGENT-01 | `3a60649a-...` | ✅ ACTIVE | 2025-11-11 03:59 | ❌ NULL | 2026-11-11 |
| AGENT-01 | `c1ec9aa8-...` | ⚠️ INACTIVE | 2025-11-11 01:41 | ❌ NULL | 2026-11-11 |

**Diagnóstico:** Tokens estão válidos mas `last_used_at = NULL`, confirmando que nunca houve tentativa de heartbeat.

---

### 5. Sem Métricas de Sistema
```sql
SELECT COUNT(*) FROM agent_system_metrics WHERE agent_id IN (...);
-- Resultado: 0 métricas
```

**Diagnóstico:** Agentes nunca enviaram métricas de CPU, RAM, Disk, etc.

---

## 🎯 CAUSA RAIZ

**Estes agentes foram criados diretamente no banco de dados (provavelmente via API ou teste manual), mas NUNCA tiveram o instalador executado em uma máquina real.**

Cenário provável:
1. Enrollment key gerada manualmente
2. Registro criado na tabela `agents`
3. Token criado na tabela `agent_tokens`
4. **MAS:** Nenhum script PowerShell/Bash foi executado
5. **RESULTADO:** Agentes órfãos no banco

---

## ✅ AÇÕES CORRETIVAS

### Opção 1: Limpar Agentes Órfãos (RECOMENDADO)
```sql
-- Remover agentes que nunca conectaram após 48h
DELETE FROM agents
WHERE agent_name IN ('TESTEMIT', 'AGENT-01')
  AND status = 'pending'
  AND last_heartbeat IS NULL
  AND enrolled_at < NOW() - INTERVAL '48 hours';
```

### Opção 2: Testar Instalação Real
1. Acesse: `/admin/agent-installer`
2. Gere novo instalador: `TESTEMIT-REINSTALL`
3. Execute em VM Windows Server 2022
4. Aguarde 60s para heartbeat
5. Confirme status: `active`

### Opção 3: Forçar Heartbeat Manual (DEBUG)
```powershell
# Em VM Windows com PowerShell
$token = "21a9a591-f587-438a-a34a-2642b0d56068"  # Token do TESTEMIT
$url = "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/heartbeat"

$body = @{
    os_type = "windows"
    os_version = "Windows Server 2022"
    hostname = "TEST-VM"
} | ConvertTo-Json

Invoke-RestMethod -Uri $url -Method POST `
    -Headers @{
        "X-Agent-Token" = $token
        "Content-Type" = "application/json"
    } `
    -Body $body
```

---

## 📝 RECOMENDAÇÕES

1. **Implementar Cleanup Automático:** 
   - Agendar job para remover agentes `pending` sem heartbeat após 48h

2. **Melhorar Tracking:**
   - Garantir que `installation_analytics` seja sempre preenchido
   - Criar alertas para agentes que não conectam em 5min após enrollment

3. **Validar Trigger:**
   - Confirmar que `update_enrollment_key_usage()` está funcionando
   - Testar com novo enrollment via `/admin/agent-installer`

4. **Monitoramento Proativo:**
   - Dashboard mostrando agentes `pending` > 1h
   - Alerta automático para super admin

---

## 🧪 VALIDAÇÃO VIA TESTES E2E

Execute os testes automatizados para validar o fluxo completo:

```bash
# Teste de download de instaladores
npx playwright test e2e/installer-download.spec.ts

# Teste de fluxo completo (signup → install → heartbeat → jobs)
npx playwright test e2e/complete-agent-flow.spec.ts

# Teste de validação de heartbeat
npx playwright test e2e/heartbeat-validation.spec.ts
```

**Meta:** 100% dos testes devem passar (13/13).

---

## 📞 CONTATO

Para mais informações: pedrohalves42@gmail.com
