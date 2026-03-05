# Mapa de Integrações de Terceiros

| Campo | Valor |
|-------|-------|
| **Código** | TIM-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CTO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |

---

## 1. Objetivo

Documentar todas as integrações com serviços de terceiros, avaliando riscos e controles de segurança para cada integração.

---

## 2. Inventário de Integrações

### 2.1 CyberShield Cloud (Supabase)

| Aspecto | Detalhe |
|---------|--------|
| **Tipo** | Infraestrutura core (PaaS) |
| **Serviços Utilizados** | PostgreSQL, Edge Functions, Auth (GoTrue), Storage, Realtime |
| **Dados Compartilhados** | Todos os dados da plataforma |
| **Autenticação** | Service Role Key + JWT |
| **Localização** | EUA (AWS us-east-1) |
| **DPA** | Sim (Supabase DPA) |
| **Certificações** | SOC 2 Type II |
| **Nível de Risco** | Alto (dependência crítica) |
| **Controles** | RLS, criptografia E2E, monitoramento contínuo |
| **Plano de Contingência** | DRP-001 |

### 2.2 Stripe

| Aspecto | Detalhe |
|---------|--------|
| **Tipo** | Processamento de pagamentos |
| **Serviços Utilizados** | Checkout, Subscriptions, Webhooks, Customer Portal |
| **Dados Compartilhados** | Email, nome do titular, dados de pagamento (tokenizados) |
| **Autenticação** | API Key (secret) + Webhook Signature |
| **Localização** | Global (EUA HQ) |
| **DPA** | Sim (Stripe DPA) |
| **Certificações** | PCI-DSS Level 1, SOC 2 Type II |
| **Nível de Risco** | Médio |
| **Controles** | Webhook signature verification, secrets em Vault |
| **Plano de Contingência** | Pagamentos manuais temporários |

### 2.3 GitHub Actions

| Aspecto | Detalhe |
|---------|--------|
| **Tipo** | CI/CD para build de agentes |
| **Serviços Utilizados** | Actions (workflow), Artifacts |
| **Dados Compartilhados** | Hash de scripts, metadados de build, artefatos compilados |
| **Autenticação** | GitHub Token (GITHUB_TOKEN) |
| **Localização** | Global |
| **DPA** | Sim (GitHub DPA) |
| **Certificações** | SOC 2, ISO 27001 |
| **Nível de Risco** | Médio (supply chain) |
| **Controles** | Ed25519 assinatura pós-build, hash verification, pinned actions |
| **Plano de Contingência** | Build manual local |

---

## 3. Matriz de Risco por Integração

| Integração | Disponibilidade | Integridade | Confidencialidade | Risco Total |
|-----------|:--------------:|:-----------:|:-----------------:|:-----------:|
| CyberShield Cloud | 🟠 Alto | 🟢 Baixo | 🟡 Médio | 🟠 Alto |
| Stripe | 🟡 Médio | 🟢 Baixo | 🟡 Médio | 🟡 Médio |
| GitHub Actions | 🟡 Médio | 🟡 Médio | 🟢 Baixo | 🟡 Médio |

---

## 4. Fluxo de Dados por Integração

```
[Agente Windows] 
  → TLS 1.3 + HMAC →
    [CyberShield Cloud Edge Functions]
      → RLS →
        [CyberShield Cloud PostgreSQL]
          ↔ [Stripe] (pagamentos)
          ← [GitHub Actions] (builds assinados)
```

---

## 5. Avaliação de Vendor Lock-in

| Integração | Lock-in | Alternativas | Esforço de Migração |
|-----------|:-------:|-------------|:-------------------:|
| CyberShield Cloud | Alto | AWS/GCP + Supabase self-hosted | 3-6 meses |
| Stripe | Baixo | PagSeguro, Mercado Pago | 2-4 semanas |
| GitHub Actions | Baixo | GitLab CI, Jenkins | 1-2 semanas |

---

## 6. Revisão

- Integrações revisadas **trimestralmente**
- Novos serviços requerem avaliação de risco antes da adoção
- Certificações de terceiros verificadas anualmente

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Engineering | Versão inicial — 3 integrações mapeadas |
