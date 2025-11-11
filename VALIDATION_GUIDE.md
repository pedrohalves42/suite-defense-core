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
