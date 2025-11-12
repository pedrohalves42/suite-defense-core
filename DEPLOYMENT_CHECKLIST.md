# Checklist de Prontidão para Produção

## ✅ Pré-Deploy

### Build e Compilação
- [ ] `npm run build` executa sem erros
- [ ] `npm run lint` retorna 0 erros
- [ ] `tsc --noEmit` passa sem erros TypeScript

### Testes
- [ ] `npm test` passa com 0 falhas
- [ ] Cobertura de testes ≥ 85% (verificar com `npm run test:coverage`)
- [ ] E2E tests passam 3 vezes consecutivas:
  ```bash
  npx playwright test --workers=1
  RANDOM_SEED=12345 npx playwright test --workers=1
  npx playwright test --workers=1 --shard=1/1
  ```

### Segurança
- [ ] `npm audit --audit-level=high` sem CVEs críticas
- [ ] Supabase Linter sem warnings críticos
- [ ] RLS policies revisadas e funcionais
- [ ] Todas as secrets configuradas corretamente
- [ ] Leaked Password Protection ativado
- [ ] Rate limiting configurado em todos os endpoints públicos

### Variáveis de Ambiente
- [ ] `.env.example` atualizado com todas as variáveis
- [ ] Sem segredos hardcoded no código
- [ ] Variáveis de produção configuradas no Supabase

### Banco de Dados
- [ ] Todas as migrations aplicadas
- [ ] Backup recente do banco de dados
- [ ] RLS habilitado em todas as tabelas sensíveis
- [ ] Índices criados para queries frequentes

## 🚀 Deploy

### Execução
- [ ] Build de produção gerado
- [ ] Edge functions deployadas
- [ ] DNS configurado (se aplicável)
- [ ] SSL/TLS configurado

### Validação Pós-Deploy
- [ ] Health check endpoint responde 200
- [ ] Login/Signup funciona
- [ ] Agent enrollment funciona
- [ ] Checkout Stripe funciona
- [ ] Webhooks Stripe validam assinatura

## 🔍 Verificação Pós-Deploy

### Smoke Tests (15 min)
```bash
# Auth flow
- Criar conta
- Fazer login
- Logout

# Agent flow
- Gerar instalador
- Simular heartbeat
- Verificar métricas

# Payment flow
- Iniciar checkout
- Simular webhook
- Verificar atualização de plano
```

### Logs e Monitoramento
- [ ] Logs de edge functions sem erros
- [ ] Postgres logs sem erros PGRST116 ou 42P17
- [ ] Supabase dashboard sem alertas
- [ ] Rate limit não está bloqueando usuários legítimos

### Performance
- [ ] Tempo de resposta das páginas < 3s
- [ ] Edge functions respondem em < 1s
- [ ] Heartbeats processados sem delay

## 🔄 Rollback Plan

### Se algo der errado:

1. **Imediato (< 5 min):**
   - Restaurar versão anterior do código
   - Reverter edge functions: usar Supabase dashboard

2. **Database (< 15 min):**
   - Reverter última migration se necessário
   - Restaurar backup do banco

3. **Comunicação:**
   - Notificar usuários se downtime > 5 min
   - Atualizar status page (se houver)

## 📊 Métricas de Sucesso

### Primeira Hora
- [ ] 0 erros 500 no Supabase
- [ ] 0 webhooks Stripe falhando
- [ ] Agents conectando normalmente

### Primeira 24h
- [ ] Taxa de erro < 1%
- [ ] Nenhum incidente crítico
- [ ] Feedback positivo dos usuários

## 🐛 Troubleshooting Rápido

### Usuários não conseguem fazer login
1. Verificar Supabase Auth logs
2. Verificar RLS policies em `profiles` e `user_roles`
3. Verificar se email auto-confirm está ativado

### Agents não conectam
1. Verificar `heartbeat` edge function logs
2. Verificar HMAC secrets
3. Verificar enrollment keys válidas

### Checkout não funciona
1. Verificar STRIPE_SECRET_KEY
2. Verificar STRIPE_WEBHOOK_SECRET
3. Verificar logs do webhook
4. Testar com Stripe CLI: `stripe listen --forward-to <webhook-url>`

### Dashboard não carrega
1. Verificar console do navegador
2. Verificar network tab (erro 500?)
3. Verificar `get-agent-dashboard-data` logs
4. Verificar se tenant_id está sendo resolvido

## 📝 Documentação

- [ ] README.md atualizado
- [ ] API docs atualizadas (se houver)
- [ ] Changelog atualizado
- [ ] Guias de troubleshooting atualizados

---

**Data da última verificação:** _____________________

**Responsável:** _____________________

**Próxima revisão:** _____________________
