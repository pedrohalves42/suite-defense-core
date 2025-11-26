# Instrucoes para Fase 6 e 7 - v3.10.7-FINAL-FIX

## Fase 6: Sincronizar e Validar

### 6.1 - Sincronizar script embarcado

Execute o comando:

```bash
npm run sync:agent
```

Ou alternativamente:

```bash
node scripts/sync-agent-now.js
```

Este comando vai:
- Ler `public/agent-scripts/cybershield-agent-windows-v3.ps1`
- Aplicar escapamento correto para TypeScript template literals
- Gerar `supabase/functions/_shared/agent-script-windows-content.ts`
- Validar se versao v3.10.7-FINAL-FIX esta presente
- Validar se TLS 1.2 e Proxy fixes estao presentes

### 6.2 - Validar ASCII

Execute o comando:

```bash
npm run ascii:check
```

Este comando vai garantir que nao ha caracteres nao-ASCII no script (acentos, emojis, etc).

### 6.3 - Verificar arquivo gerado

Confirme:
- Arquivo `supabase/functions/_shared/agent-script-windows-content.ts` foi gerado
- Sem conflitos de merge (<<<<<<, >>>>>>)
- Versao correta no arquivo embarcado (v3.10.7-FINAL-FIX)
- INSTALLER_VERSION em `installer-version.ts` = v3.10.7-FINAL-FIX
- CURRENT_VERSION em `AgentReleases.tsx` = v3.10.7-FINAL-FIX

### 6.4 - Deploy automatico

As Edge Functions serao redeployadas automaticamente quando voce fizer commit/push das alteracoes.

Aguarde o deploy completar antes de testar na VM.

---

## Fase 7: Testar na VM testepc2

### 7.1 - Cleanup completo na VM

Abra PowerShell como Administrador na VM testepc2 e execute:

```powershell
# Remover Scheduled Tasks
Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

# Matar processos PowerShell do agente
Stop-Process -Name "powershell" -Force -ErrorAction SilentlyContinue

# Remover pasta completa
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue

# Verificar limpeza
Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue
Test-Path "C:\CyberShield"
```

Resultado esperado:
- Nenhuma Scheduled Task encontrada
- Pasta C:\CyberShield nao existe (False)

### 7.2 - Gerar nova enrollment key e comando

No dashboard:
1. Va para "Agent Installer" (/admin/agent-installer)
2. Digite nome do agente: `testepc2`
3. Clique em "Gerar Chave" e copie o comando gerado
4. IMPORTANTE: Use o comando FRESCO do dashboard (nao reutilize comandos antigos)

### 7.3 - Instalar e validar

#### A) Instalar o agente

Execute o comando de instalacao copiado do dashboard no PowerShell como Administrador.

Verifique logs de instalacao:
```powershell
Get-Content "C:\CyberShield\logs\installer.log" -Tail 50
```

#### B) Validar agente online

Aguarde 1-2 minutos e verifique no dashboard:
- Agente aparece na lista de agentes
- Status: "Online" ou "Active"
- Ultima comunicacao: menos de 2 minutos
- Versao do agente: v3.10.7-FINAL-FIX

#### C) Validar Job de Scan

No dashboard, criar job de scan:
1. Va para "Job Creator" ou "Security Dashboard"
2. Selecione agente `testepc2`
3. Tipo de job: `scan`
4. Payload: `{"filePath": "C:\\Windows\\notepad.exe", "tenantId": "seu-tenant-id"}`
5. Executar job

Verifique resultado:
- Job deve completar com status "completed"
- Output deve conter: filePath, fileHash, isMalicious, positives, totalScans
- Nao deve ter erro: "A propriedade 'error' nao foi encontrada neste objeto"

#### D) Validar Job de Update Agent

Criar job de update_agent:
1. No dashboard, criar job tipo `update_agent`
2. Selecionar agente `testepc2`
3. Payload vazio: `{}`
4. Executar job

Verifique resultado:
- Job deve completar com status "completed"
- Output deve conter: message, newVersion ou "Already up to date"
- Nao deve ter erro: "Nao e possivel localizar um parametro que coincida com o nome de parametro 'Uri'"

#### E) Validar Jobs de Seguranca

Criar jobs de seguranca (um de cada vez):
1. `software_inventory_collect` - deve retornar lista de software instalado
2. `light_vuln_scan` - deve retornar vulnerabilidades detectadas
3. `collect_antivirus_status` - deve retornar status do antivirus
4. `collect_web_activity` - deve retornar atividade web do DNS cache

Verifique para cada job:
- Status "completed"
- Output com dados reais (nao vazio)
- Nao deve ter "stuck jobs" (jobs em "delivered" por mais de 5 minutos)

#### F) Validar Metricas

Aguarde 5 minutos e verifique no dashboard:
- CPU: valor percentual (ex: 15.2%)
- RAM: valor percentual (ex: 42.8%)
- Disco: valor percentual (ex: 67.3%)

Metricas nao devem aparecer como "N/A" (exceto se agente nao rodou por 5 minutos ainda).

### 7.4 - Validacao Final

Checklist de validacao:

- [ ] Agente aparece online no dashboard
- [ ] Job de `scan` completa sem erro de propriedade
- [ ] Job de `update_agent` completa sem erro de parametro
- [ ] Jobs de seguranca retornam output com dados
- [ ] Metricas aparecem apos 5 minutos (CPU, RAM, Disco)
- [ ] Zero "stuck jobs" no dashboard
- [ ] Logs do agente nao contem erros HMAC ou 401

Se TODAS as validacoes passarem:
- ✅ **v3.10.7-FINAL-FIX VALIDADA E PRONTA PARA PRODUCAO**
- ✅ **Sistema pronto para primeira venda**

Se alguma validacao falhar:
- Capture logs do agente: `Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 100`
- Capture logs do instalador: `Get-Content "C:\CyberShield\logs\installer.log" -Tail 100`
- Verifique dashboard para jobs travados
- Relate erro especifico para debug

---

## Resultado Esperado Final

| Componente | Status Antes | Status Depois |
|------------|--------------|---------------|
| scan job | Erro: "propriedade nao encontrada" | ✅ Completa com output de scan |
| update_agent job | Erro: "parametro Uri nao existe" | ✅ Completa com sucesso |
| security jobs | Output vazio | ✅ Output com dados reais |
| Metricas | N/A ou inconsistente | ✅ CPU/RAM/Disco preenchidos |
| Dashboard | Stuck jobs | ✅ Jobs completados |
| Producao | Bloqueado | ✅ PRONTO PARA PRIMEIRA VENDA |
