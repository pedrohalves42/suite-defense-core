# ⚡ CHECKLIST RÁPIDO DE VALIDAÇÃO

Use este checklist para validação rápida do sistema CyberShield.

---

## 🚀 INÍCIO RÁPIDO

```powershell
# Execute o script de validação completa
.\scripts\run-complete-validation.ps1
```

---

## ✅ CHECKLIST DE VALIDAÇÃO

### FASE 1: Limpeza ✅
- [x] Agentes órfãos removidos (TESTEMIT, AGENT-01)
- [x] Jobs órfãos deletados
- [x] Função `cleanup_orphaned_agents()` executada
- [x] SQL cleanup confirmado via Supabase

### FASE 2: Teste de Ciclo Completo 🔄
- [ ] Agente criado: `VALIDACAO-COMPLETA-WIN2022`
- [ ] Heartbeat recebido em <60s
- [ ] Métricas inseridas em <5min
- [ ] Job poll-jobs funcional
- [ ] ACK confirmado
- [ ] Scan de vírus executado com sucesso

**Como testar:**
```powershell
cd scripts
.\test-agent-simulation.ps1 -AgentToken "SEU_TOKEN" -HmacSecret "SEU_HMAC"
```

### FASE 3: Build .EXE 🔨
- [ ] Script de build criado (`scripts/build-installer-exe.ps1`)
- [ ] EXE compilado sem erros
- [ ] SHA256 calculado e documentado
- [ ] Assinatura digital (opcional) aplicada
- [ ] Instalador testado em VM limpa

**Como executar:**
```powershell
.\scripts\build-installer-exe.ps1 `
    -AgentToken "TOKEN" `
    -HmacSecret "HMAC" `
    -AgentName "PROD"
```

### FASE 4: Testes E2E 🧪
- [ ] 13/13 testes Playwright passaram
- [ ] Logs verificados sem erros críticos
- [ ] Rate limits não atingidos durante testes
- [ ] Serve-installer valida keys corretamente
- [ ] Heartbeat validation funcional

**Como executar:**
```bash
# Linux/Mac
./run-e2e-tests.sh

# Windows
.\run-e2e-tests.ps1
```

### FASE 5: VM Real 🖥️
- [ ] VM Windows Server 2022 preparada
- [ ] PowerShell 5.1+ confirmado
- [ ] Conectividade HTTPS testada
- [ ] Instalador executado com sucesso
- [ ] Dashboard mostra status "active"
- [ ] Métricas visíveis em <5min
- [ ] Job executado e completado
- [ ] Logs sem erros

**Checklist cronometrado:**
- [ ] T+10s: Script executado sem erros
- [ ] T+60s: Heartbeat no dashboard
- [ ] T+5min: CPU/RAM/Disk visíveis
- [ ] T+8min: Job status = `done`

---

## 🔍 VALIDAÇÕES PÓS-INSTALAÇÃO

### Dashboard (/admin/monitoring-advanced)
- [ ] Status: **active** (verde)
- [ ] OS: Windows Server 2022
- [ ] Hostname: Preenchido
- [ ] CPU Usage: > 0%
- [ ] Memory Usage: > 0%
- [ ] Disk Usage: > 0%
- [ ] Uptime: > 0 segundos
- [ ] Last Heartbeat: < 2 minutos

### Base de Dados
```sql
-- Verificar agente
SELECT agent_name, status, last_heartbeat, os_type 
FROM agents 
WHERE agent_name = 'PROD-WIN2022-FINAL'
ORDER BY enrolled_at DESC;

-- Verificar métricas
SELECT collected_at, cpu_usage_percent, memory_usage_percent 
FROM agent_system_metrics 
WHERE agent_id = (SELECT id FROM agents WHERE agent_name = 'PROD-WIN2022-FINAL')
ORDER BY collected_at DESC 
LIMIT 5;

-- Verificar jobs
SELECT type, status, created_at, completed_at 
FROM jobs 
WHERE agent_name = 'PROD-WIN2022-FINAL'
ORDER BY created_at DESC;
```

### Logs do Agente (VM)
```powershell
# Windows
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Tail 50

# Verificar tarefa agendada
Get-ScheduledTask -TaskName "CyberShield Agent" | Get-ScheduledTaskInfo
```

---

## 🐛 TROUBLESHOOTING

### Agente não aparece no dashboard
1. Verificar logs: `C:\ProgramData\CyberShield\logs\agent.log`
2. Testar conectividade: `Test-NetConnection iavbnmduxpxhwubqrzzn.supabase.co -Port 443`
3. Verificar token: Query `agent_tokens` no Supabase
4. Revisar HMAC secret: Deve estar preenchido em `agents.hmac_secret`

### Heartbeat não registrado
1. Verificar rate limit: Query `rate_limits` table
2. Logs do edge function: `npx supabase functions logs heartbeat`
3. Validar HMAC signature: Revisar cálculo no script do agente
4. Checar firewall: Windows Defender pode estar bloqueando

### Métricas não aparecem
1. Verificar se `submit-system-metrics` foi chamado
2. Logs: `npx supabase functions logs submit-system-metrics`
3. Query: `SELECT * FROM agent_system_metrics WHERE agent_id = '...'`
4. Validar RLS policies na tabela

### Jobs não executam
1. Verificar status: `SELECT * FROM jobs WHERE agent_name = '...'`
2. Confirmar que `poll-jobs` está sendo chamado
3. Logs: `npx supabase functions logs poll-jobs`
4. Validar `ack-job`: Deve mudar status para `done`

---

## 📊 MÉTRICAS DE SUCESSO

| Métrica | Meta | Status |
|---------|------|--------|
| Taxa de sucesso de instalação | > 95% | ⏳ |
| Heartbeat em < 60s | 100% | ⏳ |
| Métricas em < 5min | 100% | ⏳ |
| Jobs executados | > 90% | ⏳ |
| Uptime agentes | > 99% | ⏳ |
| Testes E2E passando | 13/13 | ⏳ |

---

## 🚀 PRÓXIMOS PASSOS

### Segurança
- [ ] Ativar Leaked Password Protection (Supabase Dashboard)
- [ ] Configurar mínimo 8 caracteres + complexidade
- [ ] Revisar RLS policies (executar linter)
- [ ] Testar brute-force protection (3 tentativas → CAPTCHA)

### Produção
- [ ] Assinar EXE com certificado EV
- [ ] Configurar CDN para distribuição de instaladores
- [ ] Implementar monitoramento 24/7
- [ ] Criar playbook de incident response

### Documentação
- [ ] Atualizar FAQ com troubleshooting
- [ ] Gravar vídeo tutorial de instalação
- [ ] Documentar API para integrações
- [ ] Criar guia de onboarding para novos usuários

---

## 📞 SUPORTE

- **Email:** gamehousetecnologia@gmail.com
- **Documentação:** `/docs` no dashboard
- **Logs:** `npx supabase functions logs <function-name>`
- **Status:** Dashboard → `/admin/monitoring-advanced`

---

**Última atualização:** 2025-11-11
**Versão:** 2.2.1
