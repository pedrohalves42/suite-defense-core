# Instruções para Reinstalar Agente "teste"

## ⚠️ IMPORTANTE
O agente "teste" está rodando uma versão antiga (pré-v3.4.0) que não suporta jobs tipo "report" e não envia métricas automaticamente. Para resolver isso, siga estas etapas:

---

## **FASE 1: Limpar Instalação Antiga**

### No servidor Windows onde está o agente "teste":

```powershell
# 1. Parar e remover Scheduled Tasks
Unregister-ScheduledTask -TaskName "CyberShieldAgent*" -Confirm:$false

# 2. Parar processos em execução
Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -like "*cybershield*"
} | Stop-Process -Force

# 3. Remover pasta completa
Remove-Item C:\CyberShield -Recurse -Force -ErrorAction SilentlyContinue

# 4. Verificar limpeza
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
Test-Path C:\CyberShield
```

**Resultado esperado:**
- ✅ Nenhuma Scheduled Task encontrada
- ✅ Pasta C:\CyberShield não existe

---

## **FASE 2: Gerar Novo Installer v3.5.0-METRICS-AUTO**

### No dashboard CyberShield:

1. Ir para: `/agent-installer`
2. **Nome do Agente:** `teste` (mesmo nome anterior)
3. Clicar em **"Gerar Comando de Instalação"**
4. **Copiar** o comando gerado (algo como `iex (irm https://...`)

**CRÍTICO:** 
- ⚠️ **NÃO reutilizar** comandos antigos
- ⚠️ **Gerar novo** enrollment key automaticamente
- ⚠️ O novo installer será versão `v3.5.0-METRICS-AUTO`

---

## **FASE 3: Executar Novo Installer**

### No servidor Windows (PowerShell como Administrador):

```powershell
# Colar o comando copiado do dashboard
iex (irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/PS1?key=...)
```

**Durante a instalação:**
- ✅ Verifica privilégios de admin
- ✅ Baixa script v3.5.0-METRICS-AUTO
- ✅ Cria Scheduled Task
- ✅ Inicia agente em background
- ✅ Envia heartbeat inicial

---

## **FASE 4: Validar Instalação**

### No dashboard CyberShield:

1. **Aguardar 2-3 minutos** após execução do installer

2. **Ir para:** `/admin/agent-health-monitor`

3. **Verificar:**
   - ✅ Agente "teste" aparece como **"active"** (verde)
   - ✅ **Last Heartbeat:** < 5 minutos
   - ✅ **CPU, RAM, Disco:** valores numéricos (não N/A)
   - ✅ **Gráficos históricos:** começam a aparecer dados após 5 minutos

4. **Ir para:** `/admin/jobs`

5. **Criar job tipo "report":**
   - Agente: `teste`
   - Tipo: `report`
   - Clicar em **"Create Job"**

6. **Aguardar 30-60 segundos**

7. **Verificar:**
   - ✅ Status do job muda para **"completed"** (verde)
   - ✅ **Output:** JSON com métricas de sistema

---

## **Troubleshooting**

### ❌ Agente não aparece como "active"

**Verificar no servidor:**
```powershell
# Verificar Scheduled Task
Get-ScheduledTask -TaskName "CyberShieldAgent*"

# Ver logs do installer
Get-Content C:\CyberShield\logs\installer-*.log -Tail 50

# Ver logs do agente
Get-Content C:\CyberShield\logs\agent-*.log -Tail 50
```

**Ações corretivas:**
1. Verificar se Scheduled Task está em estado "Ready"
2. Executar manualmente: `Start-ScheduledTask -TaskName "CyberShieldAgent-teste"`
3. Se ainda falhar, repetir **FASE 1** (limpeza total)

---

### ❌ Job tipo "report" falha com "nao suportado"

**Causa:** Agente ainda é versão antiga

**Solução:**
1. Verificar versão no log do agente:
   ```powershell
   Select-String "AGENT_VERSION" C:\CyberShield\logs\agent-*.log
   ```
2. Se não for `v3.5.0-METRICS-AUTO`, repetir **FASE 1-3**

---

### ❌ Gráficos históricos vazios

**Causa normal:** Agente recém-instalado ainda não enviou métricas suficientes

**Aguardar:**
- Primeiro envio de métricas: **5 minutos** após instalação
- Gráficos com dados significativos: **30-60 minutos**

**Forçar coleta manual:**
```powershell
# No servidor, executar job report manualmente
# (criar job tipo "report" no dashboard)
```

---

## **Verificação Final de Sucesso**

### ✅ Checklist Completo:

- [ ] Scheduled Task "CyberShieldAgent-teste" existe e está "Ready"
- [ ] Pasta `C:\CyberShield` existe com script e logs
- [ ] Dashboard mostra agente "teste" como "active" (verde)
- [ ] Last Heartbeat < 5 minutos
- [ ] Métricas (CPU/RAM/Disco) com valores numéricos
- [ ] Job tipo "report" completa com sucesso
- [ ] Gráficos históricos começam a mostrar dados após 30min

---

## **Próximos Passos**

Após validar o agente "teste":

1. **Reinstalar outros agentes antigos** seguindo o mesmo procedimento
2. **Usar botão "Limpar Jobs"** no dashboard para remover jobs antigos
3. **Monitorar gráficos** para padrões de uso anormais

---

## **Suporte**

Se problemas persistirem após seguir este guia:

1. Coletar logs completos:
   ```powershell
   Compress-Archive -Path C:\CyberShield\logs -DestinationPath C:\logs-teste.zip
   ```

2. Enviar `logs-teste.zip` junto com:
   - Screenshot do dashboard `/admin/agent-health-monitor`
   - Saída de: `Get-ScheduledTaskInfo -TaskName "CyberShieldAgent-teste"`

---

**Última atualização:** v3.5.0-METRICS-AUTO  
**Status da documentação:** Validado
