# Matriz de Avaliação de Riscos

| Campo | Valor |
|-------|-------|
| **Código** | RAM-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CISO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |

---

## 1. Objetivo

Identificar, avaliar e priorizar riscos de segurança da informação para a plataforma CyberShield, definindo planos de tratamento adequados.

---

## 2. Metodologia

### 2.1 Escala de Probabilidade

| Nível | Valor | Descrição |
|:-----:|:-----:|-----------|
| Muito Baixa | 1 | Improvável (< 1% ao ano) |
| Baixa | 2 | Possível (1-10% ao ano) |
| Média | 3 | Provável (10-50% ao ano) |
| Alta | 4 | Muito provável (50-90% ao ano) |
| Muito Alta | 5 | Quase certo (> 90% ao ano) |

### 2.2 Escala de Impacto

| Nível | Valor | Financeiro | Operacional | Reputacional | Legal/LGPD |
|:-----:|:-----:|-----------|-------------|-------------|-----------|
| Insignificante | 1 | < R$ 1k | < 1h downtime | Sem impacto | Sem violação |
| Menor | 2 | R$ 1k-10k | 1-4h downtime | Reclamação isolada | Aviso ANPD |
| Moderado | 3 | R$ 10k-100k | 4-24h downtime | Perda de clientes | Multa leve |
| Significativo | 4 | R$ 100k-1M | 1-7d downtime | Mídia negativa | Multa significativa |
| Catastrófico | 5 | > R$ 1M | > 7d downtime | Perda de confiança total | Multa máxima (2% faturamento) |

### 2.3 Matriz de Risco (Probabilidade × Impacto)

|  | Insignificante (1) | Menor (2) | Moderado (3) | Significativo (4) | Catastrófico (5) |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **Muito Alta (5)** | 5 🟡 | 10 🟠 | 15 🔴 | 20 🔴 | 25 🔴 |
| **Alta (4)** | 4 🟢 | 8 🟡 | 12 🟠 | 16 🔴 | 20 🔴 |
| **Média (3)** | 3 🟢 | 6 🟡 | 9 🟠 | 12 🟠 | 15 🔴 |
| **Baixa (2)** | 2 🟢 | 4 🟢 | 6 🟡 | 8 🟡 | 10 🟠 |
| **Muito Baixa (1)** | 1 🟢 | 2 🟢 | 3 🟢 | 4 🟢 | 5 🟡 |

🟢 Baixo (1-4) | 🟡 Médio (5-9) | 🟠 Alto (10-14) | 🔴 Crítico (15-25)

---

## 3. Registro de Riscos

### 3.1 Riscos Operacionais

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-----------|:------:|
| OP-001 | Indisponibilidade da plataforma | 2 | 4 | 8 🟡 | Mitigar | SLA Cloud, DRP, monitoramento | ✅ |
| OP-002 | Falha em Edge Function crítica | 3 | 3 | 9 🟠 | Mitigar | Retry, fallback, circuit breaker | ✅ |
| OP-003 | Perda de dados por falha de backup | 1 | 5 | 5 🟡 | Mitigar | Backup diário, PITR 7d, teste semestral | ✅ |
| OP-004 | Sobrecarga do banco de dados | 2 | 3 | 6 🟡 | Mitigar | Índices, query optimization, limites | ✅ |

### 3.2 Riscos de Segurança

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-----------|:------:|
| SEC-001 | Vazamento cross-tenant (RLS bypass) | 1 | 5 | 5 🟡 | Mitigar | RLS 100%, security_invoker views, CI guard | ✅ |
| SEC-002 | Supply chain attack (agente comprometido) | 1 | 5 | 5 🟡 | Mitigar | Ed25519, SHA-256, TOCTOU | ✅ |
| SEC-003 | Roubo de credenciais do banco | 1 | 4 | 4 🟢 | Mitigar | Hash-only storage, Vault, RLS | ✅ |
| SEC-004 | Execução de comando malicioso | 1 | 5 | 5 🟡 | Mitigar | Ed25519 fail-closed, circuit breaker | ✅ |
| SEC-005 | Escalada de privilégio | 1 | 4 | 4 🟢 | Mitigar | RBAC backend, RLS, SECURITY DEFINER | ✅ |
| SEC-006 | Replay attack | 1 | 3 | 3 🟢 | Mitigar | HMAC nonce, timestamp window | ✅ |
| SEC-007 | DDoS na plataforma | 2 | 3 | 6 🟡 | Mitigar | Rate limiting, CDN, ip_blocklist | ✅ |

### 3.3 Riscos de Compliance

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-----------|:------:|
| CMP-001 | Violação LGPD (multa ANPD) | 1 | 5 | 5 🟡 | Mitigar | RIPD, ROPA, DPO, PDP-001 | ✅ |
| CMP-002 | Retenção excessiva de dados | 2 | 3 | 6 🟡 | Mitigar | Política de retenção, TTL automático | ✅ |
| CMP-003 | Falha na notificação de incidente | 1 | 4 | 4 🟢 | Mitigar | PRI com SLAs, playbooks | ✅ |

### 3.4 Riscos de Negócio

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-----------|:------:|
| BIZ-001 | Churn elevado (> 10%) | 2 | 3 | 6 🟡 | Mitigar | NPS, onboarding, suporte proativo | 🔄 |
| BIZ-002 | Dependência de provedor único (Cloud) | 2 | 4 | 8 🟡 | Aceitar | Monitorar, avaliar multi-cloud futuro | 🔄 |
| BIZ-003 | Concorrente com preço agressivo | 3 | 2 | 6 🟡 | Aceitar | Diferenciação por segurança/LGPD | 🔄 |

---

## 4. Apetite de Risco

| Categoria | Nível Aceitável | Ação Necessária |
|-----------|:--------------:|-----------------|
| 🟢 Baixo (1-4) | Aceitar | Monitorar |
| 🟡 Médio (5-9) | Mitigar | Controles implementados |
| 🟠 Alto (10-14) | Mitigar urgente | Ação em até 30 dias |
| 🔴 Crítico (15-25) | Inaceitável | Ação imediata |

---

## 5. Revisão

- Riscos revisados **trimestralmente**
- Novos riscos avaliados a cada mudança significativa
- Post-mortem de incidentes atualiza a matriz

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security | Versão inicial — 17 riscos mapeados |
