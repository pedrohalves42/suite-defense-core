# 🔐 Documentação de Secrets e Integrações

Este documento descreve todos os secrets necessários para cada funcionalidade do CyberShield.

## 📋 Índice

- [Secrets Obrigatórios](#secrets-obrigatórios)
- [Secrets Opcionais por Feature](#secrets-opcionais-por-feature)
- [Como Configurar Secrets](#como-configurar-secrets)

---

## Secrets Obrigatórios

Estes secrets são **necessários** para o funcionamento básico do CyberShield:

### ✅ Já Configurados Automaticamente

| Secret | Descrição | Status |
|--------|-----------|--------|
| `SUPABASE_URL` | URL do projeto Supabase | ✅ Auto-configurado |
| `SUPABASE_ANON_KEY` | Chave pública do Supabase | ✅ Auto-configurado |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço do Supabase | ✅ Auto-configurado |
| `SUPABASE_DB_URL` | URL de conexão do banco de dados | ✅ Auto-configurado |

---

## Secrets Opcionais por Feature

### 📧 Feature: Email de Boas-vindas e Convites

**Status:** ⚠️ Requer configuração manual

| Secret | Descrição | Como Obter | Necessário Para |
|--------|-----------|------------|-----------------|
| `RESEND_API_KEY` | Chave da API Resend | 1. Acesse [resend.com](https://resend.com)<br>2. Crie conta<br>3. Gere API Key em "API Keys"<br>4. Valide domínio em "Domains" | • Email de boas-vindas<br>• Convites de usuários<br>• Alertas por email |

**Como testar:**
```bash
# Email de boas-vindas é enviado automaticamente ao criar conta
# Teste criando uma nova conta em /signup
```

**Comportamento sem o secret:**
- ✅ Sistema continua funcionando
- ⚠️ Emails não serão enviados
- ℹ️ Erros de email são logados mas não quebram funcionalidades

---

### 🛡️ Feature: Scan de Vírus com VirusTotal

**Status:** ⚠️ Requer configuração manual

| Secret | Descrição | Como Obter | Necessário Para |
|--------|-----------|------------|-----------------|
| `VIRUSTOTAL_API_KEY` | Chave da API VirusTotal | 1. Acesse [virustotal.com](https://www.virustotal.com)<br>2. Crie conta gratuita<br>3. Vá em "Profile" → "API Key"<br>4. Copie a chave | • Scan de arquivos contra 70+ antivírus<br>• Detecção avançada de malware<br>• Análise de hashes de arquivos |

**Planos VirusTotal:**
- **Free:** 500 requests/dia, 4 requests/minuto
- **Premium:** Milhares de requests/dia

**Como testar:**
```bash
# Após configurar o secret, teste o scan:
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/scan-virus \
  -H "X-Agent-Token: SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_hash": "44d88612fea8a8f36de82e1278abb02f", "file_path": "/test/file.exe"}'
```

**Comportamento sem o secret:**
- ✅ Sistema continua funcionando
- ⚠️ Scans de vírus não funcionarão
- ℹ️ Retornará erro 503 "VirusTotal not configured"

---

### 💳 Feature: Pagamentos com Stripe

**Status:** ⚠️ Requer configuração manual (Futuro)

| Secret | Descrição | Como Obter | Necessário Para |
|--------|-----------|------------|-----------------|
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe | 1. Acesse [stripe.com](https://stripe.com)<br>2. Crie conta<br>3. Vá em "Developers" → "API keys"<br>4. Copie "Secret key" | • Processar pagamentos<br>• Gerenciar assinaturas<br>• Webhooks de cobrança |
| `STRIPE_WEBHOOK_SECRET` | Secret para validar webhooks | 1. Em Stripe Dashboard<br>2. "Developers" → "Webhooks"<br>3. Adicione endpoint<br>4. Copie "Signing secret" | • Validar webhooks do Stripe<br>• Atualizar status de assinatura |

**Status de implementação:**
- 🚧 Em planejamento
- Edge function `test-stripe-integration` existe para testes futuros

---

### 📢 Feature: Alertas por Webhook

**Status:** ✅ Funcional (configuração no Tenant Settings)

**Não requer secrets globais**, mas sim configuração por tenant:

| Configuração | Onde | Descrição |
|-------------|------|-----------|
| `alert_webhook_url` | Tenant Settings | URL para receber alertas em JSON |
| `enable_webhook_alerts` | Tenant Settings | Ativar/desativar webhooks |

**Eventos enviados:**
- Vírus detectado (positives > threshold)
- Jobs falhados consecutivos
- Agentes offline por muito tempo
- Anomalias de rede detectadas

**Formato do Payload:**
```json
{
  "event": "virus_detected",
  "severity": "critical",
  "tenant_id": "uuid",
  "agent_name": "AGENTE-01",
  "details": {
    "file_path": "/path/to/file",
    "positives": 5,
    "total": 70
  },
  "timestamp": "2025-01-08T12:00:00Z"
}
```

---

### 🔗 Feature: Alertas por Email

**Status:** ✅ Funcional (requer `RESEND_API_KEY`)

**Configuração por tenant:**

| Configuração | Onde | Descrição |
|-------------|------|-----------|
| `alert_email` | Tenant Settings | Email para receber alertas |
| `enable_email_alerts` | Tenant Settings | Ativar/desativar alertas |

**Alertas enviados:**
- ⚠️ Vírus detectado
- ❌ Jobs falhados
- 🔴 Agentes offline
- 🚨 Anomalias de segurança

---

## Como Configurar Secrets

### Via Lovable Cloud UI

1. Abra seu projeto no Lovable
2. Clique em "Backend" no menu
3. Vá em "Secrets"
4. Clique em "+ Add Secret"
5. Insira nome e valor
6. Clique em "Save"

### Via Supabase CLI (Desenvolvimento Local)

```bash
# Instale o Supabase CLI
npm install -g supabase

# Faça login
supabase login

# Link com seu projeto
supabase link --project-ref SEU_PROJECT_ID

# Configure secrets
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set VIRUSTOTAL_API_KEY="xxx"
```

### Verificar Secrets Configurados

```bash
# Liste secrets (apenas nomes, valores são ocultos)
supabase secrets list
```

---

## 🧪 Testando Integrações

### Teste VirusTotal Integration

```bash
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/test-virustotal-integration \
  -H "Authorization: Bearer SEU_SUPABASE_ANON_KEY"
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "VirusTotal integration configured correctly"
}
```

### Teste Stripe Integration (Futuro)

```bash
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/test-stripe-integration \
  -H "Authorization: Bearer SEU_SUPABASE_ANON_KEY"
```

---

## ⚠️ Segurança

### ✅ Boas Práticas

- **NUNCA** commite secrets no código
- Use secrets diferentes para dev/staging/prod
- Rotacione secrets regularmente
- Monitore uso de API keys
- Revogue imediatamente se comprometido

### ❌ Nunca Faça

- Compartilhar secrets em Slack/Discord/Email
- Colocar secrets em frontend (VITE_* vars)
- Usar mesma key em múltiplos projetos
- Hardcode secrets no código

---

## 📞 Suporte

**Problemas com secrets?**

1. Verifique se o secret está configurado: `supabase secrets list`
2. Confirme que o nome está correto (case-sensitive)
3. Aguarde 2-3 minutos após configurar (propagação)
4. Verifique logs da edge function: Backend → Functions → [função] → Logs

**Dúvidas sobre integrações?**

Consulte os guias específicos:
- [VIRUSTOTAL_SETUP.md](./VIRUSTOTAL_SETUP.md) - Setup detalhado do VirusTotal
- [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) - Solução de problemas gerais

---

## 📊 Resumo Rápido

| Feature | Secret Necessário | Status | Criticidade |
|---------|------------------|--------|-------------|
| Sistema Base | `SUPABASE_*` | ✅ Auto | 🔴 Crítico |
| Email | `RESEND_API_KEY` | ⚠️ Manual | 🟡 Importante |
| Scan Vírus | `VIRUSTOTAL_API_KEY` | ⚠️ Manual | 🟡 Importante |
| Pagamentos | `STRIPE_*` | 🚧 Futuro | 🟢 Opcional |
| Webhooks | N/A (tenant config) | ✅ Pronto | 🟢 Opcional |

---

**Última atualização:** Janeiro 2025  
**Versão:** 1.0.0
