# Runbook: Onboarding de Novo Tenant

**Severidade**: Operacional
**Meta**: < 5 minutos (automatizado)
**Escalacao**: Se falhar apos 2 tentativas

---

## Fluxo Normal (Automatizado)

1. Usuario cria conta via formulario de registro
2. Email de verificacao enviado
3. Usuario confirma email e faz login
4. Tenant criado automaticamente via trigger `handle_new_user`
5. Profile associado ao tenant
6. Plano trial ativado (`create-trial-subscription`)
7. Welcome email enviado (`notification-router` -> `welcome`)

---

## Verificacao de Onboarding Completo

```sql
-- Verificar tenant criado
SELECT t.id, t.name, t.plan, t.status, t.created_at
FROM tenants t
JOIN profiles p ON p.tenant_id = t.id
WHERE p.id = '<user_id>';

-- Verificar profile
SELECT id, full_name, email, role, tenant_id, status
FROM profiles
WHERE id = '<user_id>';

-- Verificar subscription
SELECT id, tenant_id, plan_id, status, trial_ends_at
FROM subscriptions
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC LIMIT 1;
```

---

## Problemas Comuns

### Tenant nao criado

**Causa**: Trigger `handle_new_user` falhou
**Resolucao**:
1. Verificar logs da trigger
2. Criar tenant manualmente se necessario
3. Associar profile ao tenant

### Email de verificacao nao chegou

**Causa**: Configuracao de email, spam, rate limit
**Resolucao**:
1. Verificar logs do provedor de email
2. Reenviar via painel admin
3. Confirmar email manualmente (apenas em emergencia)

### Trial nao ativado

**Causa**: `create-trial-subscription` falhou
**Resolucao**:
1. Chamar funcao manualmente
2. Verificar se Stripe customer foi criado
3. Criar subscription trial manualmente

### Welcome email nao enviado

**Causa**: `notification-router` falhou
**Resolucao**: Nao bloqueante. Reenviar via admin.

---

## Checklist de Verificacao

- [ ] Tenant existe e status = `active`
- [ ] Profile existe com role correta
- [ ] Subscription trial ativa
- [ ] Email de boas-vindas enviado
- [ ] Enrollment key padrao gerada (se aplicavel)
- [ ] Quotas do plano configuradas

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Ops | Versao inicial |
