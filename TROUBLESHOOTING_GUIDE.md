# 🔧 Guia de Troubleshooting - CyberShield

Este guia ajuda a resolver problemas comuns na instalação e operação do CyberShield.

## 📋 Índice

- [Problemas de Instalação do Agente](#problemas-de-instalação-do-agente)
- [Problemas de Conexão](#problemas-de-conexão)
- [Problemas com Jobs](#problemas-com-jobs)
- [Problemas com Scan de Vírus](#problemas-com-scan-de-vírus)
- [Problemas de Autenticação](#problemas-de-autenticação)
- [Problemas com Email](#problemas-com-email)
- [Logs e Diagnóstico](#logs-e-diagnóstico)

---

## Problemas de Instalação do Agente

### 🪟 Windows

#### Problema: "Não é possível executar scripts neste sistema"

**Causa:** Política de execução do PowerShell bloqueando scripts.

**Solução:**
```powershell
# Execute como Administrador:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Ou temporariamente para apenas esta sessão:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
```

**Alternativa:**
```powershell
# Execute o script sem mudar política global:
powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows.ps1 `
  -AgentToken "seu-token" `
  -HmacSecret "seu-secret" `
  -ServerUrl "https://seu-server.supabase.co"
```

---

#### Problema: Script bloqueado pelo Windows Defender

**Causa:** Windows Defender marca o script como "não reconhecido".

**Solução:**
```powershell
# 1. Desbloqueie o arquivo:
Unblock-File -Path .\cybershield-agent-windows.ps1

# 2. Adicione exceção no Windows Defender:
# Abra Windows Security → Proteção contra vírus e ameaças
# → Gerenciar configurações → Adicionar ou remover exclusões
# → Adicionar exclusão → Arquivo → Selecione o script
```

**Ou via PowerShell (Admin):**
```powershell
Add-MpPreference -ExclusionPath "C:\caminho\para\cybershield-agent-windows.ps1"
```

---

#### Problema: Erro "Acesso negado" ao instalar serviço

**Causa:** PowerShell não está rodando como Administrador.

**Solução:**
1. Feche o PowerShell
2. Clique com botão direito em "PowerShell"
3. Selecione "Executar como administrador"
4. Execute o script novamente

---

#### Problema: Serviço não inicia após instalação

**Causa:** Parâmetros incorretos ou caminho inválido.

**Verificação:**
```powershell
# Verifique o status do serviço:
Get-Service -Name "CyberShieldAgent" | Select-Object Status, StartType

# Veja logs do serviço:
Get-EventLog -LogName Application -Source "CyberShieldAgent" -Newest 10

# Teste o script manualmente (sem instalar serviço):
.\cybershield-agent-windows.ps1 `
  -AgentToken "seu-token" `
  -HmacSecret "seu-secret" `
  -ServerUrl "https://seu-server.supabase.co" `
  -PollInterval 30
```

**Solução:**
```powershell
# Remova e reinstale o serviço:
sc.exe delete "CyberShieldAgent"

# Execute o script novamente com parâmetros corretos
```

---

### 🐧 Linux

#### Problema: "jq: command not found"

**Causa:** Dependência `jq` não instalada.

**Solução:**

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y jq curl
```

**CentOS/RHEL:**
```bash
sudo yum install -y jq curl
```

**Arch:**
```bash
sudo pacman -S jq curl
```

---

#### Problema: "Permission denied" ao executar script

**Causa:** Script não tem permissão de execução.

**Solução:**
```bash
# Dê permissão de execução:
chmod +x cybershield-agent-linux.sh

# Execute:
./cybershield-agent-linux.sh \
  --agent-token "seu-token" \
  --hmac-secret "seu-secret" \
  --server-url "https://seu-server.supabase.co"
```

---

#### Problema: Serviço systemd não inicia

**Causa:** Erro no arquivo de serviço ou parâmetros.

**Verificação:**
```bash
# Verifique status:
sudo systemctl status cybershield-agent

# Veja logs:
sudo journalctl -u cybershield-agent -n 50 --no-pager

# Teste o script manualmente:
./cybershield-agent-linux.sh \
  --agent-token "seu-token" \
  --hmac-secret "seu-secret" \
  --server-url "https://seu-server.supabase.co" \
  --poll-interval 30
```

**Solução:**
```bash
# Recarregue configuração do systemd:
sudo systemctl daemon-reload

# Reinicie o serviço:
sudo systemctl restart cybershield-agent

# Habilite para iniciar no boot:
sudo systemctl enable cybershield-agent
```

---

#### Problema: "Connection refused" ao conectar no servidor

**Causa:** Firewall bloqueando conexões HTTPS.

**Verificação:**
```bash
# Teste conectividade:
curl -v https://seu-server.supabase.co/functions/v1/poll-jobs

# Verifique firewall:
sudo iptables -L -n | grep 443
```

**Solução:**
```bash
# Ubuntu/Debian (ufw):
sudo ufw allow 443/tcp
sudo ufw allow out 443/tcp

# CentOS/RHEL (firewalld):
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload

# iptables:
sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

---

## Problemas de Conexão

### Problema: Agente não aparece no dashboard

**Possíveis causas:**

1. **Enrollment não completado**
   ```bash
   # Verifique se o agente foi matriculado:
   # No dashboard, vá em "Agentes" e procure pelo nome
   ```

2. **Token ou Secret incorretos**
   ```bash
   # Verifique os parâmetros no script:
   # - AgentToken deve ser um UUID válido
   # - HmacSecret deve corresponder ao gerado
   # - ServerUrl deve ser correto
   ```

3. **Firewall bloqueando**
   ```bash
   # Teste conectividade manualmente:
   curl -X POST https://seu-server.supabase.co/functions/v1/poll-jobs \
     -H "X-Agent-Token: seu-token"
   ```

4. **Agente não está rodando**
   ```powershell
   # Windows:
   Get-Service -Name "CyberShieldAgent"
   
   # Linux:
   sudo systemctl status cybershield-agent
   ```

---

### Problema: Agente mostra "offline" no dashboard

**Causa:** Heartbeat não está sendo enviado.

**Verificação:**
```bash
# Verifique logs do agente:
# Windows: Event Viewer → Application
# Linux: sudo journalctl -u cybershield-agent -f

# Procure por erros de conexão ou autenticação
```

**Solução:**
1. Verifique conectividade de rede
2. Confirme que token e secret estão corretos
3. Reinicie o agente
4. Aguarde 2-3 minutos (intervalo de poll)

---

## Problemas com Jobs

### Problema: Jobs não são executados

**Causa 1: Agente offline**
```bash
# Verifique status no dashboard: Agentes → [seu agente]
# Status deve ser "online" (verde)
```

**Causa 2: Jobs não aprovados**
```bash
# No dashboard: Jobs → Verifique coluna "Aprovado"
# Jobs devem estar com "approved = true"
```

**Causa 3: Tipo de job inválido**
```bash
# Tipos válidos:
# - scan (scan genérico)
# - update (atualização)
# - report (relatório)
# - config (configuração)
```

**Verificação:**
```sql
-- Verifique jobs pendentes no banco:
SELECT id, agent_name, type, status, created_at, delivered_at
FROM jobs
WHERE agent_name = 'SEU-AGENTE'
ORDER BY created_at DESC
LIMIT 10;
```

---

### Problema: Job fica em "queued" indefinidamente

**Causa:** Agente não está fazendo poll.

**Solução:**
1. Verifique se agente está rodando
2. Verifique logs do agente
3. Confirme intervalo de poll (padrão: 60s)
4. Teste manualmente:

```bash
# Simule poll do agente:
curl -X GET https://seu-server.supabase.co/functions/v1/poll-jobs \
  -H "X-Agent-Token: seu-token" \
  -H "X-HMAC-Signature: GERADO_PELO_SCRIPT" \
  -H "X-Timestamp: $(date +%s)" \
  -H "X-Nonce: $(uuidgen)"
```

---

## Problemas com Scan de Vírus

### Problema: Scan retorna "VirusTotal not configured"

**Causa:** Secret `VIRUSTOTAL_API_KEY` não configurado.

**Solução:**
1. Obtenha API key em [virustotal.com](https://www.virustotal.com)
2. Configure o secret:
   - Via Lovable Cloud: Backend → Secrets → Add Secret
   - Nome: `VIRUSTOTAL_API_KEY`
   - Valor: sua chave
3. Aguarde 2-3 minutos (propagação)
4. Teste novamente

**Verificar:**
```bash
curl -X POST https://seu-server.supabase.co/functions/v1/test-virustotal-integration \
  -H "Authorization: Bearer seu-supabase-anon-key"
```

---

### Problema: Scan retorna "Rate limit exceeded"

**Causa:** Limite da API VirusTotal atingido.

**Limites:**
- Free: 500 requests/dia, 4 requests/minuto
- Premium: Milhares de requests/dia

**Solução:**
1. Aguarde 1 minuto entre scans
2. Considere upgrade para plano Premium
3. Implemente cache de hashes já escaneados

---

### Problema: Arquivo não é detectado como malicioso

**Isso NÃO é um problema!** VirusTotal pode retornar:
- `positives: 0` - Nenhum antivírus detectou
- `positives: 1-5` - Poucos detectaram (pode ser falso positivo)
- `positives: >10` - Provável malware

**O que fazer:**
- Ajuste threshold em Tenant Settings
- Revise manualmente arquivos com 1-5 detecções
- Configure auto-quarantine se necessário

---

## Problemas de Autenticação

### Problema: Erro ao fazer login

**Causa 1: Senha incorreta**
- Verifique caps lock
- Use "Esqueci minha senha" se necessário

**Causa 2: Conta não confirmada**
- Verifique email de confirmação
- Se auto-confirm está habilitado, ignore este passo

**Causa 3: Conta suspensa**
- Contate administrador do tenant

---

### Problema: Não recebo email de confirmação

**Causa:** Auto-confirm pode estar habilitado.

**Verificação:**
```sql
-- Verifique configuração de auth:
SELECT * FROM auth.config;
```

**Solução:**
- Se auto-confirm = true: não precisa de email
- Se auto-confirm = false: verifique RESEND_API_KEY

---

### Problema: Token expirado

**Causa:** Session expirou após 7 dias (padrão).

**Solução:**
- Faça login novamente
- Token será renovado automaticamente

---

## Problemas com Email

### Problema: Emails não são enviados

**Causa 1: RESEND_API_KEY não configurado**

**Solução:**
1. Obtenha API key em [resend.com](https://resend.com)
2. Valide domínio em Resend Dashboard
3. Configure secret: `RESEND_API_KEY`

**Causa 2: Domínio não validado**

**Solução:**
1. Acesse [resend.com/domains](https://resend.com/domains)
2. Adicione registros DNS conforme instruções
3. Aguarde propagação (até 48h)
4. Verifique validação no dashboard

---

### Problema: Email vai para spam

**Solução:**
1. Configure SPF, DKIM e DMARC no DNS
2. Use domínio próprio (não `onboarding@resend.dev`)
3. Aqueça o domínio enviando poucos emails inicialmente
4. Evite palavras gatilho de spam

---

## Logs e Diagnóstico

### Ver logs das Edge Functions

**Via Lovable Cloud:**
1. Backend → Functions → [nome da função]
2. Clique em "Logs"
3. Filtre por erro ou período

**Via Supabase CLI:**
```bash
supabase functions logs send-welcome-email --tail
```

---

### Ver logs do banco de dados

```sql
-- Últimos erros:
SELECT * FROM postgres_logs
WHERE error_severity IN ('ERROR', 'FATAL')
ORDER BY timestamp DESC
LIMIT 50;

-- Audit logs:
SELECT * FROM audit_logs
WHERE success = false
ORDER BY created_at DESC
LIMIT 50;
```

---

### Ver logs do agente

**Windows:**
```powershell
# Event Viewer:
Get-EventLog -LogName Application -Source "CyberShieldAgent" -Newest 20
```

**Linux:**
```bash
# Journalctl:
sudo journalctl -u cybershield-agent -n 100 --no-pager

# Follow (tempo real):
sudo journalctl -u cybershield-agent -f
```

---

### Teste de conectividade completo

```bash
# 1. Teste DNS:
nslookup seu-projeto.supabase.co

# 2. Teste conectividade:
curl -v https://seu-projeto.supabase.co

# 3. Teste API:
curl https://seu-projeto.supabase.co/functions/v1/poll-jobs

# 4. Teste autenticação:
curl -X POST https://seu-projeto.supabase.co/functions/v1/poll-jobs \
  -H "X-Agent-Token: seu-token"
```

---

## ❓ Ainda com problemas?

### Checklist Final

- [ ] Agente está instalado e rodando?
- [ ] Token e secret estão corretos?
- [ ] Firewall permite HTTPS (443)?
- [ ] Agente consegue conectar no servidor?
- [ ] Jobs estão sendo criados e aprovados?
- [ ] Logs do agente mostram erros?
- [ ] Secrets necessários estão configurados?

### Obter Suporte

1. **Verifique FAQ:** [FAQ.md](./FAQ.md)
2. **Revise documentação:** [README.md](./README.md)
3. **Consulte secrets:** [SECRETS_DOCUMENTATION.md](./SECRETS_DOCUMENTATION.md)
4. **Colete informações:**
   - Versão do sistema operacional
   - Logs do agente (últimas 50 linhas)
   - Mensagem de erro completa
   - Passos para reproduzir

---

**Última atualização:** Janeiro 2025  
**Versão:** 1.0.0
