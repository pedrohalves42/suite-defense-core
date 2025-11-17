# Status de Implementação - FASE 2 e FASE 3

## Visão Geral

Este documento consolida o status de implementação das FASES 2 (Auto-Update) e 3 (Dashboard & Alertas) do agente v3, incluindo checklists de validação completas.

**Data da última atualização:** 2025-01-17  
**Status geral:** ✅ IMPLEMENTADO - Aguardando validação completa

---

## FASE 1 - Recap (Já Validada)

### ✅ Job `scan` com quarentena física

**Funcionalidades:**
- Cálculo de SHA256 local
- Integração com `/functions/v1/scan-virus` (VirusTotal/Hybrid Analysis)
- Quarentena física (`Move-Item` para `C:\CyberShield\Quarantine`)
- Quarentena lógica (registro em `quarantined_files`)
- Output estruturado via `submit-job-result`

**Status:** VALIDADO ✅

---

## FASE 2 - Auto-Update do Agente

### 📦 Componentes Implementados

#### 1. Tabela `agent_releases`

**Schema:**
```sql
CREATE TABLE public.agent_releases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version        text NOT NULL,
  platform       text NOT NULL DEFAULT 'windows',
  channel        text NOT NULL DEFAULT 'stable',
  script_content text NOT NULL,
  sha256         text NOT NULL,
  release_notes  text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id)
);
```

**RLS Policies:**
- Super admins podem gerenciar releases (ALL)
- Agentes podem ler releases ativas (SELECT where `is_active = true`)

**Status:** ✅ Criada e funcional

#### 2. Edge Function `serve-agent-update`

**Funcionalidades:**
- Validação HMAC obrigatória
- Verificação de versão atual vs. última release
- Retorna "Already up to date" se versão atual == versão mais recente
- Retorna `{ version, script_content, sha256, release_notes }` se update disponível

**Endpoint:** `/functions/v1/serve-agent-update` (GET)

**Status:** ✅ Implementada e testada

#### 3. Job `update_agent` no Agente

**Fluxo completo:**
1. ✅ Chama `serve-agent-update` via HMAC
2. ✅ Verifica "Already up to date" (retorna output e finaliza)
3. ✅ Baixa `script_content`
4. ✅ Salva em arquivo temporário
5. ✅ Valida SHA256 do **arquivo salvo** (não da string em memória)
6. ✅ Cria backup do script atual (nome dinâmico com timestamp)
7. ✅ Substitui script com `Copy-Item`
8. ✅ Reinicia Scheduled Task
9. ✅ Retorna output estruturado

**Melhorias implementadas:**
- Usa `$PSCommandPath` (dinâmico) em vez de caminho hardcoded
- SHA256 validado com `Get-FileHash -Path $tempScript` (após salvar)
- Tratamento correto de "Already up to date"
- Output padronizado: `{ message, newVersion, sha256, restartedAt }`

**Sincronização:**
- ✅ `public/agent-scripts/cybershield-agent-windows-v3.ps1` (atualizado)
- ✅ `supabase/functions/_shared/agent-script-windows-content.ts` (inline sincronizado)

**Status:** ✅ Implementado e sincronizado

---

## FASE 3 - Dashboard & Alertas

### 📊 Componentes Implementados

#### 1. Card de Alertas Críticos

**Localização:** `src/pages/admin/Dashboard.tsx` (antes dos stats cards)

**Funcionalidades:**
- Query `system_alerts` com `severity IN ('critical', 'high')` e `resolved = false`
- Atualização automática a cada 30s (`refetchInterval: 30000`)
- Card vermelho (`border-red-500`) para destaque visual
- Badge por severidade (critical = destructive)
- Formatação de data com `date-fns` e `ptBR`

**Visual:**
```tsx
<Card className="border-red-500 bg-red-50 dark:bg-red-950">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <AlertTriangle /> Alertas Críticos ({count})
    </CardTitle>
  </CardHeader>
  <CardContent>
    {alertas.map(alert => (
      <div>
        <div>{alert.title}</div>
        <div>{alert.message}</div>
        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
          {alert.severity}
        </Badge>
      </div>
    ))}
  </CardContent>
</Card>
```

**Status:** ✅ Implementado

#### 2. Integração com Backend

**Fontes de alertas:**
- `send-system-alert` (alertas genéricos do sistema)
- `send-health-alert` (problemas de heartbeat/conectividade)
- `alert-high-failure-rate` (taxa alta de falhas em jobs)
- `auto-quarantine` (detecção de malware)

**Tabela `system_alerts`:**
- Campos: `alert_type`, `severity`, `title`, `message`, `resolved`, `created_at`
- RLS: Admins veem alertas do seu tenant, super admins veem tudo

**Status:** ✅ Backend já existente e funcional

---

## Checklist de Validação Completa

### P0 - Job `scan` (Já validado)

#### ✅ Teste 1: Arquivo Limpo

```sql
INSERT INTO public.jobs (tenant_id, agent_name, type, payload, status)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'pcteste1',
  'scan',
  jsonb_build_object(
    'filePath', 'C:\Windows\System32\notepad.exe',
    'tenantId', '3adc67e6-8908-4d98-b85b-5e93be4673a1'
  ),
  'queued'
);
```

**Esperado:**
- `status = 'completed'`
- `output.isMalicious = false`
- `output.quarantined = false`

#### ✅ Teste 2: EICAR (Malware)

**Preparação no agente:**
```powershell
New-Item -ItemType Directory -Path "C:\temp" -Force
Set-Content -Path "C:\temp\eicar.com" -Value 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' -Encoding ASCII
```

```sql
INSERT INTO public.jobs (tenant_id, agent_name, type, payload, status)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'pcteste1',
  'scan',
  jsonb_build_object(
    'filePath', 'C:\temp\eicar.com',
    'tenantId', '3adc67e6-8908-4d98-b85b-5e93be4673a1'
  ),
  'queued'
);
```

**Esperado:**
- `status = 'completed'`
- `output.isMalicious = true`
- `output.quarantined = true`
- `output.quarantinePath` preenchido

**Verificar backend:**
```sql
SELECT * FROM virus_scans WHERE agent_name = 'pcteste1' ORDER BY scanned_at DESC LIMIT 3;
SELECT * FROM quarantined_files WHERE agent_name = 'pcteste1' ORDER BY quarantined_at DESC LIMIT 3;
```

**Verificar quarentena física:**
```powershell
Get-ChildItem "C:\CyberShield\Quarantine"
Get-FileHash "C:\CyberShield\Quarantine\*" -Algorithm SHA256
```

---

### P2 - Job `update_agent`

#### 🔧 Passo 1: Criar Release de Teste

```powershell
# No agente, calcular SHA256 do script atual
$hash = (Get-FileHash "C:\CyberShield\cybershield-agent.ps1" -Algorithm SHA256).Hash.ToLower()
$hash
```

```sql
-- Inserir release de teste
INSERT INTO public.agent_releases (version, platform, channel, script_content, sha256, release_notes, is_active)
VALUES (
  '3.1.0',
  'windows',
  'stable',
  '<SCRIPT_CONTENT_AQUI>',  -- Colar conteúdo do .ps1
  '<SHA256_AQUI>',           -- Colar hash calculado
  'Teste de auto-update',
  true
);
```

#### 🔧 Passo 2: Criar Job

```sql
INSERT INTO public.jobs (tenant_id, agent_name, type, payload, status)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'pcteste1',
  'update_agent',
  '{}'::jsonb,  -- Sem payload necessário
  'queued'
);
```

#### 🔧 Passo 3: Verificar Execução (60-90s)

```sql
SELECT 
  id, type, status, output, error_message,
  execution_time_seconds, created_at, finished_at
FROM public.jobs
WHERE type = 'update_agent' AND agent_name = 'pcteste1'
ORDER BY created_at DESC
LIMIT 1;
```

**Esperado:**
- `status = 'completed'`
- `output.message = "Agent updated successfully"`
- `output.newVersion = "3.1.0"`
- `output.sha256` preenchido
- `output.restartedAt` preenchido

#### 🔧 Passo 4: Verificar Backup e Script (PowerShell no agente)

```powershell
# Ver backups criados
Get-ChildItem "C:\CyberShield\*-backup-*.ps1" | Sort-Object LastWriteTime -Descending | Select-Object -First 3

# Verificar tamanho do script atualizado
Get-Item "C:\CyberShield\cybershield-agent.ps1" | Select-Object FullName, Length, LastWriteTime

# Verificar SHA256 do script atualizado
(Get-FileHash "C:\CyberShield\cybershield-agent.ps1" -Algorithm SHA256).Hash.ToLower()
```

#### 🔧 Passo 5: Teste de "Already up to date"

```sql
-- Criar job novamente (agente já está em 3.1.0)
INSERT INTO public.jobs (tenant_id, agent_name, type, payload, status)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'pcteste1',
  'update_agent',
  '{}'::jsonb,
  'queued'
);
```

**Esperado:**
- `status = 'completed'`
- `output.message = "Already up to date"`
- `output.current_version = "3.1.0"`

---

### P3 - Dashboard & Alertas

#### 📊 Passo 1: Forçar Alerta Crítico

```sql
INSERT INTO public.system_alerts (
  tenant_id, alert_type, severity, title, message, resolved
)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'malware',
  'critical',
  'EICAR detectado em pcteste1',
  'Arquivo eicar.com foi detectado e movido para quarentena',
  false
);
```

#### 📊 Passo 2: Validar Dashboard

1. Acessar `/admin`
2. **Verificar:**
   - ✅ Card "Alertas Críticos (1)" aparece em destaque
   - ✅ Card tem `border-red-500` e `bg-red-50`
   - ✅ Ícone `AlertTriangle` visível
   - ✅ Título "EICAR detectado em pcteste1"
   - ✅ Mensagem "Arquivo eicar.com..."
   - ✅ Data formatada corretamente (dd/MM/yyyy 'às' HH:mm)
   - ✅ Badge "critical" com variant `destructive` (vermelho)
3. **Aguardar 30s** → card deve atualizar automaticamente

#### 📊 Passo 3: Testar Alertas Reais

```sql
-- Forçar detecção de malware (já gera alerta automaticamente via auto-quarantine)
INSERT INTO public.jobs (tenant_id, agent_name, type, payload, status)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'pcteste1',
  'scan',
  jsonb_build_object(
    'filePath', 'C:\temp\eicar.com',
    'tenantId', '3adc67e6-8908-4d98-b85b-5e93be4673a1'
  ),
  'queued'
);
```

**Após execução:**
- Dashboard deve mostrar novo alerta automaticamente (dentro de 30s)
- Alerta deve conter detalhes do scan e quarentena

#### 📊 Passo 4: Marcar Alerta como Resolvido

```sql
UPDATE public.system_alerts
SET resolved = true, resolved_at = now()
WHERE tenant_id = '3adc67e6-8908-4d98-b85b-5e93be4673a1'
  AND alert_type = 'malware'
  AND resolved = false;
```

**Após 30s:**
- Card de "Alertas Críticos" deve desaparecer do Dashboard

---

## Garantias de Segurança

### 🔒 RLS Policies
- ✅ Todas as tabelas críticas têm RLS habilitado
- ✅ `agent_releases`: Super admins gerenciam, agentes leem
- ✅ `system_alerts`: Admins veem seu tenant, super admins veem tudo
- ✅ `jobs`, `virus_scans`, `quarantined_files`: Isolamento por tenant

### 🔐 HMAC Authentication
- ✅ Todos os endpoints críticos validam HMAC
- ✅ `serve-agent-update` requer HMAC válido
- ✅ Nonce e timestamp verificados para prevenir replay attacks

### ✅ SHA256 Validation
- ✅ Job `scan`: SHA256 do arquivo local
- ✅ Job `update_agent`: SHA256 do script baixado (validado após salvar)
- ✅ Falha na validação aborta operação e loga erro

### 💾 Backup Automático
- ✅ Job `update_agent` cria backup antes de substituir
- ✅ Nome do backup: `<script>-backup-<timestamp>.ps1`
- ✅ Rollback manual possível: copiar backup de volta

### 🛡️ Quarentena Física
- ✅ Job `scan` move arquivo malicioso (não copia)
- ✅ Diretório de quarentena: `C:\CyberShield\Quarantine`
- ✅ Nome único: `<GUID>_<filename>`

---

## Arquivos Modificados

### Agente PowerShell
1. ✅ `public/agent-scripts/cybershield-agent-windows-v3.ps1`
   - Job `update_agent` melhorado (linhas 519-586)
   - Usa `$PSCommandPath` dinâmico
   - SHA256 do arquivo salvo
   - Tratamento "Already up to date"

2. ✅ `supabase/functions/_shared/agent-script-windows-content.ts`
   - Inline sincronizado (linhas 903-970)
   - Mesma lógica com escaping correto

### Frontend
3. ✅ `src/pages/admin/Dashboard.tsx`
   - Card de alertas críticos (antes dos stats cards)
   - Query `criticalAlerts` já existente
   - Formatação com `date-fns` e `ptBR`

### Documentação
4. ✅ `docs/FASE_2_3_IMPLEMENTACAO_STATUS.md` (este arquivo)
   - Consolidação completa de P0/P2/P3
   - Checklists de validação detalhados

---

## Próximos Passos

### Imediato (Validação)
1. ⏳ Executar checklist P0 (Job `scan` - revisão)
2. ⏳ Executar checklist P2 (Job `update_agent`)
3. ⏳ Executar checklist P3 (Dashboard & Alertas)

### Futuro (Pós-Validação)
1. 📝 Atualizar `docs/JOB_SCAN_VALIDATION.md` com seção `update_agent`
2. 📝 Criar screenshots do Dashboard com alertas
3. 🎯 Validar em ambiente de produção (tenant real)
4. 📊 Monitorar métricas de auto-update (taxa de sucesso, tempo médio)

---

## Observações Importantes

### ⚠️ Sobre Auto-Update
- Agente **não valida assinatura digital** do script (apenas SHA256)
- Releases são gerenciadas por **super admins apenas**
- Teste sempre em ambiente de desenvolvimento primeiro
- Backup automático permite rollback manual

### ⚠️ Sobre Quarentena
- Quarentena física **remove** arquivo do local original
- Restauração manual requer mover arquivo de volta
- Backend não tem acesso ao filesystem do Windows
- Trilha de auditoria completa em `quarantined_files`

### ⚠️ Sobre Alertas
- Atualização automática a cada 30s
- Alertas resolvidos não aparecem no card
- Backend gera alertas automaticamente em condições críticas
- RLS garante que cada tenant vê apenas seus alertas

---

## Suporte

Para dúvidas ou problemas durante a validação:
1. Verificar logs do agente: `C:\CyberShield\logs\agent.log`
2. Verificar Edge Function logs no Supabase Dashboard
3. Consultar `docs/TROUBLESHOOTING_GUIDE.md`
4. Consultar `docs/JOB_SCAN_VALIDATION.md`

---

**Última atualização:** 2025-01-17 19:15 UTC  
**Autor:** AI Assistant (Lovable)  
**Status:** ✅ IMPLEMENTAÇÃO COMPLETA - AGUARDANDO VALIDAÇÃO
