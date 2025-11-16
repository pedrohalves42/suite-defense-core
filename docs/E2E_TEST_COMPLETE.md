# 🔬 Teste E2E Completo - CyberShield Agent v3

## ✅ Objetivo
Validar o ciclo completo de um job desde criação até resultado final, com agente real instalado.

---

## 📋 Pré-requisitos

- [ ] Máquina de teste disponível (Windows, Linux ou macOS)
- [ ] Acesso SSH/RDP à máquina
- [ ] Acesso ao dashboard do CyberShield
- [ ] Acesso ao banco de dados (queries SQL)
- [ ] PowerShell 5.1+ (Windows) ou Bash (Linux/macOS)

---

## 🚀 Fase 1: Instalação do Agente (10 min)

### 1.1 - Gerar Enrollment Key via Dashboard

1. Acesse o dashboard: https://seu-dominio.com/admin/enrollment-keys
2. Clique em **"Generate Enrollment Key"**
3. Configure:
   - **Description**: `Teste E2E P0 Validation`
   - **Expires in**: 1 hour
   - **Max uses**: 1
4. Clique em **"Generate"**
5. **IMPORTANTE**: Anote o enrollment key gerado

### 1.2 - Baixar Installer Script

Clique no botão **"Download Installer"** correspondente ao OS da máquina de teste:
- Windows → `install-windows.ps1`
- Linux → `install-linux.sh`
- macOS → `install-macos.sh`

### 1.3 - Executar Installer na Máquina de Teste

**Windows (PowerShell como Admin):**
```powershell
# 1. Fazer download do script
Invoke-WebRequest -Uri "URL_DO_INSTALLER" -OutFile "install-windows.ps1"

# 2. Executar
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install-windows.ps1
```

**Linux:**
```bash
# 1. Download
curl -o install-linux.sh "URL_DO_INSTALLER"

# 2. Permissão
chmod +x install-linux.sh

# 3. Executar
sudo ./install-linux.sh
```

**macOS:**
```bash
# 1. Download
curl -o install-macos.sh "URL_DO_INSTALLER"

# 2. Permissão
chmod +x install-macos.sh

# 3. Executar
sudo ./install-macos.sh
```

### 1.4 - Validar Instalação

**Verificar processo rodando:**

Windows:
```powershell
Get-Process | Where-Object { $_.Name -like "*cybershield*" }
```

Linux/macOS:
```bash
ps aux | grep cybershield
```

**Verificar logs:**

Windows:
```powershell
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 20
```

Linux:
```bash
sudo tail -20 /var/log/cybershield/agent.log
```

macOS:
```bash
sudo tail -20 /var/log/cybershield/agent.log
```

**Buscar no log:**
- ✅ `[INFO] Instalação concluída com sucesso`
- ✅ `[INFO] Agente iniciado: agent-XXXXX`
- ✅ `[INFO] Heartbeat enviado: 200 OK`

---

## 📊 Fase 2: Validar Heartbeat no Banco (5 min)

### 2.1 - Identificar o Agente Instalado

Execute no banco de dados:

```sql
SELECT 
  id,
  agent_name,
  tenant_id,
  status,
  os_type,
  os_version,
  hostname,
  enrolled_at,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER AS seconds_since_heartbeat
FROM agents
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
ORDER BY last_heartbeat DESC;
```

**Critérios de sucesso:**
- ✅ Aparece 1 linha com o agente recém-instalado
- ✅ `status = 'active'`
- ✅ `last_heartbeat` é recente (<2 minutos)
- ✅ `os_type`, `os_version`, `hostname` preenchidos

**Anotar:**
- `agent_name`: ____________________
- `tenant_id`: ____________________

Se o agente NÃO aparecer:
- ❌ Verificar logs do agente (erros de HMAC, 401, 404)
- ❌ Verificar firewall/proxy bloqueando HTTPS
- ❌ Verificar se enrollment key está ativo e não expirado

---

## 🎯 Fase 3: Criar Job de Teste (2 min)

### 3.1 - Criar Job via SQL

Substitua `TENANT_ID_AQUI` e `AGENT_NAME_AQUI` pelos valores anotados:

```sql
INSERT INTO public.jobs (
  tenant_id,
  agent_name,
  type,
  payload,
  status,
  created_at
) VALUES (
  'TENANT_ID_AQUI',
  'AGENT_NAME_AQUI',
  'integration_test',
  '{}'::jsonb,
  'queued',
  NOW()
)
RETURNING id, agent_name, type, status, created_at;
```

**Anotar o `id` retornado:** ____________________

---

## 👁️ Fase 4: Monitorar Execução do Job (5-10 min)

### 4.1 - Query de Acompanhamento

Execute a cada **30 segundos** para ver a progressão:

```sql
SELECT 
  id,
  type,
  status,
  created_at,
  delivered_at,
  started_at,
  finished_at,
  execution_time_seconds,
  (output IS NOT NULL)       AS has_output,
  (error_message IS NOT NULL) AS has_error,
  CASE 
    WHEN output IS NOT NULL THEN LENGTH(output::text)
    ELSE 0
  END AS output_size_chars
FROM public.jobs
WHERE id = 'JOB_ID_AQUI'  -- Substituir pelo ID anotado
ORDER BY created_at DESC;
```

### 4.2 - Progressão Esperada

| Tempo | Status | delivered_at | started_at | finished_at | has_output | has_error |
|-------|--------|--------------|------------|-------------|------------|-----------|
| **T+0s** (criação) | `queued` | `NULL` | `NULL` | `NULL` | `false` | `false` |
| **T+30s** (poll) | `delivered` | `✓` | `NULL` ou `✓` | `NULL` | `false` | `false` |
| **T+45s** (execução) | `completed` | `✓` | `✓` | `✓` | `true` | `false` |

### 4.3 - Monitorar Logs do Agente (Paralelo)

Abrir terminal separado na máquina de teste:

**Windows:**
```powershell
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 50 -Wait
```

**Linux/macOS:**
```bash
sudo tail -f /var/log/cybershield/agent.log
```

**Buscar no log:**
- ✅ `[INFO] Job recebido: ID=JOB_ID_AQUI, type=integration_test`
- ✅ `[INFO] Executando job: integration_test`
- ✅ `[INFO] Job executado com sucesso`
- ✅ `[INFO] Chamando submit-job-result: status=completed`
- ✅ `[INFO] Resposta do servidor: 200 OK`

---

## ✅ Fase 5: Validar Resultado Final (5 min)

### 5.1 - Verificar Estado Final no Banco

```sql
SELECT 
  id,
  type,
  status,
  started_at,
  finished_at,
  execution_time_seconds,
  output,
  error_message,
  -- Validações
  CASE 
    WHEN status = 'completed' THEN '✅ OK'
    WHEN status = 'failed' THEN '⚠️ FALHOU'
    ELSE '❌ INCOMPLETO'
  END AS status_check,
  CASE 
    WHEN started_at IS NOT NULL AND finished_at IS NOT NULL 
         AND finished_at > started_at THEN '✅ OK'
    ELSE '❌ TIMESTAMPS INVÁLIDOS'
  END AS timestamp_check,
  CASE 
    WHEN execution_time_seconds > 0 THEN '✅ OK'
    ELSE '❌ SEM TEMPO DE EXECUÇÃO'
  END AS exec_time_check,
  CASE 
    WHEN output IS NOT NULL THEN '✅ OK'
    ELSE '❌ SEM OUTPUT'
  END AS output_check
FROM public.jobs
WHERE id = 'JOB_ID_AQUI';
```

### 5.2 - Critérios de Sucesso (Checklist)

**Job concluído com sucesso:**
- [ ] `status = 'completed'`
- [ ] `started_at IS NOT NULL`
- [ ] `finished_at IS NOT NULL`
- [ ] `finished_at > started_at`
- [ ] `execution_time_seconds >= 0` (geralmente 1-5 segundos)
- [ ] `output IS NOT NULL`
- [ ] `output` contém JSON válido:
  ```json
  {
    "message": "Integration test OK",
    "timestamp": "2025-01-16T...",
    "agent": "agent-XXXXX"
  }
  ```
- [ ] `error_message IS NULL`

### 5.3 - Visualizar Output Completo

```sql
SELECT 
  id,
  status,
  jsonb_pretty(output) AS output_formatted
FROM public.jobs
WHERE id = 'JOB_ID_AQUI';
```

---

## 🧪 Fase 6: Teste de Falha Controlada (5 min - OPCIONAL)

### 6.1 - Criar Job com Tipo Inválido

```sql
INSERT INTO public.jobs (
  tenant_id,
  agent_name,
  type,
  payload,
  status
) VALUES (
  'TENANT_ID_AQUI',
  'AGENT_NAME_AQUI',
  'tipo_inexistente_xpto',
  '{}'::jsonb,
  'queued'
)
RETURNING id;
```

### 6.2 - Aguardar Execução (30-60s)

### 6.3 - Validar Tratamento de Erro

```sql
SELECT 
  id,
  type,
  status,
  error_message,
  (output IS NOT NULL) AS has_output
FROM public.jobs
WHERE id = 'JOB_FALHA_ID_AQUI';
```

**Critérios de sucesso:**
- [ ] `status = 'failed'`
- [ ] `error_message IS NOT NULL`
- [ ] `error_message` contém mensagem clara (ex: "Tipo de job não suportado: tipo_inexistente_xpto")

---

## 📈 Fase 7: Validar Métricas do Sistema (5 min)

### 7.1 - Verificar Métricas do Agente

```sql
SELECT 
  agent_id,
  collected_at,
  cpu_usage_percent,
  memory_usage_percent,
  disk_usage_percent,
  uptime_seconds
FROM agent_system_metrics
WHERE agent_id = (
  SELECT id FROM agents WHERE agent_name = 'AGENT_NAME_AQUI'
)
ORDER BY collected_at DESC
LIMIT 5;
```

**Critérios de sucesso:**
- [ ] Pelo menos 1 registro de métricas
- [ ] `cpu_usage_percent`, `memory_usage_percent`, `disk_usage_percent` entre 0-100
- [ ] `collected_at` recente

### 7.2 - Verificar Heartbeats Recentes

```sql
SELECT 
  agent_name,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER AS seconds_ago
FROM agents
WHERE agent_name = 'AGENT_NAME_AQUI';
```

**Critérios de sucesso:**
- [ ] `seconds_ago < 120` (heartbeat enviado nos últimos 2 minutos)

---

## 🎯 Veredito Final P0-D

### ✅ Resultado: GO

**Se TODOS os critérios forem atendidos:**
- ✅ Agente instalado e enviando heartbeats
- ✅ Job criado → entregue → executado → concluído
- ✅ `started_at`, `finished_at`, `execution_time_seconds` preenchidos
- ✅ `output` contém dados válidos do agente
- ✅ Teste de falha: `error_message` preenchido
- ✅ Métricas do sistema sendo coletadas

**Sistema validado end-to-end e pronto para:**
- ✅ Testes de carga
- ✅ Validações P1 (HMAC detalhado, RLS, painel)
- ✅ Preparação para produção

### ❌ Resultado: NO-GO

**Se QUALQUER critério falhar:**
- ❌ Job não chega a `completed`/`failed` (fica em `delivered`/`queued`)
- ❌ `output` ou `error_message` sempre NULL
- ❌ `execution_time_seconds` sempre NULL ou 0
- ❌ Agente não envia heartbeat por >5 minutos
- ❌ Erros 404 em `submit-job-result`
- ❌ Erros 401 persistentes (HMAC inválido)

**Próximos passos em caso de NO-GO:**
1. Coletar logs completos (agente + Edge Functions)
2. Verificar tabela `security_logs` para erros de HMAC
3. Verificar tabela `rate_limits` para bloqueios
4. Revisar configuração de enrollment key
5. Validar que `submit-job-result` está deployada

---

## 📊 Comandos de Diagnóstico Rápido

### Ver últimos 10 jobs
```sql
SELECT id, agent_name, type, status, created_at, completed_at
FROM jobs
ORDER BY created_at DESC
LIMIT 10;
```

### Ver jobs problemáticos
```sql
SELECT *
FROM v_problematic_jobs
ORDER BY age_minutes DESC
LIMIT 10;
```

### Ver agentes offline
```sql
SELECT agent_name, status, last_heartbeat,
       EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER / 60 AS minutes_offline
FROM agents
WHERE status = 'active'
  AND last_heartbeat < NOW() - INTERVAL '5 minutes'
ORDER BY last_heartbeat ASC;
```

### Ver erros de segurança recentes
```sql
SELECT created_at, endpoint, attack_type, severity, ip_address
FROM security_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🆘 Troubleshooting

### Problema: Agente não aparece no banco após instalação

**Diagnóstico:**
1. Verificar logs do agente: `401 Unauthorized`?
2. Verificar enrollment key: ainda ativo e não expirado?
3. Verificar conectividade: `curl https://iavbnmduxpxhwubqrzzn.supabase.co`

**Solução:**
```bash
# Gerar novo enrollment key
# Reinstalar agente com novo key
```

### Problema: Job fica em `queued` por >2 minutos

**Diagnóstico:**
```sql
SELECT agent_name, status, last_heartbeat
FROM agents
WHERE agent_name = 'AGENT_NAME_AQUI';
```

**Solução:**
- Se `status = 'inactive'` → Reiniciar agente
- Se `last_heartbeat` antigo → Verificar conectividade

### Problema: Job fica em `delivered` sem evoluir

**Diagnóstico:**
1. Ver logs do agente: consegue executar o job?
2. Verificar se `submit-job-result` retorna 200 OK

**Solução:**
```bash
# Logs do agente (buscar exceções)
tail -50 /var/log/cybershield/agent.log
```

### Problema: `output` sempre NULL

**Diagnóstico:**
```sql
-- Ver se submit-job-result está sendo chamado
SELECT id, status, started_at, finished_at
FROM jobs
WHERE agent_name = 'AGENT_NAME_AQUI';
```

**Solução:**
1. Verificar logs da Edge Function `submit-job-result`
2. Confirmar que agente está chamando a função correta
3. Validar payload enviado pelo agente

---

## 📝 Template de Relatório P0-D

```markdown
## ✅ P0-D: Teste E2E Completo

**Data:** 2025-01-16  
**Executor:** [SEU NOME]  
**Ambiente:** [Produção / Staging / Dev]

### Agente Instalado
- **OS:** [Windows / Linux / macOS]
- **Hostname:** _______________
- **Agent Name:** _______________
- **Heartbeat:** ✅ OK / ❌ FALHOU

### Job de Teste
- **Job ID:** _______________
- **Tipo:** integration_test
- **Status Final:** [completed / failed / stuck]
- **Tempo de Execução:** ___ segundos

### Resultados
- [ ] Job concluído com sucesso
- [ ] `started_at` / `finished_at` preenchidos
- [ ] `execution_time_seconds` > 0
- [ ] `output` contém JSON válido
- [ ] Teste de falha: `error_message` OK

### Veredito
- [x] ✅ GO - Sistema validado end-to-end
- [ ] ❌ NO-GO - Problemas encontrados

**Observações:**
_______________________________________________
```

---

**Próximo passo:** Executar este guia e anotar resultados para fechar P0-D.
