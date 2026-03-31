# SLA/SLO — Acordo de Nível de Serviço

| Campo | Valor |
|-------|-------|
| **Código** | SLA-001 |
| **Versao** | 2.0 |
| **Status** | Aprovado |
| **Data Efetiva** | 2026-03-31 |
| **Revisao** | 2026-09-30 |
| **Referencia SLO** | docs/slos/SLO_DEFINITIONS.md |

---

## 1. Objetivo

Definir os indicadores de nível de serviço (SLIs), objetivos (SLOs) e acordos (SLAs) da plataforma CyberShield.

---

## 2. Definições

| Termo | Definição |
|-------|-----------|
| **SLI** (Service Level Indicator) | Métrica quantitativa de performance do serviço |
| **SLO** (Service Level Objective) | Meta interna de performance |
| **SLA** (Service Level Agreement) | Compromisso contratual com o cliente |
| **Uptime** | Percentual de tempo em que o serviço está operacional |
| **Downtime Planejado** | Manutenção agendada com aviso prévio de 48h (não conta como indisponibilidade) |

---

## 3. SLAs por Plano

### 3.1 Disponibilidade (Uptime)

| Métrica | Starter | Business | Enterprise |
|---------|---------|----------|-----------|
| **Uptime Mensal** | 99.5% | 99.9% | 99.95% |
| **Downtime Máximo/mês** | 3h 39min | 43min | 21min |
| **Janela de Manutenção** | Dom 02:00-06:00 BRT | Dom 03:00-05:00 BRT | Coordenada |

### 3.2 Suporte

| Métrica | Starter | Business | Enterprise |
|---------|---------|----------|-----------|
| **Tempo de 1ª Resposta (P0)** | 4h | 1h | 15min |
| **Tempo de 1ª Resposta (P1)** | 8h | 4h | 1h |
| **Tempo de 1ª Resposta (P2)** | 24h | 8h | 4h |
| **Tempo de 1ª Resposta (P3)** | 48h | 24h | 8h |
| **Canais** | Email | Email + Chat | Email + Chat + Telefone |
| **Horário** | Comercial (9-18 BRT) | Estendido (8-22 BRT) | 24/7 |

### 3.3 Performance

| SLI | SLO | SLA |
|-----|-----|-----|
| **Latência API (p95)** | < 200ms | < 500ms |
| **Heartbeat Processing** | < 2s | < 5s |
| **Job Delivery (poll-jobs)** | < 1s | < 3s |
| **Dashboard Load Time** | < 2s | < 5s |
| **Alert Notification Delay** | < 30s | < 2min |

### 3.4 Dados e Agentes

| SLI | SLO | SLA |
|-----|-----|-----|
| **Data Durability** | 99.999% | 99.99% |
| **Agent Heartbeat Success Rate** | > 99.5% | > 99% |
| **Job Execution Success Rate** | > 99% | > 98% |
| **Backup Recovery Time** | < 1h | < 4h |

---

## 4. Créditos de Serviço

### 4.1 Tabela de Créditos (Business e Enterprise)

| Uptime Mensal | Crédito |
|:-------------:|:-------:|
| 99.0% - 99.9% | 10% do valor mensal |
| 95.0% - 99.0% | 25% do valor mensal |
| < 95.0% | 50% do valor mensal |

### 4.2 Condições
- Créditos aplicados na fatura seguinte
- Solicitação deve ser feita em até 30 dias após o incidente
- Não acumulável com outros descontos
- Crédito máximo: 50% do valor mensal

### 4.3 Exclusões
Não contam como indisponibilidade:
- Manutenção planejada (com aviso de 48h)
- Força maior (desastres naturais, ataques em massa à infraestrutura)
- Falhas na infraestrutura do cliente
- Ações do cliente que violem os Termos de Serviço

---

## 5. Monitoramento e Relatórios

### 5.1 Status Page
- URL: status.cybershield.com.br
- Atualização em tempo real
- Histórico de incidentes

### 5.2 Relatórios Mensais (Business/Enterprise)
- Uptime efetivo
- Métricas de performance
- Incidentes e resoluções
- Tendências e recomendações

---

## 6. Escalação

| Nível | Tempo sem Resolução | Escalado para |
|-------|:-------------------:|---------------|
| L1 | 0 | Suporte técnico |
| L2 | 2h (P0) / 8h (P1) | Engenharia |
| L3 | 4h (P0) / 24h (P1) | CTO |
| L4 | 8h (P0) | CEO |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Product | Versão inicial |
