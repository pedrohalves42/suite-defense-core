# 🚀 Scripts de Deployment do CyberShield Agent

## 📋 Visão Geral

Este diretório contém scripts para gerenciar o ciclo de vida dos agentes CyberShield em produção:

| Script | Propósito | Quando Usar |
|--------|-----------|-------------|
| `deploy-agent-update.ps1` | **Deploy automatizado** de atualizações do agente Python | Atualizar código do agente em produção |
| `recreate-agent-task.ps1` | **Recriar** Scheduled Task do Windows com credenciais corretas | Corrigir configuração da task ou após reinstalação |
| `cleanup-agents.ps1` | **Limpar** processos e tasks duplicados/fantasma | Resolver múltiplos processos rodando |

---

## 🔥 Script Principal: `deploy-agent-update.ps1`

### 🎯 Objetivo

Automatiza o deployment de atualizações do agente Python em máquinas Windows de produção, com:
- Backup automático
- Validação de código
- Reinicialização controlada
- Verificação de logs

### 📖 Uso Básico

```powershell
# Sintaxe básica
.\deploy-agent-update.ps1 -AgentName "nome-do-agente"

# Exemplo real
.\deploy-agent-update.ps1 -AgentName "pcteste1"
```

### 🔧 Parâmetros

| Parâmetro | Obrigatório | Padrão | Descrição |
|-----------|-------------|--------|-----------|
| `-AgentName` | ✅ Sim | - | Nome do agente (ex: `pcteste1`) |
| `-InstallPath` | ❌ Não | `C:\CyberShield` | Diretório de instalação do agente |
| `-BackupPath` | ❌ Não | `C:\CyberShield\backup` | Diretório para backups |
| `-SourcePath` | ❌ Não | `.\agent` | Caminho dos arquivos fonte (relativo ao projeto) |

### 🔍 O Que o Script Faz

1. **Para processos antigos**
   - Scheduled Task `CyberShieldAgent`
   - Processos Python relacionados ao agente

2. **Cria backup automático**
   - Copia todo o diretório `C:\CyberShield` para `C:\CyberShield\backup\backup-YYYYMMDD-HHMMSS`

3. **Copia arquivos atualizados**
   - `main.py`
   - `job_poller.py`
   - `config.py`
   - `heartbeat_sender.py`
   - `auto_updater.py`
   - `hmac_utils.py`
   - `logger_config.py`
   - `requirements.txt`

4. **Atualiza dependências**
   - Executa `pip install -r requirements.txt`

5. **Valida código**
   - Verifica sintaxe Python (`py_compile`)
   - Confirma presença de `submit_job_result` (código novo vs. antigo)

6. **Reinicia agente**
   - Inicia Scheduled Task

7. **Verifica logs**
   - Lê últimas 10 linhas de `C:\CyberShield\logs\agent.log`
   - Confirma que `submit-job-result` está sendo usado (não `ack-job`)

### ✅ Indicadores de Sucesso

Ao final, o script mostra:

```
✅ Deployment concluído!

📝 Próximos passos:
   1. Monitorar logs por ~2 minutos: Get-Content C:\CyberShield\logs\agent.log -Tail 20 -Wait
   2. Confirmar heartbeat no dashboard (last_heartbeat < 2min)
   3. Criar job de teste (integration_test) para validar pipeline

📂 Backup dos arquivos antigos:
   C:\CyberShield\backup\backup-20251117-143052
```

**Logs esperados:**
- ✅ `"📤 Enviando resultado do job"`
- ✅ `"submit-job-result"`
- ✅ `"✅ POST .../submit-job-result - Status: 200"`
- ❌ **NÃO** aparece `"ack-job"`

### 🚨 Troubleshooting

#### Problema: "Diretório fonte não encontrado"

```powershell
# Solução: Especificar caminho correto
.\deploy-agent-update.ps1 -AgentName "pcteste1" -SourcePath "C:\dev\cybershield\agent"
```

#### Problema: Código antigo ainda está rodando

```powershell
# 1. Verificar se tem múltiplos processos
Get-Process python* -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*cybershield*'
}

# 2. Matar todos
Get-Process python* -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*cybershield*'
} | Stop-Process -Force

# 3. Executar deploy novamente
.\deploy-agent-update.ps1 -AgentName "pcteste1"
```

#### Problema: Scheduled Task não reinicia

```powershell
# Recriar task manualmente
.\recreate-agent-task.ps1 `
  -AgentToken "SEU_AGENT_TOKEN" `
  -HmacSecret "SEU_HMAC_SECRET" `
  -AgentName "pcteste1"
```

### 📊 Exemplo de Saída Completa

```
🚀 CyberShield Agent Update Deployment
======================================

1️⃣  Parando processos antigos do agente...
   ✅ Scheduled Task parada
   🔪 Matando processo PID 12345

2️⃣  Criando backup dos arquivos atuais...
   ✅ Backup criado em: C:\CyberShield\backup\backup-20251117-143052

3️⃣  Copiando arquivos atualizados...
   ✅ main.py
   ✅ job_poller.py
   ✅ config.py
   ✅ heartbeat_sender.py
   ✅ auto_updater.py
   ✅ hmac_utils.py
   ✅ logger_config.py
   ✅ requirements.txt

   📦 Total: 8 arquivos copiados

4️⃣  Verificando dependências Python...
   ✅ Dependências atualizadas

5️⃣  Validando código atualizado...
   ✅ Código novo detectado (submit_job_result presente)
   ✅ Sintaxe Python válida

6️⃣  Reiniciando agente...
   ✅ Scheduled Task reiniciada
   Estado: 0
   Última execução: 11/17/2025 2:30:52 PM

7️⃣  Verificando logs do agente...

   📋 Últimas 10 linhas do log:
   [2025-11-17 14:30:52] [INFO] 🚀 CyberShield Agent v1.0.0 iniciando...
   [2025-11-17 14:30:52] [INFO] Agent Name: pcteste1
   [2025-11-17 14:30:53] [DEBUG] 📡 Enviando heartbeat...
   [2025-11-17 14:30:53] [DEBUG] ✅ POST .../heartbeat - Status: 200
   [2025-11-17 14:30:54] [DEBUG] Verificando jobs pendentes...
   [2025-11-17 14:30:55] [DEBUG] ✅ POST .../poll-jobs - Status: 200
   [2025-11-17 14:30:55] [DEBUG] 📥 Recebidos 1 job(s)
   [2025-11-17 14:30:55] [DEBUG] 📤 Enviando resultado do job abc-123 para submit-job-result...
   [2025-11-17 14:30:56] [DEBUG] ✅ POST .../submit-job-result - Status: 200

   ✅ VALIDADO: Código novo está rodando (submit-job-result detectado)

✅ Deployment concluído!
```

---

## 🔄 Script: `recreate-agent-task.ps1`

### 🎯 Objetivo

Recria a Scheduled Task do Windows com as credenciais corretas do agente.

### 📖 Uso

```powershell
.\recreate-agent-task.ps1 `
  -AgentToken "seu_token_aqui" `
  -HmacSecret "seu_hmac_secret_aqui" `
  -AgentName "nome_do_agente"
```

### 🔧 Parâmetros Obrigatórios

- `-AgentToken`: Token de autenticação do agente
- `-HmacSecret`: Segredo HMAC (64 caracteres hex)
- `-AgentName`: Nome do agente

### 🔧 Parâmetros Opcionais

- `-ServerUrl`: URL do servidor (padrão: `https://iavbnmduxpxhwubqrzzn.supabase.co`)
- `-ScriptPath`: Caminho do script Python (padrão: `C:\CyberShield\main.py`)
- `-PollInterval`: Intervalo de polling (padrão: `60` segundos)
- `-TaskName`: Nome da task (padrão: `CyberShieldAgent`)

---

## 🧹 Script: `cleanup-agents.ps1`

### 🎯 Objetivo

Remove processos e Scheduled Tasks duplicados ou fantasma.

### 📖 Uso

```powershell
# Dry run (não faz alterações, apenas mostra o que seria feito)
.\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc") -DryRun

# Execução real
.\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc")
```

### 🔧 Parâmetros

- `-ValidTokenPrefixes`: Array de prefixos de tokens válidos (ex: primeiros 8 caracteres)
- `-DryRun`: Modo simulação (não faz alterações)
- `-Verbose`: Output detalhado

---

## 📝 Workflow Recomendado

### Cenário 1: Atualizar Agente em Produção

```powershell
# 1. Deploy automatizado
.\deploy-agent-update.ps1 -AgentName "pcteste1"

# 2. Se algo der errado, restaurar backup
Copy-Item -Path "C:\CyberShield\backup\backup-YYYYMMDD-HHMMSS\*" `
          -Destination "C:\CyberShield\" `
          -Recurse -Force

# 3. Reiniciar task
Start-ScheduledTask -TaskName "CyberShieldAgent"
```

### Cenário 2: Resolver Processos Fantasma

```powershell
# 1. Identificar processos válidos
.\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc", "f5df4954") -DryRun

# 2. Executar limpeza
.\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc", "f5df4954")

# 3. Confirmar que sobrou apenas 1 processo
Get-Process python* -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*cybershield*'
}
```

### Cenário 3: Reinstalar Agente do Zero

```powershell
# 1. Limpar tudo
.\cleanup-agents.ps1 -ValidTokenPrefixes @()

# 2. Deploy novo
.\deploy-agent-update.ps1 -AgentName "novo-agente"

# 3. Recriar task com credenciais
.\recreate-agent-task.ps1 `
  -AgentToken "novo_token" `
  -HmacSecret "novo_hmac" `
  -AgentName "novo-agente"
```

---

## 🔐 Segurança

**⚠️ IMPORTANTE:**
- Nunca commitar tokens ou secrets em Git
- Executar scripts apenas como Administrador
- Backups contêm credenciais sensíveis - proteger adequadamente
- Logs podem conter informações sensíveis - limpar periodicamente

---

## 📚 Referências

- [Guia de Limpeza de Agentes](../docs/AGENT_CLEANUP_GUIDE.md)
- [Validação P0](../docs/P0_VALIDATION_RESULTS.md)
- [Troubleshooting](../docs/TROUBLESHOOTING_GUIDE.md)

---

**Mantido por:** Time CyberShield  
**Última atualização:** 2025-11-17
