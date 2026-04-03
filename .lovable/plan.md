
# Plano Fase 6 — Monetização + Eficiência Operacional

## Pré-requisitos: Verificações iniciais
- Verificar estado atual dos tenants (Genial Cred, Pedro Alves, tenant teste)
- Verificar preços Stripe existentes no código
- Verificar quota.ts e enroll-agent atuais

---

## FASE 1: Corte de custos (já feito ✅)
- honeypot-dispatch-ai desabilitado ✅
- honeypot-check-alerts reduzido para 1x/hora ✅
- honeypot-update-agent-timestamps reduzido para 1x/hora ✅
- migrate-*-batch reduzido para */30 ✅

---

## FASE 2: Monetização (URGENTE)

### 2A. Migration: Criar tabela `subscriptions`
- Campos: tenant_id, stripe_customer_id, stripe_subscription_id, plan (free/starter/business), status, current_period_end, agent_limit, created_at, updated_at
- RLS: admins do tenant podem ler, service_role pode escrever
- Inserir registros free para todos os 16 tenants existentes

### 2B. Edge Functions: create-checkout + check-subscription
- `create-checkout`: Cria sessão Stripe com price_id do plano escolhido
- `check-subscription`: Verifica status da assinatura no Stripe

### 2C. Enforçar limite free tier no enroll-agent
- Verificar count de agentes ativos do tenant
- Se tier=free e agentes >= 2, bloquear com erro 403
- Se tier=starter e agentes >= 10, bloquear
- Se tier=business e agentes >= 30, bloquear

### 2D. Desativar agentes excedentes (Genial Cred + Pedro Alves + tenant teste)
- Marcar agentes excedentes como `is_active = false` (manter os 2 mais recentes)
- Registrar em audit_logs

---

## FASE 3: Rotação de segredos

### 3A. Criar cron semanal `rotate-audit`
- Verificar idade de hmac_secret, enrollment_keys, agent_tokens
- Registrar no secret_rotation_log
- Disparar alerta se credencial > 90 dias

### 3B. Ampliar integrity-sentinel-6h
- Incluir checks de rotação de credenciais no sentinel existente

---

## FASE 4: Taxa de falha de jobs

### 4A. Pre-validation no poll-jobs/job-claimer
- Skip de jobs para agentes com failure rate > 50% nos últimos 7 dias
- Desabilitar job types com failure rate global > 40%

### 4B. Dashboard de métricas de jobs por tipo
- Componente no admin mostrando success/failure rate por job_type

---

## FASE 5: Consolidação de Edge Functions (84 → <65)

### 5A. Mover funções simples para gateways existentes
- translate-cve → api-gateway
- calculate-compliance → api-gateway
- export-evidence-bundle → api-gateway
- action-center-feed → api-gateway

### 5B. Mover funções públicas para ops-gateway
- fido2-authenticate, validate-invite, get-reinstall-by-name, serve-installer

---

## FASE 6: Observabilidade

### 6A. Dashboard de custo por tenant
- Componente admin: agentes, jobs/mês, eventos/mês, custo estimado, plano
- Alerta automático para tenant outlier (>5 agentes free ou >500 jobs/dia)

---

## FASE 7: Precificação

### 7A. Banner de upgrade no frontend
- Quando tenant free tenta adicionar 3º agente, mostrar banner "Upgrade para Starter R$499/mês"

### 7B. Configurar preços no Stripe
- Starter: R$499/mês (10 agentes)
- Business: R$899/mês (30 agentes)

---

## Ordem de execução
1. ✅ Corte de crons (já feito)
2. Migration: tabela subscriptions
3. Enforçar limites no enroll-agent + desativar excedentes
4. Edge functions de billing (create-checkout, check-subscription)
5. Rotação de segredos (cron rotate-audit)
6. Pre-validation de jobs
7. Consolidação de edge functions
8. Dashboard de custo + observabilidade
9. Banner de upgrade + pricing Stripe
