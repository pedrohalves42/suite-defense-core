# Definicoes de SLO/SLI — CyberShield Platform

| Campo | Valor |
|-------|-------|
| **Codigo** | SLO-001 |
| **Versao** | 1.0 |
| **Status** | Aprovado |
| **Data Efetiva** | 2026-03-31 |
| **Revisao** | 2026-06-30 |
| **Referencia** | docs/compliance/SLA_SLO.md |

---

## 1. SLIs (Service Level Indicators)

### 1.1 Disponibilidade

| SLI | Definicao | Fonte de Dados |
|-----|-----------|---------------|
| **API Availability** | % de requests HTTP que retornam status != 5xx | Edge Function logs |
| **Dashboard Availability** | % de tempo que o dashboard carrega em <5s | Synthetic monitoring |
| **Agent Connectivity** | % de heartbeats recebidos vs esperados | agent_telemetry |
| **Job Processing** | % de jobs que transitam de pending -> completed | jobs table |

### 1.2 Latencia

| SLI | Definicao | Fonte de Dados |
|-----|-----------|---------------|
| **API Latency (p50)** | Mediana de latencia de Edge Functions | Edge Function logs |
| **API Latency (p95)** | Percentil 95 de latencia | Edge Function logs |
| **API Latency (p99)** | Percentil 99 de latencia | Edge Function logs |
| **Heartbeat Processing** | Tempo de processamento do heartbeat | heartbeat logs |
| **Job Delivery** | Tempo entre criacao e entrega do job ao agente | jobs table |
| **Dashboard Load** | Tempo de carregamento inicial do dashboard | Frontend metrics |

### 1.3 Corretude

| SLI | Definicao | Fonte de Dados |
|-----|-----------|---------------|
| **Data Integrity** | % de execution chains validas | agent_execution_chain |
| **Tenant Isolation** | % de queries que respeitam RLS | run-rls-tests |
| **Alert Accuracy** | % de alertas que sao verdadeiros positivos | security_events |

### 1.4 Freshness

| SLI | Definicao | Fonte de Dados |
|-----|-----------|---------------|
| **Telemetry Freshness** | Idade maxima de dados de telemetria | agent_telemetry |
| **Compliance Score** | Idade do ultimo calculo de compliance | compliance_scores |
| **Vulnerability Data** | Idade da ultima sincronizacao de CVEs | cve_database |

---

## 2. SLOs (Service Level Objectives)

### 2.1 Disponibilidade

| Servico | SLO (30 dias) | Budget de Erro | Janela de Medicao |
|---------|---------------|----------------|-------------------|
| **API (Edge Functions)** | 99.9% | 43 min/mes | Rolling 30 dias |
| **Dashboard** | 99.5% | 3h 39min/mes | Rolling 30 dias |
| **Agent Heartbeat** | 99.5% | 3h 39min/mes | Rolling 30 dias |
| **Job Processing** | 99.0% | 7h 18min/mes | Rolling 30 dias |

### 2.2 Latencia

| Servico | SLO (p95) | SLO (p99) | Janela |
|---------|-----------|-----------|--------|
| **heartbeat** | < 200ms | < 500ms | Rolling 7 dias |
| **poll-jobs** | < 150ms | < 400ms | Rolling 7 dias |
| **submit-job-result** | < 300ms | < 800ms | Rolling 7 dias |
| **enroll-agent** | < 500ms | < 1.5s | Rolling 7 dias |
| **Dashboard load** | < 2s | < 5s | Rolling 7 dias |
| **AI functions** | < 10s | < 30s | Rolling 7 dias |
| **Reports** | < 30s | < 60s | Rolling 7 dias |

### 2.3 Corretude

| Metrica | SLO | Janela |
|---------|-----|--------|
| **Tenant isolation** | 100% | Sempre |
| **Execution chain integrity** | 99.99% | Rolling 30 dias |
| **HMAC validation accuracy** | 100% | Sempre |
| **RLS enforcement** | 100% | Sempre |

### 2.4 Freshness

| Metrica | SLO | Janela |
|---------|-----|--------|
| **Telemetry age** | < 5 min | Rolling 24h |
| **Compliance score age** | < 24h | Rolling 7 dias |
| **CVE data age** | < 48h | Rolling 7 dias |

---

## 3. Error Budget Policy

### 3.1 Niveis de Acao

| Budget Restante | Acao |
|-----------------|------|
| > 50% | Operacao normal, deploys permitidos |
| 25-50% | Alerta, revisar deploys, aumentar monitoramento |
| 10-25% | Congelar features, focar em confiabilidade |
| < 10% | Congelar deploys, apenas hotfixes criticos |
| 0% | Incidente, ativar resposta |

### 3.2 Calculo do Budget

```
Error Budget = 1 - SLO

Exemplo para API (99.9%):
  Budget = 0.1% = 43 min/mes
  Se ja consumiu 30 min em incidentes = 30/43 = 69.8% consumido
  Budget restante = 30.2%
  Acao: Alerta, revisar deploys
```

---

## 4. Monitoramento

### 4.1 Fontes de Dados

| Fonte | Metrica | Frequencia |
|-------|---------|-----------|
| Edge Function logs | Latencia, erros, volume | Tempo real |
| `sli-collector` | Agregacao de SLIs | A cada 5 min |
| `check-production-health` | Saude geral | A cada 5 min |
| `health-monitor` | Saude de servicos | A cada 10 min |
| `v_cron_silence` | Cron jobs silenciosos | Continuo |
| Agent heartbeats | Conectividade | A cada heartbeat |

### 4.2 Alertas

| Alerta | Condicao | Canal | Severidade |
|--------|----------|-------|------------|
| API Availability < 99.5% (1h) | > 0.5% erros em 1h | Email + Telegram | Alta |
| Heartbeat failure > 5% | > 5% de heartbeats falhando | Telegram | Alta |
| Latency p95 > 1s | p95 acima de 1s por 5 min | Email | Media |
| Error budget < 25% | Budget mensal abaixo de 25% | Email + Telegram | Alta |
| Cron silence | Job nao executou 2x intervalo | Telegram | Media |
| RLS test failure | Qualquer teste falhando | Email + Telegram | Critica |

---

## 5. Reporting

### 5.1 Relatorio Mensal (Automatizado)

Conteudo:
- Uptime efetivo por servico
- Latencia p50/p95/p99 por funcao critica
- Error budget consumido
- Incidentes e impacto
- Top 5 funcoes com mais erros
- Top 5 queries mais lentas
- Tendencias e recomendacoes

### 5.2 Relatorio Trimestral (SOC 2)

Conteudo adicional:
- Evidencias de controles
- Resultados de testes de invariantes
- Auditoria de RLS
- Rotacao de chaves
- Pen test results

---

## 6. Revisao de SLOs

| Frequencia | Escopo | Participantes |
|-----------|--------|---------------|
| Mensal | Metricas e budget | Engineering + Ops |
| Trimestral | Targets e alertas | Engineering + Produto |
| Anual | SLAs contratuais | Engineering + Produto + Legal |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Engineering | Versao inicial |
