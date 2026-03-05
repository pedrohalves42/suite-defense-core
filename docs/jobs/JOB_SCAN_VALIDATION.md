# Job Type: scan (Agente v3)

## Funcionamento

O job `scan` permite escanear arquivos em busca de malware usando VirusTotal/Hybrid Analysis através do backend, com quarentena física local quando necessário.

### Fluxo Completo

1. **Agente recebe job** com `filePath` e `tenantId`
2. **Calcula SHA256** do arquivo local
3. **Chama backend** `/functions/v1/scan-virus` (VirusTotal/Hybrid Analysis)
4. **Backend processa**:
   - Grava em `virus_scans`
   - Se malicioso: cria registro em `quarantined_files`
   - Retorna resultado estruturado
5. **Agente executa quarentena física**:
   - Se malicioso: **MOVE** arquivo para `C:\CyberShield\Quarantine`
   - Retorna output estruturado via `submit-job-result`

> **IMPORTANTE**: A quarentena física no agente é **necessária** pois o backend Edge Function não tem acesso ao filesystem do Windows. O backend apenas registra a quarentena logicamente no banco de dados.

---

## Payload do Job

```json
{
  "filePath": "C:\\Windows\\System32\\notepad.exe",
  "tenantId": "3adc67e6-8908-4d98-b85b-5e93be4673a1"
}
```

### Campos Obrigatórios

- `filePath` (string): Caminho completo do arquivo no Windows
- `tenantId` (uuid): ID do tenant (obrigatório para RLS no backend)

---

## Output Esperado

### Arquivo Limpo

```json
{
  "filePath": "C:\\Windows\\System32\\notepad.exe",
  "fileHash": "abc123def456...",
  "isMalicious": false,
  "positives": 0,
  "totalScans": 70,
  "permalink": "https://www.virustotal.com/gui/file/abc123...",
  "scannerUsed": "virustotal",
  "fromCache": false,
  "quarantined": false
}
```

### Arquivo Malicioso (com Quarentena)

```json
{
  "filePath": "C:\\Temp\\malware.exe",
  "fileHash": "def789abc123...",
  "isMalicious": true,
  "positives": 45,
  "totalScans": 70,
  "permalink": "https://www.virustotal.com/gui/file/def789...",
  "scannerUsed": "virustotal",
  "fromCache": false,
  "quarantined": true,
  "quarantinePath": "C:\\CyberShield\\Quarantine\\550e8400-e29b-41d4-a716-446655440000_malware.exe"
}
```

### Campos do Output

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `filePath` | string | Caminho original do arquivo |
| `fileHash` | string | SHA256 do arquivo (lowercase) |
| `isMalicious` | boolean | `true` se malware detectado |
| `positives` | number | Número de engines que detectaram malware |
| `totalScans` | number | Total de engines que escanearam |
| `permalink` | string | URL do relatório no VirusTotal |
| `scannerUsed` | string | `"virustotal"` ou `"hybrid_analysis"` |
| `fromCache` | boolean | `true` se resultado veio do cache (< 24h) |
| `quarantined` | boolean | `true` se arquivo foi movido para quarentena |
| `quarantinePath` | string | Caminho do arquivo em quarentena (opcional) |

---

## Validação Manual

### 1. Criar Job via SQL

```sql
INSERT INTO public.jobs (
  tenant_id,
  agent_name,
  type,
  payload,
  status
) VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',  -- Pedro Alves tenant
  'pcteste1',
  'scan',
  jsonb_build_object(
    'filePath', 'C:\Windows\System32\notepad.exe',
    'tenantId', '3adc67e6-8908-4d98-b85b-5e93be4673a1'
  ),
  'queued'
)
RETURNING id, created_at;
```

### 2. Monitorar Execução (60-90s)

```sql
-- Ver job concluído
SELECT
  id, type, status, created_at, delivered_at, started_at, finished_at,
  execution_time_seconds, output, error_message
FROM public.jobs
WHERE type = 'scan' AND agent_name = 'pcteste1'
ORDER BY created_at DESC
LIMIT 1;
```

**Status esperado após execução:**
- `status = 'completed'`
- `error_message IS NULL`
- `output` contendo JSON estruturado conforme acima

### 3. Verificar Registro no Backend

```sql
-- Ver scan no banco
SELECT 
  file_path, file_hash, is_malicious, positives, total_scans, 
  scanner, scanned_at
FROM virus_scans
WHERE agent_name = 'pcteste1'
ORDER BY scanned_at DESC
LIMIT 3;

-- SE malicioso, ver registro de quarentena
SELECT 
  file_path, file_hash, quarantine_reason, 
  quarantined_at, status
FROM quarantined_files
WHERE agent_name = 'pcteste1'
ORDER BY quarantined_at DESC
LIMIT 3;

-- Ver alertas de malware
SELECT 
  title, message, severity, alert_type, 
  created_at, acknowledged
FROM system_alerts
WHERE tenant_id = '3adc67e6-8908-4d98-b85b-5e93be4673a1'
  AND alert_type = 'malware'
ORDER BY created_at DESC
LIMIT 5;
```

### 4. Verificar Quarentena Física (Windows)

```powershell
# Listar arquivos em quarentena local
Get-ChildItem "C:\CyberShield\Quarantine" | Format-Table Name, Length, LastWriteTime

# Ver detalhes de um arquivo específico
Get-FileHash -Path "C:\CyberShield\Quarantine\{guid}_malware.exe" -Algorithm SHA256
```

### 5. Verificar Logs do Agente

```powershell
# Ver últimos 50 logs
Get-Content "C:\CyberShield\logs\cybershield-agent.log" -Tail 50

# Filtrar logs de scan
Get-Content "C:\CyberShield\logs\cybershield-agent.log" | Select-String "scan"
```

**Logs esperados:**
```
[2025-01-17 18:45:23] [INFO] 📄 Job type 'scan' recebido
[2025-01-17 18:45:23] [INFO] 🔍 Escaneando: C:\Temp\test.exe (hash: abc123...)
[2025-01-17 18:45:25] [WARN] ⚠️ MALWARE DETECTADO: 45/70 engines
[2025-01-17 18:45:25] [SUCCESS] ✅ Arquivo movido para quarentena: C:\CyberShield\Quarantine\...
```

---

## Cenários de Erro

### Erro: Arquivo não encontrado

```json
{
  "status": "failed",
  "error_message": "Arquivo não encontrado: C:\\Path\\Inexistente.exe"
}
```

**Causa**: O `filePath` no payload não existe no sistema

**Solução**: Verificar se o caminho está correto e se o arquivo não foi movido/deletado

---

### Erro: Backend timeout

```json
{
  "status": "failed",
  "error_message": "Falha ao chamar scan-virus: HTTP 408"
}
```

**Causa**: VirusTotal/Hybrid Analysis demorou mais de 60s para responder

**Solução**: 
- Verificar conectividade com APIs externas
- Aumentar timeout se necessário (payload de 100MB+)
- Verificar quotas das APIs de scan

---

### Erro: Falha ao mover arquivo

```json
{
  "status": "failed",
  "error_message": "Access to the path 'C:\\Temp\\malware.exe' is denied."
}
```

**Causa**: Arquivo está sendo usado por outro processo ou sem permissão

**Solução**:
- Agente deve rodar como `SYSTEM` via Scheduled Task
- Fechar processos que estão usando o arquivo
- Verificar permissões NTFS

---

## Compatibilidade com FASE 2/3

### FASE 2: Auto-Update
✅ Job `scan` é independente do job `update_agent`
✅ Atualização do agente não quebra funcionalidade de scan

### FASE 3: Dashboard
✅ Output estruturado pronto para consumo no frontend
✅ Tabelas `virus_scans` e `quarantined_files` já existem
✅ Gráficos podem usar `scanned_at`, `is_malicious`, `positives`

---

## Rollback de Quarentena

### Restaurar Arquivo Quarentanado

```powershell
# 1. Identificar arquivo em quarentena
$quarantinedFile = "C:\CyberShield\Quarantine\550e8400-e29b-41d4-a716-446655440000_malware.exe"

# 2. Extrair caminho original do banco
$fileHash = (Get-FileHash -Path $quarantinedFile -Algorithm SHA256).Hash.ToLower()

# Query no banco:
# SELECT file_path FROM quarantined_files WHERE file_hash = '$fileHash'

# 3. Mover de volta (COM MUITO CUIDADO!)
$originalPath = "C:\Temp\malware.exe"
Move-Item -Path $quarantinedFile -Destination $originalPath -Force

# 4. Atualizar banco
# UPDATE quarantined_files 
# SET status = 'restored', restored_at = NOW(), restored_by = 'admin-user-id'
# WHERE file_hash = '$fileHash'
```

> ⚠️ **AVISO**: Restaurar arquivos maliciosos é **extremamente perigoso**. Faça apenas em ambientes isolados (VM/sandbox).

---

## Job Type: update_agent

### Funcionamento

O job `update_agent` permite atualizar automaticamente o script do agente PowerShell para uma nova versão, garantindo integridade via SHA256 e criando backups de segurança.

### Fluxo Completo

1. **Agente recebe job** `update_agent` (sem payload necessário)
2. **Chama backend** `/functions/v1/serve-agent-update` via HMAC
3. **Backend verifica**:
   - Última release ativa em `agent_releases`
   - Compara `agent.agent_version` com `release.version`
   - Retorna "Already up to date" ou release completa
4. **Agente processa update**:
   - Salva `script_content` em arquivo temporário
   - Valida SHA256 do arquivo salvo
   - Cria backup do script atual
   - Substitui script com nova versão
   - Reinicia Scheduled Task
5. **Retorna output estruturado** via `submit-job-result`

### Payload do Job

```json
{}
```

**Campos:** Nenhum payload necessário (agente é identificado por HMAC)

---

### Output Esperado

#### Caso 1: Update Disponível e Executado

```json
{
  "message": "Agent updated successfully",
  "newVersion": "3.1.0",
  "sha256": "abc123def456...",
  "restartedAt": "2025-01-17T19:30:00.000Z"
}
```

#### Caso 2: Já Está Atualizado

```json
{
  "message": "Already up to date",
  "current_version": "3.1.0",
  "latest_version": "3.1.0"
}
```

### Campos do Output

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `message` | string | Status da operação |
| `newVersion` | string | Nova versão instalada (se update executado) |
| `sha256` | string | SHA256 do script instalado (se update executado) |
| `restartedAt` | string | Timestamp do restart da task (ISO 8601) |
| `current_version` | string | Versão atual (se "Already up to date") |
| `latest_version` | string | Última versão disponível (se "Already up to date") |

---

### Validação Manual

#### 1. Criar Release de Teste

```powershell
# No agente, calcular SHA256 do script atual
$hash = (Get-FileHash "C:\CyberShield\cybershield-agent.ps1" -Algorithm SHA256).Hash.ToLower()
$hash
```

```sql
-- Inserir release de teste (versão maior que a atual)
INSERT INTO public.agent_releases (version, platform, channel, script_content, sha256, release_notes, is_active)
VALUES (
  '3.1.0',
  'windows',
  'stable',
  '<SCRIPT_CONTENT_AQUI>',  -- Colar conteúdo do .ps1
  '<SHA256_AQUI>',           -- Colar hash calculado acima
  'Teste de auto-update',
  true
);
```

#### 2. Criar Job via SQL

```sql
INSERT INTO public.jobs (
  tenant_id,
  agent_name,
  type,
  payload,
  status
) VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',  -- Pedro Alves tenant
  'pcteste1',
  'update_agent',
  '{}'::jsonb,  -- Sem payload necessário
  'queued'
)
RETURNING id, created_at;
```

#### 3. Monitorar Execução (60-90s)

```sql
-- Ver job concluído
SELECT
  id, type, status, created_at, delivered_at, started_at, finished_at,
  execution_time_seconds, output, error_message
FROM public.jobs
WHERE type = 'update_agent' AND agent_name = 'pcteste1'
ORDER BY created_at DESC
LIMIT 1;
```

**Status esperado após execução:**
- `status = 'completed'`
- `error_message IS NULL`
- `output` contendo JSON estruturado conforme acima

#### 4. Verificar Backup e Script (PowerShell no agente)

```powershell
# Ver backups criados
Get-ChildItem "C:\CyberShield\*-backup-*.ps1" | Sort-Object LastWriteTime -Descending | Select-Object -First 3

# Verificar script atualizado
Get-Item "C:\CyberShield\cybershield-agent.ps1" | Select-Object FullName, Length, LastWriteTime

# Validar SHA256 do script atualizado
(Get-FileHash "C:\CyberShield\cybershield-agent.ps1" -Algorithm SHA256).Hash.ToLower()
```

#### 5. Teste de "Already up to date"

```sql
-- Criar job novamente (agente já está em 3.1.0)
INSERT INTO public.jobs (tenant_id, agent_name, type, payload, status)
VALUES (
  '3adc67e6-8908-4d98-b85b-5e93be4673a1',
  'pcteste1',
  'update_agent',
  '{}'::jsonb,
  'queued'
)
RETURNING id, created_at;
```

**Esperado:**
- `status = 'completed'`
- `output.message = "Already up to date"`
- `output.current_version = "3.1.0"`

---

### Cenários de Erro

#### SHA256 Mismatch

```json
{
  "success": false,
  "error": "SHA256 mismatch! Esperado: abc123..., Obtido: def456..."
}
```

**Causa:** Script baixado está corrompido ou foi modificado  
**Ação:** Verificar integridade da release em `agent_releases`

#### Falha ao Buscar Update

```json
{
  "success": false,
  "error": "Falha ao buscar update: HTTP 500"
}
```

**Causa:** Erro no Edge Function `serve-agent-update`  
**Ação:** Verificar logs do Edge Function no Supabase

---

### Melhorias Implementadas (v3)

#### Usa `$PSCommandPath` Dinâmico
```powershell
# ❌ ANTES (hardcoded)
$scriptPath = "C:\CyberShield\cybershield-agent.ps1"

# ✅ AGORA (dinâmico)
$currentScript = $PSCommandPath
```

**Benefício:** Funciona independente do local de instalação

#### SHA256 do Arquivo Salvo
```powershell
# ❌ ANTES (SHA256 da string)
$actualSha256 = [System.BitConverter]::ToString(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($newScript)
    )
).Replace("-", "").ToLower()

# ✅ AGORA (SHA256 do arquivo)
Set-Content -Path $tempScript -Value $scriptText -Encoding UTF8
$actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
```

**Benefício:** Validação mais confiável (garante integridade do arquivo gravado)

#### Tratamento "Already up to date"
```powershell
# ✅ AGORA valida ANTES de processar
if ($data.message -eq "Already up to date") {
    Write-Log "ℹ Agente já está na última versão ($($data.current_version))" "INFO"
    $result.success = $true
    $result.output  = ($data | ConvertTo-Json -Depth 5)
    break
}
```

**Benefício:** Evita processamento desnecessário e logs mais claros

---

## Garantias de Segurança

✅ **Zero alterações em schema**: Usa tabelas existentes
✅ **Proteção em camadas**: Backend (registro lógico) + Agente (quarentena física)
✅ **Rollback simples**: Arquivo pode ser restaurado via `Move-Item`
✅ **Audit trail completo**: Logs no agente + registros no banco
✅ **RLS enforcement**: Tenant isolation garantido via `tenant_id`

---

## Referências

- [FASE_2_3_IMPLEMENTACAO_STATUS.md](../FASE_2_3_IMPLEMENTACAO_STATUS.md)
- [JOB_CANONICO_VALIDACAO.md](./JOB_CANONICO_VALIDACAO.md)
- [P0_VALIDATION_RESULTS.md](./P0_VALIDATION_RESULTS.md)
