# 🧪 Testing Installation Health - Guia Completo

## 📋 Visão Geral

Este guia documenta como validar que o sistema de instalação está funcionando corretamente, com foco especial em **macOS** e nos novos event types `post_installation` / `post_installation_unverified`.

---

## 🎯 Objetivos dos Testes

1. ✅ Validar que `track-installation-event` aceita novos event types e platforms
2. ✅ Confirmar que agentes Windows/macOS enviam `post_installation` corretamente
3. ✅ Verificar que agentes progridem de `installing` → `active` no lifecycle
4. ✅ Monitorar taxa de sucesso de instalação por OS
5. ✅ Identificar gargalos e problemas rapidamente

---

## 🛠️ Ferramentas de Teste

### 1. Script Bash de Testes Automatizados

**Arquivo:** `tools/test-track-installation-event.sh`

**O que testa:**
- ✅ macOS + post_installation (aceito)
- ✅ Windows + post_installation (aceito)
- ✅ Linux + post_installation (aceito)
- ✅ post_installation_unverified (aceito)
- ❌ Event types inválidos (rejeitado)
- ❌ Platforms inválidos (rejeitado)

**Como rodar:**
```bash
# 1. Configurar variáveis de ambiente
export SUPABASE_URL="https://iavbnmduxpxhwubqrzzn.supabase.co"
export ACCESS_TOKEN="eyJhbG..."  # JWT de usuário autenticado

# 2. Executar testes
chmod +x tools/test-track-installation-event.sh
./tools/test-track-installation-event.sh
```

**Resultado esperado:**
```
🎉 TODOS OS TESTES PASSARAM!
✅ track-installation-event aceita post_installation + macos
✅ Validação de schema funciona corretamente
```

**Se falhar:**
```bash
# Ver logs da edge function
supabase functions logs track-installation-event --limit 50

# Testar manualmente
curl -v -X POST "$SUPABASE_URL/functions/v1/track-installation-event" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "test-macos",
    "event_type": "post_installation",
    "platform": "macos",
    "success": true
  }'
```

---

### 2. Smoke Tests SQL

**Arquivos:** `tools/sql/smoke-test-*.sql`

#### 2.1 smoke-test-lifecycle.sql
Mostra distribuição de agentes por OS e lifecycle stage.

```bash
psql "$DATABASE_URL" < tools/sql/smoke-test-lifecycle.sql
```

**Output esperado:**
```
 os_type | lifecycle_stage | count | pct_within_os
---------|-----------------|-------|---------------
 macos   | active          |    10 | 100.0
 windows | active          |    23 |  92.0
 windows | installing      |     2 |   8.0
```

**Interpretação:**
- ✅ macOS 100% active → Sistema OK
- ⚠️ Windows 8% installing → Investigar se agentes estão travados

#### 2.2 smoke-test-installation-health.sql
Analisa taxa de sucesso de instalação.

```bash
psql "$DATABASE_URL" < tools/sql/smoke-test-installation-health.sql
```

**Output esperado:**
```
 platform | total_events | successful | failed | success_rate_pct | status
----------|--------------|-----------|--------|-----------------|----------
 macos    |           10 |        10 |      0 |           100.0 | 🟢 HEALTHY
 windows  |           25 |        23 |      2 |            92.0 | 🟡 WARNING
```

**Interpretação:**
- 🟢 success_rate >= 95% → Healthy
- 🟡 success_rate >= 80% → Warning (investigar causas)
- 🔴 success_rate < 80% → Critical (parar deploys!)

---

### 3. Dashboard Visual

**Componente:** `InstallationHealthCard`

**Onde ver:** 
- Login como admin
- Navegar para `/admin/agent-health`
- Card "Installation Health" no topo da página

**Features:**
- 📊 Taxa de sucesso por OS (macOS, Windows, Linux)
- 🎨 Badges coloridos (Healthy/Warning/Critical)
- 🔄 Auto-refresh a cada 60 segundos
- 🍎 macOS destacado com border verde

**Como interpretar:**

| Badge | Cor | Significado |
|-------|-----|-------------|
| 🟢 Healthy | Verde | success_rate >= 95% |
| 🟡 Warning | Amarelo | success_rate >= 80% |
| 🔴 Critical | Vermelho | success_rate < 80% |

---

## 🧪 Testes E2E (End-to-End)

### Teste 1: Windows Installation

1. **Gerar installer:**
   - Dashboard → Agent Installer → Windows
   - Copiar comando PowerShell

2. **Executar em VM Windows:**
   ```powershell
   iex "curl -sL https://xxx.supabase.co/functions/v1/serve-installer/yyy | powershell -"
   ```

3. **Verificar logs do agente:**
   ```powershell
   Get-Content "C:\CyberShield\logs\agent.log" -Tail 50 | Select-String "post_installation"
   ```
   **Esperado:**
   - `📤 Enviando evento de post-installation (success=True)...`
   - `✅ Evento post-installation enviado (Status: 200)`

4. **Validar no banco:**
   ```sql
   SELECT agent_name, event_type, platform, success, metadata
   FROM installation_analytics
   WHERE agent_name = 'test-windows-01'
     AND event_type = 'post_installation'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   **Esperado:**
   - `platform = 'windows'`
   - `success = true`
   - `metadata` com `powershell_version`, `os_version`

5. **Verificar lifecycle:**
   ```sql
   SELECT agent_name, lifecycle_stage, last_heartbeat_at, agent_version
   FROM v_agent_lifecycle_state
   WHERE agent_name = 'test-windows-01';
   ```
   **Esperado:**
   - `lifecycle_stage = 'active'` (se heartbeat < 5 min)
   - `agent_version = '3.0.0'`

---

### Teste 2: macOS Installation

1. **Gerar installer:**
   ```bash
   curl -sL "https://xxx.supabase.co/functions/v1/serve-installer/yyy?os_type=macos" -o install.sh
   chmod +x install.sh
   ```

2. **Executar como root:**
   ```bash
   sudo ./install.sh
   ```

3. **Verificar LaunchDaemon:**
   ```bash
   sudo launchctl list | grep cybershield
   # Esperado: com.cybershield.agent com PID ativo
   ```

4. **Verificar logs:**
   ```bash
   sudo tail -f /Library/Logs/CyberShield/agent.log | grep "post_installation"
   ```
   **Esperado:**
   - `Sending post_installation event...`
   - `✅ Post-installation event registered successfully`

5. **Validar no banco (mesmas queries do Windows)**
   - `platform = 'macos'`
   - `metadata` com `os_version`, `hardware_model`, `cpu_count`

---

## 📊 Métricas de Sucesso

### Critérios Globais

| Métrica | Target | Query SQL |
|---------|--------|-----------|
| Taxa de instalação bem-sucedida | >95% | Ver `smoke-test-installation-health.sql` Query 1 |
| Agentes em `active` após instalação | >90% | Ver `smoke-test-lifecycle.sql` Query 4 |
| Tempo médio para atingir `active` | <2 min | Ver `smoke-test-installation-health.sql` Query 2 |
| Agentes travados em `installing` | <5% | Ver `smoke-test-lifecycle.sql` Query 3 |

### Critérios por OS

| OS | Target Success Rate | Observação |
|----|---------------------|------------|
| macOS | >98% | Deve ser a mais estável |
| Windows | >90% | Pode ter mais variações por configurações de rede/firewall |
| Linux | >95% | Instalações geralmente são ambientes controlados (servidores) |

---

## 🔧 Troubleshooting

### Problema 1: Script de testes falha com "422 Unprocessable Entity"

**Causa:** Schema do Zod não aceita o event_type ou platform.

**Solução:**
1. Verificar `supabase/functions/track-installation-event/index.ts`
2. Confirmar que enum inclui:
   ```typescript
   event_type: z.enum([
     'generated',
     'downloaded',
     'command_copied',
     'installed',
     'failed',
     'post_installation',            // ✅
     'post_installation_unverified', // ✅
   ]),
   platform: z.enum([
     'windows',
     'linux',
     'macos',  // ✅
   ]),
   ```
3. Se faltando, adicionar e fazer redeploy da function

---

### Problema 2: Agente Windows não envia post_installation

**Causa:** Função `Send-PostInstallationEvent` não está sendo chamada no bootstrap.

**Solução:**
1. Verificar `supabase/functions/_shared/agent-script-windows-content.ts`
2. Confirmar que após `Send-Heartbeat` tem:
   ```powershell
   Send-PostInstallationEvent -InstallationMethod "one_click"
   ```
3. Regenerar installer e reinstalar agente

---

### Problema 3: Agente macOS fica em "installing" > 10 minutos

**Possíveis causas:**
- LaunchDaemon não iniciou (verificar com `launchctl list`)
- Erro de permissões (verificar logs em `/Library/Logs/CyberShield/`)
- HMAC_SECRET inválido (verificar heartbeat nos logs)
- Network connectivity (testar `curl https://xxx.supabase.co/functions/v1/heartbeat`)

**Queries de diagnóstico:**
```sql
-- Ver último erro conhecido
SELECT agent_name, lifecycle_stage, enrolled_at, last_heartbeat_at
FROM v_agent_lifecycle_state
WHERE agent_name = 'problematic-macos-agent';

-- Ver se tem eventos de instalação
SELECT * FROM installation_analytics
WHERE agent_name = 'problematic-macos-agent'
ORDER BY created_at DESC;

-- Usar ferramenta de diagnóstico
SELECT * FROM diagnose_agent_issues('problematic-macos-agent');
```

---

### Problema 4: Dashboard mostra "Erro ao carregar métricas"

**Causa:** RPC function `installation_health_summary()` não existe ou sem permissões.

**Solução:**
1. Verificar se migration foi aplicada:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'installation_health_summary';
   -- Deve retornar 1 linha
   ```
2. Se não existe, aplicar migration:
   ```bash
   # Ver último arquivo de migration em supabase/migrations/
   # Executar via SQL Editor ou CLI
   ```
3. Verificar permissões:
   ```sql
   GRANT EXECUTE ON FUNCTION installation_health_summary() TO authenticated;
   ```

---

## 📈 Monitoramento Contínuo

### Queries Úteis para Produção

#### 1. Agentes instalados hoje
```sql
SELECT 
  platform,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE lifecycle_stage = 'active') as active,
  ROUND(100.0 * COUNT(*) FILTER (WHERE lifecycle_stage = 'active') / COUNT(*), 1) as pct_active
FROM v_agent_lifecycle_state
WHERE DATE(enrolled_at) = CURRENT_DATE
GROUP BY platform;
```

#### 2. Últimas falhas de instalação
```sql
SELECT 
  agent_name, 
  platform, 
  error_message, 
  created_at
FROM installation_analytics
WHERE success = false
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

#### 3. Tempo médio de instalação (últimas 24h)
```sql
SELECT 
  platform,
  COUNT(*) as samples,
  ROUND(AVG(installation_time_seconds), 1) as avg_seconds
FROM installation_analytics
WHERE installation_time_seconds IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY platform;
```

---

## 🚨 Alertas e Thresholds

### Configurar alertas se:

| Condição | Threshold | Ação |
|----------|-----------|------|
| success_rate < 80% | Critical | 🔴 Parar novos deploys, investigar imediatamente |
| success_rate < 90% | Warning | 🟡 Monitorar, investigar se persistir > 1h |
| Agentes stuck > 5% | Warning | 🟡 Rodar `diagnose_agent_issues()` |
| Falhas HMAC > 10/h | Warning | 🟡 Verificar enrollment_keys válidos |
| avg_install_time > 120s | Info | ℹ️ Performance de rede/servidor degradada |

---

## 📚 Referências

- [AGENT_V3_UPGRADE_GUIDE.md](./AGENT_V3_UPGRADE_GUIDE.md) - Mudanças do v3.0.0
- [tools/README.md](../tools/README.md) - Guia de ferramentas de teste
- [VALIDATION_GUIDE.md](../VALIDATION_GUIDE.md) - Validação manual completa
- [CYBERSHIELD_SECURITY_AUDIT_2025.md](./CYBERSHIELD_SECURITY_AUDIT_2025.md) - Auditoria de segurança

---

## ✅ Checklist de Validação Completa

- [ ] Script bash `test-track-installation-event.sh` passa (100%)
- [ ] Smoke test SQL retorna dados esperados
- [ ] Dashboard card "Installation Health" carrega corretamente
- [ ] Teste E2E Windows: agente envia post_installation
- [ ] Teste E2E macOS: agente envia post_installation
- [ ] Taxa de sucesso global >= 95%
- [ ] Nenhum agente stuck em installing > 30 min
- [ ] Tempo médio de instalação < 2 minutos
- [ ] RPC function `installation_health_summary()` funciona
- [ ] Auto-refresh do card funciona (60s)
