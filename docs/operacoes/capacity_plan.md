# Plano de Capacidade

| Campo | Valor |
|-------|-------|
| **Código** | CAP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CTO / Infraestrutura |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2026-09-05 (semestral) |
| **Critério SOC 2** | CC7.1, CC7.4 |

---

## 1. Objetivo

Documentar projeções de crescimento de infraestrutura (storage, compute, rede) e definir limiares de escalabilidade para garantir desempenho adequado à medida que a base de agentes e tenants cresce.

---

## 2. Baseline Atual (Q1 2026)

### 2.1 Infraestrutura

| Recurso | Capacidade Atual | Utilização | Headroom |
|---------|:---------------:|:----------:|:--------:|
| CPU (Edge Functions) | Auto-scaling | ~30% | 70% |
| RAM (Edge Functions) | Auto-scaling | ~25% | 75% |
| Banco de dados (PostgreSQL) | 8 GB | ~2 GB (25%) | 6 GB |
| Storage (backups) | 50 GB | ~10 GB (20%) | 40 GB |
| Conexões DB simultâneas | 60 | ~15 (25%) | 45 |
| Bandwidth mensal | 100 GB | ~20 GB (20%) | 80 GB |

### 2.2 Volume de Dados

| Tabela / Categoria | Registros Atuais | Crescimento/Mês | Projeção 12 meses |
|-------------------|:----------------:|:----------------:|:-----------------:|
| agents | ~500 | +50 | ~1.100 |
| job_executions | ~10.000 | +2.000 | ~34.000 |
| audit_logs | ~50.000 | +10.000 | ~170.000 |
| agent_system_metrics | ~100.000 | +30.000 | ~460.000 |
| security_events | ~5.000 | +1.000 | ~17.000 |
| tenants | ~10 | +2 | ~34 |

---

## 3. Projeções de Crescimento

### 3.1 Cenários

| Cenário | Agentes | Tenants | Execuções/dia | Storage DB |
|---------|:-------:|:-------:|:-------------:|:----------:|
| **Conservador** | 1.000 | 20 | 500 | 5 GB |
| **Esperado** | 2.500 | 50 | 2.000 | 15 GB |
| **Agressivo** | 10.000 | 200 | 10.000 | 60 GB |

### 3.2 Pontos de Inflexão

| Métrica | Limiar de Alerta | Ação Necessária |
|---------|:----------------:|----------------|
| Agentes ativos | > 2.000 | Avaliar particionamento de tabelas |
| Execuções/dia | > 5.000 | Otimizar queries, considerar read replicas |
| Storage DB | > 50% capacidade | Upgrade de plano ou archival |
| Conexões simultâneas | > 70% | Connection pooling, PgBouncer |
| Latência P95 de API | > 500ms | Otimização de queries, caching |
| Tamanho de backup | > 100 GB | Archival de dados antigos |

---

## 4. Estratégias de Escalabilidade

### 4.1 Banco de Dados

| Fase | Trigger | Ação |
|------|---------|------|
| Fase 1 (atual) | < 2.000 agentes | Instância única, índices otimizados |
| Fase 2 | 2.000 – 5.000 agentes | Read replicas, connection pooling |
| Fase 3 | 5.000 – 20.000 agentes | Particionamento por tenant_id, archival |
| Fase 4 | > 20.000 agentes | Sharding ou banco por região |

### 4.2 Edge Functions

| Fase | Trigger | Ação |
|------|---------|------|
| Fase 1 (atual) | < 1.000 req/min | Auto-scaling padrão |
| Fase 2 | 1.000 – 5.000 req/min | Otimização de cold starts |
| Fase 3 | > 5.000 req/min | Cache layer, rate limiting avançado |

### 4.3 Storage

| Tipo | Estratégia de Crescimento |
|------|--------------------------|
| Dados quentes (< 90 dias) | Disco SSD principal |
| Dados mornos (90 dias – 1 ano) | Compressão + storage padrão |
| Dados frios (> 1 ano) | Archival para storage de baixo custo |
| Backups | Object storage com lifecycle rules |

---

## 5. Políticas de Retenção (Impacto em Capacidade)

| Tipo de Dado | Retenção | Estratégia de Archival |
|-------------|----------|----------------------|
| agent_system_metrics | 1 ano | Agregação mensal após 90 dias |
| job_executions | 2 anos | Move para cold storage após 1 ano |
| audit_logs | 7 anos | Compressão após 1 ano |
| security_events | 7 anos | Compressão após 1 ano |
| Dados de agentes inativos | 90 dias após inatividade | Archival automático |

---

## 6. Monitoramento de Capacidade

### 6.1 Métricas Monitoradas

| Métrica | Frequência | Alerta |
|---------|-----------|--------|
| CPU utilization | Contínuo | > 70% por 5 min |
| Memory utilization | Contínuo | > 80% por 5 min |
| Disk usage | Horário | > 70% |
| DB connections | Contínuo | > 80% do pool |
| Query latency P95 | Contínuo | > 500ms |
| Backup size growth | Diário | > 20% vs média |

### 6.2 Revisão de Capacidade

| Frequência | Atividade | Responsável |
|-----------|-----------|------------|
| Semanal | Dashboard review | DevOps |
| Mensal | Análise de tendências | CTO + DevOps |
| Trimestral | Revisão formal + projeções | CTO + Engenharia |
| Anual | Planejamento de orçamento de infra | CTO + CEO |

---

## 7. Orçamento de Infraestrutura

### 7.1 Custos Projetados

| Componente | Custo Atual/mês | Projeção 12 meses/mês |
|-----------|:--------------:|:--------------------:|
| Banco de dados | $25 | $49 – $99 |
| Edge Functions | $0 (free tier) | $25 – $50 |
| Storage | $5 | $10 – $25 |
| Bandwidth | $0 (free tier) | $10 – $25 |
| Monitoramento | $0 | $0 – $20 |
| **Total** | **~$30** | **$94 – $219** |

---

## 8. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Monitoramento | Dashboards de infraestrutura | Métricas contínuas |
| Alertas | Limiares configurados | Seção 6.1 |
| Projeções | Documento de capacidade | Este documento |
| Revisão | Cronograma definido | Seção 6.2 |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Engineering | Versão inicial |
