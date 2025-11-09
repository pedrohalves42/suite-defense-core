# ❓ FAQ - Perguntas Frequentes

Respostas rápidas para as dúvidas mais comuns sobre o CyberShield.

## 📋 Índice

- [Geral](#geral)
- [Instalação](#instalação)
- [Segurança](#segurança)
- [Funcionalidades](#funcionalidades)
- [Preços](#preços)
- [Técnico](#técnico)

---

## Geral

### O que é o CyberShield?

CyberShield é uma plataforma de monitoramento e gestão de segurança que permite:
- ✅ Monitorar múltiplos endpoints (Windows/Linux)
- ✅ Executar scans de segurança remotamente
- ✅ Detectar vírus com VirusTotal (70+ antivírus)
- ✅ Gerenciar jobs e relatórios centralizados
- ✅ Multi-tenancy com controle de acesso (Admin/Operador/Visualizador)

### Para quem o CyberShield é indicado?

- 🏢 **Empresas** com múltiplos servidores
- 💻 **MSPs** (Managed Service Providers)
- 🔐 **Equipes de segurança** que precisam de visibilidade centralizada
- 🏥 **Setores regulados** (saúde, financeiro)
- 🏭 **Indústria** com sistemas críticos

### Qual a diferença para outras soluções?

| Recurso | CyberShield | Outros |
|---------|-------------|--------|
| **Preço** | Baseado em endpoints | Por usuário + endpoint |
| **Deploy** | Agente leve (< 10MB) | Agentes pesados (>100MB) |
| **Multi-tenancy** | Nativo | Geralmente não |
| **Open-source** | Sim | Geralmente não |
| **Auto-hospedado** | Possível | Raro |

---

## Instalação

### Quais sistemas operacionais são suportados?

**Windows:**
- ✅ Windows 10 (todas as versões)
- ✅ Windows 11 (todas as versões)
- ✅ Windows Server 2016+
- ⚙️ Requer PowerShell 5.1+ (já incluído)

**Linux:**
- ✅ Ubuntu 18.04+
- ✅ Debian 9+
- ✅ CentOS/RHEL 7+
- ✅ Amazon Linux 2
- ⚙️ Requer `bash`, `curl`, `jq`

### Quanto tempo leva a instalação?

- ⏱️ **Download do script:** 10 segundos
- ⏱️ **Execução e enrollment:** 30 segundos
- ⏱️ **Primeiro heartbeat:** 1-2 minutos
- **Total:** ~3 minutos por agente

### Preciso de acesso Administrator/root?

**Sim, mas apenas para instalação:**
- Windows: Requer "Executar como Administrador"
- Linux: Requer `sudo` ou `root`

**Após instalado:**
- Serviço roda em background
- Não requer intervenção manual

### Posso instalar em múltiplos servidores automaticamente?

**Sim!** Use automação:

**Windows (PowerShell Remoting):**
```powershell
$servers = @("server1", "server2", "server3")
$servers | ForEach-Object {
  Invoke-Command -ComputerName $_ -FilePath .\cybershield-agent-windows.ps1 `
    -ArgumentList "token", "secret", "https://api.cybershield.com"
}
```

**Linux (Ansible):**
```yaml
- hosts: all
  tasks:
    - name: Install CyberShield Agent
      shell: |
        curl -O https://seu-site.com/cybershield-agent-linux.sh
        chmod +x cybershield-agent-linux.sh
        ./cybershield-agent-linux.sh --agent-token "{{ token }}" \
          --hmac-secret "{{ secret }}" \
          --server-url "{{ server_url }}"
```

---

## Segurança

### Os dados são criptografados?

**Sim!**
- ✅ **Em trânsito:** TLS 1.3 (HTTPS)
- ✅ **Em repouso:** Criptografia AES-256 no banco
- ✅ **Autenticação:** HMAC-SHA256 para cada request
- ✅ **Secrets:** Armazenados em vault seguro

### Como funciona a autenticação do agente?

**HMAC (Hash-based Message Authentication Code):**
1. Cada agente tem um `token` e `secret` únicos
2. Cada request é assinado com HMAC-SHA256
3. Servidor valida assinatura antes de aceitar
4. Inclui timestamp e nonce para prevenir replay attacks

**Replay protection:**
- Assinaturas expiram após 5 minutos
- Nonces são verificados (não podem ser reutilizados)

### O agente tem acesso root/admin no sistema?

**Não!** O agente:
- ✅ Roda com privilégios mínimos necessários
- ✅ Apenas lê dados de segurança
- ❌ Não pode modificar arquivos do sistema
- ❌ Não pode executar comandos arbitrários

**Apenas jobs explicitamente aprovados são executados.**

### Como revogar acesso de um agente?

1. **No dashboard:** Agentes → [agente] → Desativar
2. **No servidor:** Pare o serviço
   ```bash
   # Windows:
   Stop-Service CyberShieldAgent
   
   # Linux:
   sudo systemctl stop cybershield-agent
   ```
3. **Token é invalidado imediatamente**

### Posso auditar todas as ações?

**Sim!** Audit logs registram:
- 👤 Quem fez a ação (user_id)
- 🕐 Quando (timestamp)
- 🔧 O que foi feito (action)
- 📊 Resultado (success/failure)
- 🌐 IP e User-Agent

**Acesso:** Dashboard → Admin → Audit Logs

---

## Funcionalidades

### O que é um "Job"?

Um **job** é uma tarefa que você cria para ser executada no agente:
- `scan` - Scan de segurança genérico
- `update` - Atualização de software
- `report` - Gerar relatório
- `config` - Mudar configuração

**Fluxo:**
1. Você cria o job no dashboard
2. Job fica "queued" (na fila)
3. Agente faz poll e recebe o job
4. Agente executa e envia resultado
5. Job é marcado como "completed"

### Como funciona o scan de vírus?

**VirusTotal Integration:**
1. Agente calcula SHA256 hash do arquivo
2. Envia hash para sua API CyberShield
3. API consulta VirusTotal (70+ antivírus)
4. Resultado é armazenado no banco
5. Dashboard mostra detecção

**Você precisa:**
- API key do VirusTotal (gratuita ou paga)
- Configurar secret `VIRUSTOTAL_API_KEY`

**Limites:**
- Free: 500 scans/dia
- Premium: Milhares de scans/dia

### Posso criar meus próprios tipos de job?

**Sim!** Edite o código do agente:

**Windows (`cybershield-agent-windows.ps1`):**
```powershell
function Execute-Job {
  param($JobId, $JobType, $Payload)
  
  switch($JobType) {
    "meu_custom_job" {
      # Seu código aqui
      return @{ success = $true; data = "resultado" }
    }
  }
}
```

**Linux (`cybershield-agent-linux.sh`):**
```bash
execute_job() {
  case "$job_type" in
    "meu_custom_job")
      # Seu código aqui
      echo '{"success": true, "data": "resultado"}'
      ;;
  esac
}
```

### Como recebo alertas?

**2 métodos:**

**1. Email:**
- Configure `RESEND_API_KEY`
- Em Tenant Settings: adicione `alert_email`
- Ative `enable_email_alerts`

**2. Webhook:**
- Em Tenant Settings: adicione `alert_webhook_url`
- Ative `enable_webhook_alerts`
- Receba JSON em tempo real

**Alertas enviados:**
- 🦠 Vírus detectado
- ❌ Jobs falhados
- 🔴 Agentes offline
- 🚨 Anomalias de rede

---

## Preços

### Quanto custa o CyberShield?

**Modelo:** Baseado em número de endpoints

| Plano | Endpoints | Preço/mês | Recursos |
|-------|-----------|-----------|----------|
| **Starter** | Até 10 | R$ 99 | Básico |
| **Professional** | Até 50 | R$ 399 | + VirusTotal |
| **Business** | Até 200 | R$ 999 | + Prioridade |
| **Enterprise** | Ilimitado | Sob consulta | + Suporte 24/7 |

### Posso testar gratuitamente?

**Sim!** 14 dias grátis, sem cartão de crédito:
- ✅ Até 5 agentes
- ✅ Todas as funcionalidades
- ✅ Sem compromisso

### O que acontece se eu ultrapassar o limite?

- 📧 Recebe aviso por email
- ⏰ 7 dias para fazer upgrade
- 🚫 Após 7 dias, agentes extras param de conectar

**Nenhum dado é perdido!**

### Aceita qual forma de pagamento?

- 💳 Cartão de crédito (via Stripe)
- 🏦 Boleto bancário (Brasil)
- 💵 Transferência bancária (Enterprise)

---

## Técnico

### Em qual linguagem o CyberShield é feito?

**Frontend:**
- React + TypeScript
- Vite
- TailwindCSS
- Shadcn/ui

**Backend:**
- Supabase (PostgreSQL + Edge Functions)
- Deno (TypeScript runtime)

**Agentes:**
- Windows: PowerShell
- Linux: Bash

### Posso auto-hospedar?

**Sim!** O CyberShield é open-source:

1. Clone o repositório
2. Configure Supabase local
3. Deploy frontend
4. Customize conforme necessário

**Requer:**
- Node.js 18+
- Supabase CLI
- Docker (para Supabase local)

### Qual o limite de agentes/jobs?

**Limites técnicos (não de plano):**
- ✅ Agentes: Ilimitado (testado até 10.000+)
- ✅ Jobs simultâneos: ~1.000/min
- ✅ Scans VirusTotal: Limitado por sua API key
- ✅ Armazenamento: Ilimitado

**Performance:**
- Latência média: < 100ms
- Uptime: 99.9%
- Backup: Diário automático

### Tem API para integração?

**Sim!** REST API completa:

**Endpoints principais:**
- `POST /enroll-agent` - Matricular agente
- `POST /create-job` - Criar job
- `GET /list-reports` - Listar relatórios
- `POST /scan-virus` - Scan de arquivo

**Autenticação:**
- JWT para usuários
- HMAC para agentes

**Documentação:** [API_DOCS.md](./API_DOCS.md)

### Suporta LDAP/SSO?

**Atualmente:**
- ✅ Email + senha
- ✅ Convites por email
- ✅ Multi-tenancy

**Em desenvolvimento (Q1 2025):**
- 🚧 SAML 2.0
- 🚧 OAuth 2.0 (Google, Microsoft)
- 🚧 LDAP/Active Directory

---

## 📞 Mais Perguntas?

**Não encontrou sua resposta?**

- 📖 **Documentação completa:** [README.md](./README.md)
- 🔧 **Troubleshooting:** [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md)
- 🔐 **Secrets:** [SECRETS_DOCUMENTATION.md](./SECRETS_DOCUMENTATION.md)
- 📧 **Contato:** Use o formulário na landing page

---

**Última atualização:** Janeiro 2025  
**Versão:** 1.0.0
