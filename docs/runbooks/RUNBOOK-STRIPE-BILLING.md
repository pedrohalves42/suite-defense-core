# Runbook: Falhas de Billing / Stripe

**Severidade**: Media-Alta
**Meta MTTR**: < 1 hora
**Escalacao**: Se afeta cobranca de multiplos tenants

---

## Sintomas

- Webhook do Stripe nao processado
- Subscription desatualizada no banco
- Checkout session falhando
- Customer portal inacessivel
- Trial nao convertendo para paid
- Invoice nao gerada

---

## Diagnostico Rapido

### 1. Verificar Webhook Deliveries

```sql
SELECT id, event_type, status, created_at, error_message
FROM stripe_webhook_events
ORDER BY created_at DESC
LIMIT 20;
```

### 2. Verificar Status da Subscription

```sql
SELECT s.id, s.tenant_id, s.status, s.plan_id,
       s.current_period_start, s.current_period_end,
       s.trial_ends_at, s.stripe_subscription_id
FROM subscriptions s
WHERE s.tenant_id = '<tenant_id>'
ORDER BY s.created_at DESC;
```

### 3. Verificar Saude do Endpoint

Testar manualmente:
```bash
curl -X POST <SUPABASE_URL>/functions/v1/stripe-health-check \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

---

## Procedimento de Resolucao

### Webhook nao Processado

1. Verificar assinatura do webhook (Stripe secret)
2. Verificar logs de `stripe-webhook`
3. Reprocessar evento manualmente se necessario

### Subscription Desatualizada

1. Comparar status no Stripe Dashboard vs banco local
2. Chamar `sync-stripe-subscriptions` para sincronizar
3. Verificar se webhook de `customer.subscription.updated` chegou

### Trial Expirado sem Conversao

1. Verificar `check-trial-expiration` executando
2. Verificar se notificacoes de trial foram enviadas
3. Atualizar status manualmente se necessario

---

## Prevencao

| Controle | Frequencia | Funcao |
|----------|-----------|--------|
| Sync de subscriptions | Diario | sync-stripe-subscriptions |
| Health check Stripe | A cada 6h | stripe-health-check |
| Verificacao de trial | Diario | check-trial-expiration |
| Reminder de trial | 3/7/14 dias | send-trial-reminder |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Ops | Versao inicial |
