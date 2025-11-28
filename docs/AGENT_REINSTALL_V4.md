# 🔄 Reinstalação de Agentes v4.0

Procedimento para reinstalar agentes offline após atualizações críticas v4.0.

## 📋 Status Atual dos Agentes

| Agent Name | Status | Offline | Última Comunicação |
|-----------|--------|---------|-------------------|
| testepc2 | pending | ~31h | 2025-01-25 23:54 |
| TESTEMIT | pending | ~22h | 2025-01-26 08:43 |
| TESTEBMG | pending | ~22h | 2025-01-26 08:43 |
| testepc1 | pending | ~28h | 2025-01-26 03:16 |

**TODOS os agentes estão offline e precisam ser reinstalados manualmente.**

---

## 🎯 Objetivo da Reinstalação

**Versão Alvo:** `v3.10.13-AUTO-UPDATE-SAFE` ou `v4.0.0-FINAL` (quando disponível)

**Correções Incluídas:**
- ✅ Bug de auto-update que causava exit permanente
- ✅ Scan handler com tratamento de diretórios vazios
- ✅ Sincronização completa do parâmetro `$AgentVersion`
- ✅ Tabela `network_anomalies` criada para timeline completo
- ✅ Validação de caminhos para conta SYSTEM

---

## 🔧 Procedimento de Reinstalação

### Fase 1: Limpeza Completa (Obrigatória)

**Em cada máquina que possui agente offline:**

```powershell
# 1. Parar todas as Scheduled Tasks do CyberShield
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" } | Stop-ScheduledTask

# 2. Remover todas as Scheduled Tasks do CyberShield
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" } | Unregister-ScheduledTask -Confirm:$false

# 3. Remover completamente o diretório CyberShield
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue

# 4. Validar que tudo foi removido
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" }
# Deve retornar vazio

Test-Path "C:\CyberShield"
# Deve retornar False
```

**⚠️ IMPORTANTE:** Não pule a Fase 1. Instalações sobre agentes antigos causam conflitos e falhas de sincronização.

---

### Fase 2: Gerar Nova Enrollment Key

**No dashboard CyberShield:**

1. Navegue para **Configurações** → **Enrollment Keys**
2. Clique em **Gerar Nova Chave**
3. Configure:
   - **Descrição:** `Reinstalação v4.0 - [NOME_AGENTE]`
   - **Expira em:** 1 dia
   - **Usos máximos:** 1
4. Clique em **Gerar Chave**
5. Copie a **chave de instalação completa** (será usada na Fase 3)

**⚠️ NÃO reutilize enrollment keys antigas.** Elas podem estar expiradas ou causar conflitos.

---

### Fase 3: Executar Instalação Nova

**Em cada máquina (como Administrador):**

```powershell
# 1. Copiar o comando de instalação completo do dashboard
# Exemplo (SUBSTITUA pelo comando real do dashboard):
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://seu-projeto.supabase.co/functions/v1/serve-installer?key=ENROLLMENT_KEY_AQUI | iex
```

**Validação imediata:**
```powershell
# 2. Verificar que a Scheduled Task foi criada
Get-ScheduledTask -TaskName "CyberShieldAgent-*"

# 3. Verificar que o script está no local correto
Get-ChildItem "C:\CyberShield\*.ps1"

# 4. Verificar que o agente está rodando
Get-Process | Where-Object { $_.ProcessName -eq "powershell" -and $_.CommandLine -like "*cybershield-agent-*.ps1*" }
```

**Status Esperado:**
- ✅ Scheduled Task `CyberShieldAgent-[NOME]` criada e ativa
- ✅ Script `C:\CyberShield\cybershield-agent-[NOME].ps1` presente
- ✅ Processo PowerShell rodando o agente em background
- ✅ Agente aparece **ONLINE** no dashboard em até 2 minutos

---

### Fase 4: Validação Completa

**No dashboard CyberShield (aguarde 2-5 minutos após instalação):**

#### 4.1 Validar Agente Online
- Navegue para **Monitoramento** → **Agentes**
- Localize o agente reinstalado
- Confirme status: **✅ ONLINE** (heartbeat verde)
- Confirme versão: `v3.10.13-AUTO-UPDATE-SAFE` ou superior

#### 4.2 Validar Coleta de Métricas
- Clique no agente → **Métricas**
- Confirme dados recentes (< 5 min):
  - CPU Usage
  - Memory Usage
  - Disk Usage
  - Network Activity

#### 4.3 Validar Coleta de Segurança
- Navegue para **Segurança** → **Software Inventory**
- Confirme software do agente listado
- Navegue para **Segurança** → **Antivirus Status**
- Confirme status do antivirus registrado
- Navegue para **Segurança** → **Web Activity**
- Confirme atividade DNS coletada

#### 4.4 Validar Jobs Completados
- Navegue para **Monitoramento** → **Agent Health**
- Localize o agente
- Confirme **job success rate > 90%** (após alguns minutos)

---

## 📊 Checklist de Validação

Para cada agente reinstalado, confirme:

| Validação | Status | Observações |
|-----------|--------|-------------|
| ✅ Limpeza completa executada | ⬜ | Scheduled Task + diretório removidos |
| ✅ Nova enrollment key gerada | ⬜ | Key única, válida por 1 dia |
| ✅ Comando de instalação executado | ⬜ | Sem erros de TLS/rede |
| ✅ Agente online no dashboard | ⬜ | Status verde, heartbeat < 2 min |
| ✅ Versão correta | ⬜ | v3.10.13+ ou v4.0.0 |
| ✅ Métricas sendo coletadas | ⬜ | CPU/RAM/Disk atualizados |
| ✅ Segurança sendo coletada | ⬜ | Software/AV/Web Activity |
| ✅ Jobs completando com sucesso | ⬜ | Success rate > 90% |

---

## 🚨 Troubleshooting

### Agente não aparece online após instalação

**Diagnóstico:**
```powershell
# Verificar se Scheduled Task está rodando
Get-ScheduledTask -TaskName "CyberShieldAgent-*" | Get-ScheduledTaskInfo

# Verificar logs do agente
Get-Content "C:\CyberShield\cybershield-agent.log" -Tail 50
```

**Soluções comuns:**
- Scheduled Task não iniciou: `Start-ScheduledTask -TaskName "CyberShieldAgent-[NOME]"`
- Firewall bloqueando: Adicionar exceção para PowerShell/CyberShield
- Erro de TLS: Confirme que TLS 1.2 está habilitado no comando de instalação

---

### Erro "Cannot create secure SSL/TLS channel"

**Causa:** TLS 1.2 não habilitado ou proxy corporativo bloqueando

**Solução:**
```powershell
# Habilitar TLS 1.2 permanentemente
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Reexecutar comando de instalação
irm https://seu-projeto.supabase.co/functions/v1/serve-installer?key=KEY_AQUI | iex
```

---

### Erro "Access Denied" ou "Execution Policy Restricted"

**Causa:** Políticas de execução do PowerShell

**Solução (Executar como Administrador):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
# Reexecutar comando de instalação
```

---

### Jobs de segurança falhando com "Path inaccessible"

**Causa:** Agente roda como SYSTEM, não pode acessar caminhos de usuário

**Caminhos válidos para scan:**
- ✅ `C:\Program Files\*`
- ✅ `C:\Windows\System32\*`
- ✅ `C:\Temp\*`
- ❌ `%USERPROFILE%\Downloads` (inacessível para SYSTEM)
- ❌ `C:\Users\[USER]\Desktop` (inacessível para SYSTEM)

**Solução:** Use apenas caminhos absolutos acessíveis à conta SYSTEM.

---

## 📞 Suporte

**Problemas durante reinstalação:**
1. Verifique logs do agente: `C:\CyberShield\cybershield-agent.log`
2. Consulte documentação completa em `docs/AGENT_TROUBLESHOOTING_NINJA.md`
3. Entre em contato com suporte técnico incluindo:
   - Nome do agente
   - Log de instalação (primeiras 50 linhas)
   - Screenshot de erro (se houver)

---

## 🎯 Próximos Passos Após Reinstalação

1. **Aguardar 10 minutos** para primeira coleta completa de dados
2. **Validar dashboard** em todas as páginas:
   - Software Inventory populado
   - Antivirus Status registrado
   - Web Activity com entradas DNS
   - Agent Timeline com eventos recentes
3. **Confirmar job success rate** acima de 90% (aguardar ~1h para amostra estatística)
4. **Marcar agente como "validado"** na planilha de controle

---

## ✅ Conclusão

Após completar este procedimento para **todos os 4 agentes**, você terá:
- ✅ Todos os agentes na versão v3.10.13+ ou v4.0.0
- ✅ Correção do bug de auto-update aplicada
- ✅ Coleta de segurança funcionando corretamente
- ✅ Timeline de eventos completo
- ✅ Job success rate acima de 90%
- ✅ Sistema pronto para **primeira venda (primeira venda)**

**Data deste documento:** 2025-01-27  
**Versão alvo:** v4.0.0-FINAL  
**Status:** PRONTO PARA EXECUÇÃO
