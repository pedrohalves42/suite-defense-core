# Plano de Validação de MVP — CyberShield

| Campo | Valor |
|-------|-------|
| **Documento** | VAL-001 (Validation Plan) |
| **Versão** | 1.0 |
| **Data** | 2026-03-11 |
| **Horizonte** | 90 dias (Q2 2026) |
| **Baseline** | Dados de produção em 2026-03-11 |

---

## 1. Objetivo

Definir **critérios numéricos** claros para declarar o MVP como validado e pronto para a fase de crescimento. Cada métrica tem um valor atual (baseline), uma meta de sucesso e uma meta stretch.

---

## 2. Framework de Validação

O MVP é validado em **5 dimensões**. Cada dimensão tem peso e critérios numéricos específicos.

| Dimensão | Peso | Descrição |
|----------|:----:|-----------|
| **Tração Comercial** | 30% | Clientes pagantes, receita, churn |
| **Engajamento de Produto** | 25% | Uso ativo, feature adoption, retention |
| **Confiabilidade Técnica** | 20% | Uptime, job success, error rates |
| **Diferencial Competitivo** | 15% | Evidence chain, compliance, SOAR |
| **Operacional** | 10% | Automação, monitoramento, custo |

**Regra de validação**: MVP validado quando ≥ 4 de 5 dimensões atingem a **Meta de Sucesso**.

---

## 3. Métricas por Dimensão

### 3.1 Tração Comercial (Peso: 30%)

| KPI | Baseline | Meta de Sucesso | Meta Stretch | Como Medir |
|-----|:--------:|:---------------:|:------------:|------------|
| **Clientes pagantes** | 4 | ≥ 10 | ≥ 20 | `tenant_subscriptions WHERE status='active'` |
| **MRR (R$)** | A calcular | ≥ R$ 3.000 | ≥ R$ 8.000 | Edge function `unit-economics` |
| **Churn mensal** | 0% | ≤ 5% | ≤ 2% | `canceled / total` por mês |
| **Trial→Paid conversion** | 33% | ≥ 40% | ≥ 60% | `active / (active + trialing)` |
| **CAC (R$)** | A calcular | ≤ R$ 500 | ≤ R$ 200 | `marketing_costs.spend / conversions` |
| **LTV/CAC ratio** | A calcular | ≥ 3x | ≥ 5x | Edge function `unit-economics` |
| **NPS** | Não medido | ≥ 30 | ≥ 50 | Survey com clientes ativos |

**Critério de validação**: ≥ 5 de 7 métricas na Meta de Sucesso.

---

### 3.2 Engajamento de Produto (Peso: 25%)

| KPI | Baseline | Meta de Sucesso | Meta Stretch | Como Medir |
|-----|:--------:|:---------------:|:------------:|------------|
| **Agentes ativos** | 1 (6.7%) | ≥ 50 | ≥ 100 | `agents WHERE status='active'` |
| **Agent retention (30d)** | ~7% | ≥ 70% | ≥ 90% | Agentes ativos 30d após registro |
| **DAU (admin logins)** | Não medido | ≥ 5 | ≥ 15 | `active_sessions` únicos/dia |
| **Feature adoption rate** | ~40% | ≥ 60% | ≥ 80% | Features usadas / features disponíveis por tenant |
| **Alert acknowledgment rate** | 51% | ≥ 80% | ≥ 95% | `system_alerts WHERE acknowledged=true / total` |
| **Time to Value (dias)** | Não medido | ≤ 7 dias | ≤ 2 dias | Signup → primeiro alerta |

**Critério de validação**: ≥ 4 de 6 métricas na Meta de Sucesso.

---

### 3.3 Confiabilidade Técnica (Peso: 20%)

| KPI | Baseline | Meta de Sucesso | Meta Stretch | Como Medir |
|-----|:--------:|:---------------:|:------------:|------------|
| **Job success rate** | 41% | ≥ 85% | ≥ 95% | `jobs completed / total` |
| **DLQ recovery rate** | 91.7% | ≥ 95% | ≥ 99% | `failed_jobs_dlq resolved / total` |
| **API latency (p95)** | Não medido | ≤ 500ms | ≤ 200ms | Edge function response times |
| **Uptime mensal** | Não medido | ≥ 99.5% | ≥ 99.9% | Status page monitoring |
| **Error rate (edge functions)** | Não medido | ≤ 1% | ≤ 0.1% | Logs de erro / total de chamadas |
| **DLQ pendente** | 18 (1.6%) | ≤ 3% | ≤ 1% | `failed_jobs_dlq WHERE status='pending'` |

**Critério de validação**: ≥ 4 de 6 métricas na Meta de Sucesso.

---

### 3.4 Diferencial Competitivo (Peso: 15%)

| KPI | Baseline | Meta de Sucesso | Meta Stretch | Como Medir |
|-----|:--------:|:---------------:|:------------:|------------|
| **Evidence logs / agente** | 14.7 | ≥ 30 | ≥ 100 | `agent_evidence_logs / agents` |
| **Compliance score médio** | 39.4 | ≥ 60 | ≥ 80 | `compliance_benchmarks.avg_score` |
| **Playbook executions/mês** | 0 | ≥ 10 | ≥ 50 | `playbook_executions` no período |
| **Attack simulations/mês** | 0 | ≥ 5 | ≥ 20 | `attack_simulations` no período |
| **IoCs compartilhados** | 201 | ≥ 500 | ≥ 2.000 | `threat_indicators WHERE is_active` |
| **Cross-tenant blocks** | Não medido | ≥ 1 | ≥ 10 | IoC de tenant A bloqueando em tenant B |

**Critério de validação**: ≥ 4 de 6 métricas na Meta de Sucesso.

---

### 3.5 Operacional (Peso: 10%)

| KPI | Baseline | Meta de Sucesso | Meta Stretch | Como Medir |
|-----|:--------:|:---------------:|:------------:|------------|
| **Cron jobs saudáveis** | ~30 | 100% healthy | 100% healthy | `cron_health` check |
| **Custo infra / cliente** | Não medido | ≤ R$ 50/mês | ≤ R$ 30/mês | Total infra / clientes ativos |
| **Tempo do fundador em ops** | ~20% | ≤ 15% | ≤ 10% | Tracking semanal |
| **Bus factor** | 1 | ≥ 1.5 | ≥ 2 | Pessoas que podem operar |
| **Documentação coverage** | ~70% | ≥ 90% | 100% | Docs existentes / docs necessários |

**Critério de validação**: ≥ 3 de 5 métricas na Meta de Sucesso.

---

## 4. Cronograma de Checkpoints

| Checkpoint | Data | Foco | Decisão |
|:----------:|:----:|------|---------|
| **CP-1** | 2026-04-11 (30d) | Tração + Confiabilidade | Ajustar ou manter curso |
| **CP-2** | 2026-05-11 (60d) | Todas as dimensões | Pivotar feature set se necessário |
| **CP-3** | 2026-06-11 (90d) | **Validação final** | GO para crescimento ou PIVOT |

### Critérios por Checkpoint

| Checkpoint | Requisito Mínimo | Ação se não atingir |
|:----------:|------------------|---------------------|
| CP-1 | ≥ 8 clientes pagantes + job rate ≥ 70% | Focar 100% em reliability + sales |
| CP-2 | ≥ 3 dimensões validadas | Pivotar features com 0 adoção |
| CP-3 | ≥ 4 dimensões validadas | Declarar MVP validado ou pivotar |

---

## 5. Cenários de Decisão no CP-3

### Cenário A: ✅ MVP Validado (≥ 4 dimensões)
→ Iniciar fase de crescimento:
- Buscar investimento seed (R$ 500k - R$ 1.5M)
- Contratar primeiro dev full-time
- Expandir para 50+ clientes
- Implementar self-service completo

### Cenário B: ⚠️ Validação Parcial (3 dimensões)
→ Estender validação por +60 dias:
- Focar nas dimensões faltantes
- Reduzir scope do produto se necessário
- Considerar nicho mais específico (ex: só clínicas, só contabilidades)

### Cenário C: ❌ Não Validado (≤ 2 dimensões)
→ Decisão de pivot ou encerramento:
- Analisar quais hipóteses falharam
- Se H4 (pagamento) falhou → pivot fundamental
- Se apenas técnico falhou → refactor e retry
- Se mercado não existe → considerar encerrar e documentar aprendizados

---

## 6. Instrumentação Necessária

Para medir todas as métricas, implementar:

| Métrica | Instrumentação | Status |
|---------|---------------|--------|
| MRR/ARR/CAC/LTV | ✅ Edge function `unit-economics` | Pronto |
| Compliance Score | ✅ Edge function `compute-compliance-benchmarks` | Pronto |
| Job Success Rate | ✅ Query direta `jobs` | Pronto |
| DLQ Metrics | ✅ Query direta `failed_jobs_dlq` | Pronto |
| Agent Retention | ⚠️ Precisa de tracking de `registered_at` vs `last_heartbeat` | A implementar |
| DAU/MAU | ⚠️ Precisa de analytics em `active_sessions` | A implementar |
| Time to Value | ⚠️ Precisa correlacionar `signup → primeiro alerta` | A implementar |
| NPS | ❌ Precisa de survey tool | A implementar |
| Feature Adoption | ⚠️ Precisa de tracking de uso por feature por tenant | A implementar |
| Cross-tenant blocks | ❌ Precisa de instrumentação em threat sharing | A implementar |
| Custo infra/cliente | ⚠️ Precisa consolidar custos Stripe + infra | A implementar |

---

## 7. Dashboard de Validação

Criar página `/admin/mvp-validation` com:

1. **Scorecard visual** das 5 dimensões (verde/amarelo/vermelho)
2. **Progress bars** de cada métrica vs meta
3. **Trend charts** mostrando evolução semanal
4. **Countdown** para o próximo checkpoint
5. **Auto-cálculo** do score de validação global

---

## 8. Definição Final de Sucesso

> **O MVP é considerado VALIDADO quando:**
>
> 1. ≥ 10 clientes pagantes com ≤ 5% churn mensal
> 2. ≥ 50 agentes ativos com ≥ 70% retention
> 3. ≥ 85% job success rate com ≥ 99.5% uptime
> 4. ≥ 10 playbook executions/mês com compliance score ≥ 60
> 5. Custo operacional ≤ R$ 50/cliente/mês
>
> **Em uma frase: "10 empresas pagam, 50 máquinas protegidas, 85% dos jobs funcionam, compliance score acima de 60."**

---

## Histórico

| Versão | Data | Alterações |
|--------|------|------------|
| 1.0 | 2026-03-11 | Versão inicial com baseline de produção |

---

*Este plano será revisado em cada checkpoint. Métricas são extraídas automaticamente do banco de produção.*
