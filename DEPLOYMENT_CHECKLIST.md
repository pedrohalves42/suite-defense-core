# 🚀 Deployment Checklist - CyberShield

Este checklist garante deploys seguros e sem problemas em produção.

---

## 📋 PRÉ-DEPLOY

### Código e Testes
- [ ] Todos os testes E2E passando localmente (`npx playwright test`)
- [ ] Build local sem erros (`npm run build`)
- [ ] Nenhum console.error no código de produção
- [ ] Code review aprovado (se aplicável)
- [ ] Branches sincronizadas (merge de develop para main)

### Database
- [ ] Linter do Supabase sem erros críticos
- [ ] Migrations testadas em ambiente de staging
- [ ] RLS policies validadas
- [ ] Índices necessários criados
- [ ] Backup manual do banco de dados criado

### Edge Functions
- [ ] Todas as funções listadas no `supabase/config.toml`
- [ ] `track-installation-event` configurado
- [ ] `serve-installer` testado localmente
- [ ] Logging adequado em todas as funções
- [ ] Error handling padronizado

### Environment Variables
- [ ] `VITE_TURNSTILE_SITE_KEY` configurado
- [ ] Todas as secrets configuradas no Supabase:
  - [ ] `VIRUSTOTAL_API_KEY`
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `RESEND_API_KEY`
  - [ ] `INTERNAL_FUNCTION_SECRET`
  - [ ] `TURNSTILE_SECRET_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`

### Segurança
- [ ] Leaked Password Protection ativado no Supabase Auth
- [ ] Password strength requirements configurados
- [ ] Rate limiting testado
- [ ] Input validation em todos os endpoints
- [ ] CAPTCHA funcionando corretamente

### CI/CD
- [ ] GitHub Actions workflows atualizados
- [ ] Secrets configurados no GitHub:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_TURNSTILE_SITE_KEY`
  - [ ] `TEST_ADMIN_EMAIL`
  - [ ] `TEST_ADMIN_PASSWORD`
  - [ ] `SUPER_ADMIN_EMAIL`
  - [ ] `SUPER_ADMIN_PASSWORD`

---

## 🚀 DEPLOY

### 1. Backup
```bash
# Criar backup do banco de dados
# Via Supabase Dashboard: Database > Backups > Create Backup
```

### 2. Database Migrations
```bash
# Aplicar migrations via Supabase CLI ou Dashboard
supabase db push
```

### 3. Edge Functions
```bash
# Functions são deployadas automaticamente via Lovable
# Verificar status em: Supabase Dashboard > Edge Functions
```

### 4. Frontend
```bash
# Build e deploy do frontend via Lovable
# Clicar em "Publish" > "Update"
```

### 5. Verificação Imediata
- [ ] Site acessível (https://seu-dominio.com)
- [ ] Login funcionando
- [ ] Dashboard carregando
- [ ] Nenhum erro no console do browser

---

## ✅ PÓS-DEPLOY

### Smoke Tests (5-10 minutos após deploy)

#### Frontend
- [ ] Login com usuário admin
- [ ] Login com usuário regular
- [ ] Criar novo agente
- [ ] Visualizar dashboard
- [ ] Acessar Analytics de Instalação

#### Agent Installation
- [ ] Gerar novo instalador via UI
- [ ] Download do instalador funciona
- [ ] Comando one-click funciona
- [ ] Agent envia heartbeat após instalação

#### Payments (se aplicável)
- [ ] Criar checkout session
- [ ] Webhook de teste funciona
- [ ] Customer portal acessível

### Monitoramento (15-30 minutos após deploy)

#### Logs
```bash
# Verificar logs das edge functions
# Via Supabase Dashboard: Edge Functions > Logs
```
- [ ] Nenhum erro crítico nos logs
- [ ] Heartbeats sendo recebidos
- [ ] Jobs sendo executados

#### Métricas
- [ ] Taxa de erro < 1%
- [ ] Tempo de resposta médio < 500ms
- [ ] Nenhum timeout
- [ ] Agents online estáveis

#### Database
- [ ] Query performance aceitável
- [ ] Nenhum deadlock
- [ ] Connections pool saudável
- [ ] RLS funcionando corretamente

### Alertas e Notificações
- [ ] Emails de alerta funcionando
- [ ] Alertas de segurança ativos
- [ ] Notificações de sistema funcionando

### Validação Completa (1 hora após deploy)
- [ ] Nenhum bug crítico reportado
- [ ] Nenhum rollback necessário
- [ ] Feedback positivo de usuários (se aplicável)
- [ ] Métricas estáveis

---

## 🔥 ROLLBACK PLAN

### Quando fazer rollback:
- Taxa de erro > 5%
- Bug crítico afetando funcionalidade principal
- Perda de dados detectada
- Vulnerabilidade de segurança descoberta

### Como fazer rollback:

#### 1. Database
```bash
# Restaurar backup via Supabase Dashboard
# Database > Backups > Restore
```

#### 2. Edge Functions
```bash
# Reverter para versão anterior no Lovable
# Settings > History > Restore
```

#### 3. Frontend
```bash
# Reverter deployment no Lovable
# Settings > History > Restore
```

#### 4. Notificação
- [ ] Notificar equipe sobre rollback
- [ ] Documentar motivo do rollback
- [ ] Criar issue para correção

---

## 📊 MÉTRICAS DE SUCESSO

### Primeira Hora
- ✅ 0 erros críticos
- ✅ Taxa de sucesso > 99%
- ✅ Tempo de resposta < 500ms
- ✅ Agents conectando normalmente

### Primeiro Dia
- ✅ Nenhum rollback necessário
- ✅ Feedback positivo de usuários
- ✅ Métricas de uso estáveis
- ✅ Nenhum incident reportado

### Primeira Semana
- ✅ 99.9% uptime
- ✅ 0 security incidents
- ✅ Performance melhorada ou mantida
- ✅ Usuários satisfeitos

---

## 📝 PÓS-MORTEM (se houver problemas)

### Template de Documentação
```markdown
## Incident Report: [TÍTULO]

**Data**: [DATA E HORA]
**Severidade**: [CRÍTICA/ALTA/MÉDIA/BAIXA]
**Duração**: [TEMPO]

### O que aconteceu?
[Descrição detalhada]

### Causa raiz
[Análise da causa]

### Impacto
- Usuários afetados: [NÚMERO]
- Funcionalidades afetadas: [LISTA]
- Tempo de inatividade: [MINUTOS]

### Ações tomadas
1. [AÇÃO 1]
2. [AÇÃO 2]
3. [AÇÃO 3]

### Prevenção futura
- [ ] [AÇÃO PREVENTIVA 1]
- [ ] [AÇÃO PREVENTIVA 2]
- [ ] [AÇÃO PREVENTIVA 3]

### Lessons learned
[O que aprendemos]
```

---

## 🔗 LINKS ÚTEIS

- **Supabase Dashboard**: https://supabase.com/dashboard/project/iavbnmduxpxhwubqrzzn
- **Lovable Project**: [SEU LINK]
- **Production URL**: [SEU DOMÍNIO]
- **Status Page**: [SE TIVER]

---

## 📞 CONTATOS DE EMERGÊNCIA

**Administrador Principal**: [NOME/EMAIL]  
**Equipe de Desenvolvimento**: [CONTATO]  
**Suporte Supabase**: https://supabase.com/support  
**Suporte Lovable**: https://discord.com/channels/1119885301872070706

---

**Última atualização**: 2025-11-11  
**Versão**: 2.1.0
