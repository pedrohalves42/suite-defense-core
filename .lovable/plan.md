
# Plano: Script de Reinstalação Limpa Preservando Credenciais

## 📋 Objetivo
Criar um script PowerShell de reinstalação que:
1. **Lê o nome exato do agente** a partir do script `.ps1` existente ou do banco de dados
2. **Preserva as credenciais originais** (AgentToken, HmacSecret) sem precisar gerar novas
3. **Reinstala limpamente** sem excluir/arquivar o agente no dashboard
4. **Baixa a última versão** do script do servidor

---

## 🔍 Diagnóstico do Problema

### Situação Atual
- O usuário tem agentes "offline" que precisam ser reinstalados
- O método atual exige gerar nova enrollment key e recriar o agente
- Isso perde o histórico e métricas do agente existente

### Solução
Criar um script que:
1. Detecta automaticamente o nome do agente instalado
2. Extrai as credenciais do script existente (ou recebe como parâmetro)
3. Baixa o script atualizado do servidor usando as credenciais existentes
4. Reinstala preservando a identidade do agente

---

## 🛠️ Implementação

### Arquivo: `public/scripts/reinstall-agent-preserve.ps1`

Script PowerShell com 6 fases:

```text
FASE 1: Detectar Agente Existente
- Localiza script em C:\CyberShield\cybershield-agent-*.ps1
- Extrai nome do agente do nome do arquivo
- Extrai AgentToken, HmacSecret, ServerUrl do conteúdo do script

FASE 2: Parar Serviços
- Para Scheduled Task "CyberShieldAgent*"
- Mata processos PowerShell do agente

FASE 3: Backup (Opcional)
- Cria backup do script atual em C:\CyberShield\backup\

FASE 4: Baixar Script Atualizado
- Chama Edge Function /serve-agent-update
- Valida SHA256 do script baixado
- Usa credenciais preservadas

FASE 5: Reinstalar
- Remove scripts antigos
- Instala novo script com nome correto
- Recria Scheduled Task

FASE 6: Iniciar Agente
- Inicia Scheduled Task
- Verifica heartbeat
```

### Arquivo: `supabase/functions/_shared/reinstall-preserve-script-content.ts`

Conteúdo do script embutido para Edge Function.

### Arquivo: `supabase/functions/get-reinstall-preserve-script/index.ts`

Edge Function que serve o script via:
```
GET /functions/v1/get-reinstall-preserve-script
```

---

## 📝 Exemplo de Uso

### Método 1: Automático (detecta credenciais do script existente)
```powershell
# Baixar e executar (irá detectar credenciais automaticamente)
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
```

### Método 2: Manual (fornece credenciais explicitamente)
```powershell
# Se souber as credenciais
.\reinstall-agent-preserve.ps1 `
    -AgentName "pcteste1" `
    -AgentToken "uuid-do-token" `
    -HmacSecret "hex-64-chars"
```

### Método 3: Um comando (para máquinas com script instalado)
```powershell
# One-liner que detecta tudo automaticamente
powershell -ExecutionPolicy Bypass -Command "irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex"
```

---

## 🔒 Segurança

### Credenciais Preservadas
- O script extrai credenciais do arquivo `.ps1` existente
- Não precisa de enrollment key ou acesso ao dashboard
- Credenciais nunca são expostas em logs (apenas prefixos)

### Validações
- SHA256 do script baixado é verificado
- Sintaxe PowerShell validada antes de instalar
- Backup do script anterior é mantido

---

## 📂 Arquivos a Criar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `public/scripts/reinstall-agent-preserve.ps1` | PowerShell | Script standalone |
| `supabase/functions/_shared/reinstall-preserve-script-content.ts` | TypeScript | Conteúdo embutido |
| `supabase/functions/get-reinstall-preserve-script/index.ts` | Edge Function | Endpoint HTTP |

---

## ✅ Validação Pós-Implementação

1. **Teste em máquina com agente instalado**:
   ```powershell
   irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
   ```

2. **Verificar no dashboard**:
   - Agente deve aparecer como "online"
   - Versão deve ser a mais recente (v4.4.0)
   - Nome preservado exatamente igual

3. **Verificar logs**:
   ```powershell
   Get-Content C:\CyberShield\logs\agent.log -Tail 20
   ```

---

## 📊 Comparação com Método Atual

| Aspecto | Método Atual | Novo Script |
|---------|--------------|-------------|
| Requer dashboard | ✅ Sim | ❌ Não |
| Preserva histórico | ❌ Não (exclui agente) | ✅ Sim |
| Preserva métricas | ❌ Não | ✅ Sim |
| Gera nova enrollment key | ✅ Sim | ❌ Não |
| Detecta credenciais | ❌ Não | ✅ Automático |
| Valida SHA256 | ❓ Depende | ✅ Sempre |

---

## 🎯 Resumo Técnico

O script resolve o problema de reinstalação lendo as credenciais diretamente do arquivo `C:\CyberShield\cybershield-agent-{nome}.ps1` existente, preservando:
- `$AgentName` (ex: "Pcteste1-3")
- `$AgentToken` (UUID)
- `$HmacSecret` (64 hex chars)
- `$ServerUrl` (URL do Supabase)

Isso permite reinstalar o agente na mesma identidade, mantendo todo o histórico e métricas no dashboard.
