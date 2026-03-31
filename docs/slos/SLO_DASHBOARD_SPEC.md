# Especificacao: Dashboard de SLOs

| Campo | Valor |
|-------|-------|
| **Codigo** | SLO-DASH-001 |
| **Versao** | 1.0 |
| **Data** | 2026-03-31 |

---

## 1. Objetivo

Especificar os componentes visuais necessarios para o dashboard de SLOs, alimentado pela Edge Function `sli-collector` e tabelas de metricas.

---

## 2. Componentes

### 2.1 Indicadores de Disponibilidade

| Componente | Tipo | Dados |
|------------|------|-------|
| API Uptime (30d) | Gauge | % de requests sem 5xx |
| Dashboard Uptime (30d) | Gauge | % de checks com sucesso |
| Agent Connectivity (30d) | Gauge | % de heartbeats recebidos |
| Job Success Rate (30d) | Gauge | % de jobs completados |

### 2.2 Error Budget

| Componente | Tipo | Dados |
|------------|------|-------|
| Budget restante (API) | Progress bar | Budget calculado |
| Budget restante (Heartbeat) | Progress bar | Budget calculado |
| Budget burn rate | Line chart | Consumo ao longo do mes |

### 2.3 Latencia

| Componente | Tipo | Dados |
|------------|------|-------|
| Latencia por funcao (p50/p95/p99) | Table + sparkline | Top 10 funcoes |
| Latencia historica | Line chart | 7/30 dias |
| Distribuicao de latencia | Histogram | Por funcao |

### 2.4 Incidentes

| Componente | Tipo | Dados |
|------------|------|-------|
| Incidentes abertos | Counter + lista | security_events |
| MTTR medio | Metric card | Calculado |
| Timeline de incidentes | Timeline | 30 dias |

---

## 3. Fontes de Dados

| Tabela/View | Uso |
|-------------|-----|
| `sli_metrics` | Metricas agregadas |
| `v_cron_silence` | Alertas de cron |
| `security_events` | Incidentes |
| `agent_telemetry` | Heartbeat stats |
| `jobs` | Job success rate |

---

## 4. Atualizacao

| Componente | Frequencia |
|------------|-----------|
| Gauges de disponibilidade | 5 min |
| Error budget | 15 min |
| Latencia | 5 min |
| Incidentes | Tempo real (realtime) |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Engineering | Versao inicial |
