# 🔧 CyberShield - Guia de Configuração (Setup)

> Guia passo a passo para configuração do ambiente CyberShield

**Versão:** 1.0.0  
**Última atualização:** 2026-02-08

---

## 📋 Índice

1. [Requisitos de Sistema](#1-requisitos-de-sistema)
2. [Instalação do Dashboard](#2-instalação-do-dashboard)
3. [Configuração do Supabase/Cloud](#3-configuração-do-supabasecloud)
4. [Configuração de Variáveis de Ambiente](#4-configuração-de-variáveis-de-ambiente)
5. [Configuração de Autenticação](#5-configuração-de-autenticação)
6. [Configuração de Integrações](#6-configuração-de-integrações)
7. [Deploy de Edge Functions](#7-deploy-de-edge-functions)
8. [Instalação de Agentes](#8-instalação-de-agentes)
9. [Verificação de Saúde](#9-verificação-de-saúde)
10. [Configurações Avançadas](#10-configurações-avançadas)

---

## 1. Requisitos de Sistema

### Dashboard (Frontend)

| Componente | Requisito Mínimo | Recomendado |
|------------|------------------|-------------|
| **Node.js** | 18.0.0 | 20.x LTS |
| **npm** | 9.0.0 | 10.x |
| **Memória RAM** | 4 GB | 8 GB |
| **Disco** | 1 GB livre | 5 GB livre |

### Navegadores Suportados

| Navegador | Versão Mínima |
|-----------|---------------|
| Chrome | 100+ |
| Firefox | 100+ |
| Safari | 15+ |
| Edge | 100+ |

### Agentes de Endpoint

| Plataforma | Requisito |
|------------|-----------|
| **Windows** | Windows 10/11, Server 2016+ |
| **macOS** | Catalina 10.15+ |
| **Linux** | Ubuntu 20.04+, RHEL 8+ |

### Requisitos de Rede

```
Portas de saída:
- 443 (HTTPS) - Comunicação com API
- 53 (DNS) - Resolução DNS (para DNS Filtering)

Domínios a liberar:
- *.supabase.co
- *.cybershield-audit.lovable.app
```

---

## 2. Instalação do Dashboard

### Clone e Instalação

```bash
# 1. Clone o repositório
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Verifique versões
node --version  # >= 18.0.0
npm --version   # >= 9.0.0

# 3. Instale dependências
npm install

# 4. Copie template de ambiente
cp .env.example .env
```

### Estrutura do Projeto

```
├── src/
│   ├── components/     # Componentes React
│   ├── hooks/          # Custom hooks
│   ├── pages/          # Páginas/rotas
│   ├── integrations/   # Supabase client
│   └── lib/            # Utilitários
├── supabase/
│   ├── functions/      # Edge Functions
│   └── migrations/     # Migrações SQL
├── docs/               # Documentação
├── tools/              # Scripts de diagnóstico
└── scripts/            # Scripts de validação
```

### Iniciar em Desenvolvimento

```bash
# Modo desenvolvimento
npm run dev

# Acesse
open http://localhost:8080
```

### Build de Produção

```bash
# Build otimizado
npm run build

# Preview do build
npm run preview
```

---

## 3. Configuração do Supabase/Cloud

O CyberShield utiliza **Lovable Cloud** como backend, que é alimentado por Supabase.

### Informações do Projeto

```
Project ID: iavbnmduxpxhwubqrzzn
Região: São Paulo (sa-east-1)
URL: https://iavbnmduxpxhwubqrzzn.supabase.co
```

### Acessar Backend

No Lovable, clique em **Cloud** → **View Backend** para acessar:
- Database (Tabelas, Views, Functions)
- Edge Functions (Logs, Deployment)
- Storage (Buckets de arquivos)
- Authentication (Usuários, Configurações)

### Configurar RLS (Row Level Security)

```sql
-- Verificar RLS habilitado em tabelas críticas
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Deve retornar 't' (true) para todas as tabelas com dados sensíveis
```

---

## 4. Configuração de Variáveis de Ambiente

### Arquivo .env

O arquivo `.env` é **gerado automaticamente** pelo Lovable Cloud. Não edite manualmente.

```bash
# Variáveis auto-gerenciadas (NÃO EDITAR)
VITE_SUPABASE_PROJECT_ID="iavbnmduxpxhwubqrzzn"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGc..."
VITE_SUPABASE_URL="https://iavbnmduxpxhwubqrzzn.supabase.co"

# Turnstile (Cloudflare CAPTCHA) - Configurar manualmente
VITE_TURNSTILE_SITE_KEY="sua_chave_aqui"
```

### Variáveis de Edge Functions (Secrets)

Secrets são configurados via Lovable Cloud > Secrets:

| Secret | Descrição | Obrigatório |
|--------|-----------|-------------|
| `RESEND_API_KEY` | API para envio de emails | Sim |
| `TELEGRAM_BOT_TOKEN` | Notificações Telegram | Não |
| `VIRUSTOTAL_API_KEY` | Integração VirusTotal | Não |
| `STRIPE_SECRET_KEY` | Pagamentos (produção) | Sim* |

*Obrigatório para funcionalidades de billing

### Configurar um Secret

1. Acesse Lovable Cloud > Secrets
2. Clique em **Add Secret**
3. Insira nome (ex: `RESEND_API_KEY`) e valor
4. Secrets ficam disponíveis automaticamente nas Edge Functions

---

## 5. Configuração de Autenticação

### Métodos de Autenticação

| Método | Status | Configuração |
|--------|--------|--------------|
| Email/Password | ✅ Ativo | Padrão |
| Magic Link | ✅ Ativo | Via email |
| Google OAuth | ⚙️ Opcional | Requer configuração |
| Microsoft/Azure | ⚙️ Opcional | Requer configuração |

### Configurar Google OAuth

1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Crie um projeto ou selecione existente
3. Ative **Google+ API** e **OAuth consent screen**
4. Crie credenciais OAuth 2.0:
   - Tipo: Aplicativo Web
   - Origens autorizadas: `https://cybershield-audit.lovable.app`
   - URIs de redirecionamento: `https://iavbnmduxpxhwubqrzzn.supabase.co/auth/v1/callback`
5. No Lovable Cloud, vá em Authentication > Providers > Google
6. Cole **Client ID** e **Client Secret**

### Políticas de Senha

```sql
-- Configuração padrão (via Supabase Auth)
-- Mínimo 8 caracteres
-- Requer letras e números
-- Máximo 3 tentativas antes de bloqueio
```

### Email Templates

Personalize em Authentication > Email Templates:
- Confirmação de conta
- Reset de senha
- Magic Link
- Convite de equipe

---

## 6. Configuração de Integrações

### Cloudflare Turnstile (CAPTCHA)

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Vá em **Turnstile** > **Add Site**
3. Configure:
   - Widget type: Managed
   - Domains: `cybershield-audit.lovable.app`, `localhost`
4. Copie **Site Key** para `VITE_TURNSTILE_SITE_KEY`
5. Copie **Secret Key** para secret `TURNSTILE_SECRET_KEY`

### Resend (Email)

1. Acesse [Resend](https://resend.com)
2. Crie uma conta e verifique seu domínio
3. Gere uma API Key
4. Configure secret `RESEND_API_KEY`

### Stripe (Pagamentos)

1. Acesse [Stripe Dashboard](https://dashboard.stripe.com)
2. Obtenha chaves em Developers > API Keys:
   - **Publishable key**: Usar no frontend
   - **Secret key**: Configurar como secret
3. Configure Webhooks:
   - URL: `https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.*`

### VirusTotal

1. Acesse [VirusTotal](https://www.virustotal.com)
2. Crie conta e obtenha API Key em API Key settings
3. Configure secret `VIRUSTOTAL_API_KEY`

---

## 7. Deploy de Edge Functions

### Deploy Automático

Edge Functions são deployadas automaticamente pelo Lovable quando o código é salvo.

### Verificar Deploy

```bash
# Listar funções deployadas
# Via Lovable Cloud > Edge Functions

# Testar função
curl -X POST \
  https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/health \
  -H "Authorization: Bearer ANON_KEY"
```

### Logs de Edge Functions

1. Acesse Lovable Cloud > Edge Functions
2. Selecione a função desejada
3. Visualize logs em tempo real

### Funções Críticas

| Função | Descrição | Tipo |
|--------|-----------|------|
| `enroll-agent` | Registro de novos agentes | Agent |
| `heartbeat` | Heartbeat de agentes | Agent |
| `poll-jobs` | Polling de jobs | Agent |
| `submit-job-result` | Submissão de resultados | Agent |
| `stripe-webhook` | Webhooks Stripe | Billing |
| `run-rls-tests` | Testes de RLS (cron) | Security |

---

## 8. Instalação de Agentes

### Windows

```powershell
# 1. Execute como Administrador
# 2. Baixe o instalador
Invoke-WebRequest -Uri "https://cybershield-audit.lovable.app/download/windows" -OutFile "CyberShield-Setup.exe"

# 3. Execute com enrollment key
.\CyberShield-Setup.exe /EnrollmentKey=YOUR_KEY /Silent
```

### macOS

```bash
# 1. Baixe o instalador
curl -O https://cybershield-audit.lovable.app/download/macos/CyberShield.pkg

# 2. Instale
sudo installer -pkg CyberShield.pkg -target /

# 3. Configure enrollment
sudo /opt/cybershield/bin/cybershield-agent --enroll YOUR_KEY
```

### Linux

```bash
# Ubuntu/Debian
curl -fsSL https://cybershield-audit.lovable.app/download/linux/install.sh | sudo bash -s -- --enrollment-key YOUR_KEY

# RHEL/CentOS
sudo yum install -y cybershield-agent
sudo systemctl enable cybershield-agent
sudo cybershield-agent --enroll YOUR_KEY
```

### Verificar Instalação

```bash
# Windows
Get-Service CyberShieldAgent

# macOS/Linux
systemctl status cybershield-agent

# Verificar no Dashboard
# Agents > Listar agentes recém-instalados
```

---

## 9. Verificação de Saúde

### Checklist de Deploy

```bash
# 1. Validação de código
npm run validate:system

# 2. Sincronização de agent script
npm run sync:agent

# 3. Verificar sincronização
npm run validate:sync

# 4. Executar testes
npm run test
```

### Health Checks

```sql
-- Verificar agentes ativos (últimos 5 minutos)
SELECT COUNT(*) as active_agents 
FROM agents 
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes';

-- Verificar jobs stuck
SELECT COUNT(*) as stuck_jobs 
FROM jobs 
WHERE status = 'delivered' 
AND delivered_at < NOW() - INTERVAL '1 hour';

-- Verificar erros recentes
SELECT event_type, COUNT(*) 
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
AND event_type LIKE '%error%'
GROUP BY event_type;
```

### Monitoramento

Dashboards disponíveis:
- **Admin > Dashboard**: Visão geral
- **Admin > Agentes**: Status de agentes
- **Admin > Jobs**: Pipeline de jobs
- **Super Admin > System**: Métricas de sistema

---

## 10. Configurações Avançadas

### Multi-Tenancy

```sql
-- Criar novo tenant
SELECT create_tenant_with_admin(
  'empresa-nova',
  'Empresa Nova LTDA',
  'admin@empresa.com'
);
```

### Políticas de Segurança

```sql
-- Criar política de scan automático
INSERT INTO security_policies (tenant_id, name, type, config) VALUES 
('tenant-uuid', 'Auto Scan Policy', 'scan', 
 '{"frequency": "daily", "paths": ["C:\\Users"], "exclude": ["*.tmp"]}'
);
```

### Cron Jobs

```sql
-- Verificar cron jobs configurados
SELECT * FROM cron.job ORDER BY jobname;

-- Jobs críticos que devem estar ativos:
-- - heartbeat-cleanup (limpa heartbeats antigos)
-- - job-timeout-check (detecta jobs stuck)
-- - rls-test-runner (testes de segurança)
-- - security-cleanup (limpeza de logs)
```

### Backup e Recuperação

```sql
-- Backup de configurações críticas
SELECT * FROM tenants;
SELECT * FROM enrollment_keys WHERE is_active = true;
SELECT * FROM security_policies;

-- Restauração feita via Lovable Cloud > Database > Backups
```

---

## Próximos Passos

1. ✅ Complete a configuração inicial
2. 📋 Revise [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
3. 🔧 Consulte [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para problemas
4. 🛡️ Leia [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md)
5. 📊 Configure alertas em Admin > Notificações

---

## Suporte

| Canal | Disponibilidade |
|-------|-----------------|
| Email | suporte@cybershield.com |
| Chat | Dashboard > Suporte |
| Documentação | docs.cybershield.com |
| Status | status.cybershield.com |
