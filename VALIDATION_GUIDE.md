# 🧪 GUIA DE VALIDAÇÃO - Instalador de Agentes CyberShield

## 📋 Pré-requisitos

- VM Windows Server 2022 limpa
- Acesso como Administrador
- PowerShell 5.1+
- Conectividade HTTPS com o servidor

---

## ✅ FASE 1: Validação Web

### 1. Acessar Interface
- Login: `pedrohalves42@gmail.com`
- Navegue: `/admin/agent-installer`
- Verifique: Página carrega sem erros

### 2. Gerar Instalador
- Nome: `TESTE-VM-WIN2022`
- Plataforma: **Windows**
- Clique: **"Gerar Comando de 1-Clique"**

**Validar:**
- ✅ Comando gerado sem placeholders `{{...}}`
- ✅ Token visível no preview
- ✅ Aviso de expiração em 24h

### 3. Download `.ps1`
- Clique: **"Baixar Instalador (.ps1)"**
- Abra arquivo em editor de texto
- Verifique: Token e HMAC presentes

---

## 🖥️ FASE 2: Instalação na VM

### Preparar Ambiente
```powershell
# Abrir PowerShell como Admin
Set-ExecutionPolicy Bypass -Scope Process -Force
$PSVersionTable.PSVersion  # >= 5.1
Test-NetConnection iavbnmduxpxhwubqrzzn.supabase.co -Port 443
```

### Executar Instalador (Opção 1: Comando)
```powershell
# Copiar/colar comando gerado na web
irm https://[URL_GERADA] | iex
```

### Executar Instalador (Opção 2: Arquivo)
```powershell
cd Downloads
.\install-TESTE-VM-WIN2022-windows.ps1
```

**Resultado Esperado:**
```
=== CyberShield Agent Installer ===
Downloading agent...
✓ Agent downloaded
Starting agent...
```

---

## 📊 FASE 3: Validação Dashboard

### 1. Verificar Status (60s)
- Acesse: `/admin/monitoring-advanced`
- Procure: `TESTE-VM-WIN2022`
- Valide:
  - ✅ Status: **"active"** (verde)
  - ✅ `last_heartbeat` < 1min
  - ✅ OS: Windows Server 2022

### 2. Verificar Métricas (5min)
- Clique no agente
- Valide:
  - ✅ CPU, RAM, Disk exibidos
  - ✅ Uptime presente
  - ✅ Gráficos carregam

### 3. Testar Job
- Acesse: `/jobs`
- Crie job: `collect_info` para `TESTE-VM-WIN2022`
- Aguarde status: `delivered` → `completed`

---

## 🧪 FASE 4: Testes E2E

```bash
npx playwright test e2e/installer-download.spec.ts
npx playwright test e2e/complete-agent-flow.spec.ts
npx playwright test e2e/heartbeat-validation.spec.ts
```

**Meta:** 100% pass rate (13/13 testes)

---

## 🧪 FASE 4.5: Validação Local de Scripts

### Script de Validação Automatizado

Antes de instalar qualquer agente, valide o script localmente:

```powershell
# Download do script de validação
# (Disponível no botão "Baixar Script de Validação" no painel de Troubleshooting)

# Ou clone o repositório:
git clone <repo-url>
cd <repo-dir>

# Execute a validação
.\scripts\verificar-installer-agente.ps1 -ScriptPath "C:\Users\Pedro\Downloads\installer.ps1"
```

**O que o script valida:**
- ✅ Encoding correto (UTF-8 sem BOM / ASCII)
- ✅ Ausência de emojis e caracteres Unicode
- ✅ Sintaxe PowerShell 5.1 válida
- ✅ Presença de funções críticas (Submit-JobResult, Send-Heartbeat, etc.)
- ✅ Parâmetro StartedAt (Jobs v3)
- ✅ Assinatura CyberShield

**Resultado Esperado:**
```
=== Verificação de Script do Agente / Installer ===
=== 1) Encoding ===
[OK] Encoding detectado: UTF-8 sem BOM / ASCII (IDEAL)

=== 2) Caracteres não-ASCII (emoji / símbolos) ===
[OK] Nenhum caractere fora do ASCII básico detectado.

=== 3) Sintaxe PowerShell 5.1 ===
[OK] Sintaxe PowerShell 5.1 VÁLIDA

=== 4) Funções críticas de AGENTE ===
[OK] Função Submit-JobResult presente
[OK] Função Send-Heartbeat presente
[OK] Função Poll-Jobs presente
[OK] Função Get-HmacSignature presente

=== 5) Presença de StartedAt (Jobs v3) ===
[OK] Parâmetro/variável StartedAt encontrado no script

=== 6) Assinatura CyberShield ===
[OK] Assinatura 'CyberShield Agent' encontrada no script

=== Resumo da Validação ===
[SUCCESS] Todas as validações críticas PASSARAM
```

---

## 🔍 Diagnóstico de Problemas

### Se agente NÃO conectar:
```sql
-- No Supabase SQL Editor
SELECT * FROM agents WHERE agent_name = 'TESTE-VM-WIN2022';
SELECT * FROM enrollment_keys WHERE used_by_agent = 'TESTE-VM-WIN2022';
```

### Verificar logs:
- Edge function `serve-installer`
- Edge function `heartbeat`
- Console do navegador (F12)

---

## ✅ Critérios de Sucesso

- [ ] Página carrega sem erros
- [ ] Instalador gerado corretamente
- [ ] Agente conecta em < 60s
- [ ] Métricas aparecem em < 5min
- [ ] Jobs são executados
- [ ] Testes E2E passam 100%

---

## 📝 Notas

- **Enrollment Key:** Expira em 24h
- **Heartbeat:** A cada 60s
- **Métricas:** A cada 5min
- **Rate Limits:** 2 req/min (heartbeat/metrics)
