# 🦄 CyberShield — Gap Analysis: 12 Funcionalidades Unicórnio

> Análise técnica detalhada: o que JÁ EXISTE vs o que FALTA implementar.

---

## Resumo Executivo

| # | Feature | Status | Completude |
|---|---------|--------|------------|
| 1 | CyberShield Threat Cloud | ✅ Implementado | 90% |
| 2 | Security Score Global (Benchmark) | ⚠️ Parcial | 60% |
| 3 | SOC Automático com IA | ✅ Implementado | 85% |
| 4 | Ransomware Kill Switch | ✅ Implementado | 80% |
| 5 | Attack Simulation | ❌ Não existe | 0% |
| 6 | Shadow IT Discovery | ❌ Não existe | 0% |
| 7 | Identity Security | ❌ Não existe | 0% |
| 8 | Compliance Autopilot | ✅ Implementado | 85% |
| 9 | Threat Sharing Network | ✅ Implementado | 90% |
| 10 | Security Automation Engine | ✅ Implementado | 90% |
| 11 | Backup Resilience Monitor | ✅ Implementado | 80% |
| 12 | CyberShield AI Copilot | ✅ Implementado | 85% |

### Features Extras Solicitadas

| Feature | Status | Completude |
|---------|--------|------------|
| Evidence Blockchain | ✅ Implementado | 90% |
| Security Graph | ❌ Não existe | 0% |
| AI Security Engine (ML) | ⚠️ Parcial | 40% |
| Compliance Automation (SOC2/ISO) | ⚠️ Parcial | 50% |

**Score Geral: 11/17 features implementadas ou parciais. 4 features faltando completamente.**

---

## Análise Detalhada por Feature

---

### 1️⃣ CyberShield Threat Cloud ✅ 90%

**O que existe:**
- Tabelas: `threat_indicators`, `threat_matches`, `threat_feed_sync_log`
- Edge Function: `sync-threat-feeds` (ingestão MalwareBazaar, URLhaus, Feodo Tracker)
- Edge Function: `publish-threat-ioc` (publicação de IoCs detectados)
- Edge Function: `threat-intelligence-lookup` (consulta de IoCs)
- Dashboard: `ThreatIntelligence.tsx` com KPIs
- RPC: `get_threat_intel_stats`
- Hook: `useThreatIntel.ts` com queries reativas

**O que falta (10%):**
- [ ] **Cross-tenant IoC propagation automática**: Quando tenant A detecta malware, o hash deve ser automaticamente inserido em `threat_indicators` com `tenant_id = NULL` (global) para que todos os tenants recebam o bloqueio. O `publish-threat-ioc` existe mas precisa de um trigger automático no `threat_matches` para acionar sem intervenção.
- [ ] **Dashboard visual de "rede de proteção"**: Um widget mostrando "X clientes protegidos por esta detecção" — efeito de rede visível para o usuário.

---

### 2️⃣ Security Score Global (Benchmark) ⚠️ 60%

**O que existe:**
- Domain service: `ComplianceScoreCalculator.ts` com pesos por categoria
- Domain service: `ComplianceDriftDetector.ts` para alertas de degradação
- Use case: `CalculateComplianceScore.ts` com persistência e eventos
- Dashboard: `ComplianceAutomation.tsx`, `SecurityDashboard.tsx`
- Edge Function: `calculate-compliance`, `calculate-risk-score`

**O que falta (40%):**
- [ ] **Benchmark cross-tenant**: Criar RPC `get_industry_benchmark` que calcula a média anônima dos scores de todos os tenants, permitindo ao cliente ver: "Sua empresa: 68/100 | Média do setor: 72/100". Requer:
  - Nova tabela `compliance_benchmarks` (score médio por segmento/mês)
  - Cron job mensal para agregar scores anônimos
  - Widget no dashboard com comparação visual (gauge chart)
- [ ] **Segmentação por indústria**: Campo `industry_segment` na tabela `tenants` para benchmark setorial (clínicas vs escritórios vs varejo)
- [ ] **Trending temporal**: Gráfico de evolução do score nos últimos 6 meses vs benchmark

---

### 3️⃣ SOC Automático com IA ✅ 85%

**O que existe:**
- 15+ Edge Functions de IA: `ai-correlate-alerts`, `ai-behavioral-anomaly-detector`, `ai-predict-agent-failure`, `ai-system-analyzer`, `ai-full-audit`, `ai-red-team-assessment`
- SOAR Engine: `evaluate-playbook-triggers`, `execute-playbook`, `execute-playbook-action`
- Auto-triage: `auto-triage-insights`, `ai-insight-dispatcher`
- Auto-remediação: `auto-remediate`, `auto-quarantine`
- Dashboards: `AIInsights.tsx`, `AIAnomalies.tsx`, `AIGovernance.tsx`, `ActionCenterDashboard.tsx`

**O que falta (15%):**
- [ ] **Investigation chain automática**: Quando um alerta crítico chega, o sistema deve automaticamente: (1) correlacionar com IoCs, (2) buscar processos suspeitos no agente, (3) verificar movimentação lateral, (4) gerar um relatório de investigação completo — tudo sem interação humana. Hoje cada passo existe isolado.
- [ ] **Runbook visual de investigação**: Dashboard mostrando a timeline da investigação automática com cada etapa e resultado.

---

### 4️⃣ Ransomware Kill Switch ✅ 80%

**O que existe:**
- Edge Function: `submit-ransomware-indicator` (recebe detecção do agente)
- Agente v5: Detecção por entropia de arquivos, I/O anômalo, canary files
- SOAR trigger: `RANSOMWARE_DETECTED` → isolamento automático
- Edge Function: `quarantine-agent` (isolamento de rede)

**O que falta (20%):**
- [ ] **Kill switch instantâneo**: Quando `submit-ransomware-indicator` recebe um alerta `critical`, deve automaticamente:
  1. Acionar `quarantine-agent` (já existe)
  2. Criar job de `kill_process` para terminar o processo suspeito
  3. Desabilitar shares de rede via job no agente
  4. Notificar ALL admins via todos os canais (email + telegram + webhook)
- [ ] **Dashboard de incidente de ransomware**: Painel específico mostrando: máquina afetada, processos mortos, arquivos criptografados, timeline da contenção

---

### 5️⃣ Attack Simulation ❌ 0%

**Não existe nenhuma implementação.**

**O que precisa ser criado:**
- [ ] **Tabela `attack_simulations`**: id, tenant_id, simulation_type (phishing_test, port_scan, brute_force_sim, malware_download_test, usb_drop_sim), status, target_agents[], results, created_at, completed_at
- [ ] **Tabela `attack_simulation_results`**: id, simulation_id, agent_id, detected (bool), detection_time_ms, detection_method, details
- [ ] **Edge Function `run-attack-simulation`**: Orquestra simulações criando jobs nos agentes:
  - **Phishing test**: Cria arquivo de teste e verifica se AV detecta
  - **EICAR test**: Download do EICAR test file e verifica detecção
  - **Port scan test**: Verifica se firewall bloqueia scan interno
  - **Canary file test**: Cria canary files e monitora acesso
  - **USB policy test**: Tenta montar USB e verifica bloqueio
- [ ] **Dashboard `AttackSimulation.tsx`**: Agenda e visualiza resultados, taxa de detecção por agente, evolução temporal
- [ ] **RLS**: Isolamento por tenant

**Estimativa**: 3-4 dias de implementação (tabelas + edge function + dashboard + jobs no agente)

---

### 6️⃣ Shadow IT Discovery ❌ 0%

**Não existe nenhuma implementação.** (Software Inventory existe mas não classifica Shadow IT)

**O que já pode ser aproveitado:**
- Edge Function: `submit-software-inventory` (já coleta software instalado)
- Edge Function: `get-software-inventory` (já lista software)
- Edge Function: `submit-web-activity` (já coleta atividade web)
- Dashboard: `SoftwareInventory.tsx`, `WebActivity.tsx`

**O que precisa ser criado:**
- [ ] **Tabela `shadow_it_catalog`**: id, tenant_id, app_name, app_category (saas, desktop, browser_extension), risk_level (approved, review, blocked, unknown), first_seen_at, agents_count, data_sensitivity
- [ ] **Tabela `shadow_it_policies`**: id, tenant_id, app_pattern, action (allow, alert, block), reason
- [ ] **Edge Function `classify-shadow-it`**: Usa IA (Lovable AI) para classificar software desconhecido em categorias de risco. Cruza `software_inventory` + `web_activity` para detectar:
  - SaaS não aprovados (Dropbox pessoal, WhatsApp Web, ChatGPT)
  - Extensões de browser suspeitas
  - Software pirata ou crackeado
  - VPNs pessoais
- [ ] **Dashboard `ShadowIT.tsx`**: Catálogo visual com: apps descobertos, classificação de risco, tendência de uso, ações (aprovar/bloquear)
- [ ] **Cron job**: Análise periódica dos dados de inventário

**Estimativa**: 3 dias (pode reaproveitar dados existentes de software inventory e web activity)

---

### 7️⃣ Identity Security ❌ 0%

**Não existe nenhuma implementação.**

**O que precisa ser criado:**
- [ ] **Tabela `credential_monitors`**: id, tenant_id, email_domain, monitored_emails[], monitoring_enabled, last_check_at
- [ ] **Tabela `credential_leaks`**: id, tenant_id, email, breach_source, breach_date, data_types_exposed[], severity, status (new, notified, resolved), detected_at
- [ ] **Edge Function `check-credential-leaks`**: Integra com Have I Been Pwned API (HIBP):
  - Monitora domínios de email do tenant
  - Verifica hashes de senhas via k-anonymity API do HIBP
  - Detecta credenciais corporativas em dumps públicos
- [ ] **Edge Function `monitor-identity-risks`**: Analisa:
  - Usuários sem MFA habilitado
  - Contas compartilhadas (mesmo IP, múltiplos usuários)
  - Senhas fracas (via policy check no agente)
  - Credenciais salvas em browsers (dados já coletáveis pelo agente)
- [ ] **Dashboard `IdentitySecurity.tsx`**: Painel com: credenciais vazadas, usuários em risco, MFA coverage, ações de remediação
- [ ] **Secret necessário**: `HIBP_API_KEY` (Have I Been Pwned API key - pago, ~$3.50/mês)

**Estimativa**: 4 dias (requer API externa HIBP)

---

### 8️⃣ Compliance Autopilot ✅ 85%

**O que existe:**
- Dashboard: `ComplianceAutomation.tsx`, `ComplianceTimeline.tsx`, `SOC2Dashboard.tsx`
- Edge Function: `generate-compliance-report`, `verify-compliance-report`
- Use case: `CalculateComplianceScore.ts` com drift detection
- Relatórios PDF: `Reports.tsx` com geração LGPD automatizada (jsPDF)
- Evidence: `export-evidence-bundle`, `submit-agent-evidence`

**O que falta (15%):**
- [ ] **Mapeamento completo ISO 27001**: Tabela de controles ISO 27001 mapeados para métricas do CyberShield (ex: A.8.1 → Software Inventory, A.12.2 → AV Status)
- [ ] **Geração automática de relatório SOC2**: Similar ao que existe para LGPD, mas seguindo os Trust Service Criteria
- [ ] **Agendamento automático**: Cron job para gerar relatórios mensais e enviar por email ao DPO

---

### 9️⃣ Threat Sharing Network ✅ 90%

**(Mesma feature que #1 — CyberShield Threat Cloud)**

Já coberto na análise do item 1.

---

### 🔟 Security Automation Engine ✅ 90%

**O que existe:**
- SOAR completo: `soar_playbooks`, `playbook_actions`, `soar_playbook_versions`
- Triggers automáticos: `evaluate-playbook-triggers`
- Execução: `execute-playbook`, `execute-playbook-action`
- Governance: Blast radius, circuit breaker, dry-run, observe-only
- Dashboard: `Playbooks.tsx`, `Automations.tsx`, `AutonomyDashboard.tsx`
- Rules engine: `RulesManagement.tsx`, `SecurityPoliciesAutoActions.tsx`
- Quotas: `tenant_automation_state` com limites diários

**O que falta (10%):**
- [ ] **Marketplace de playbooks**: Templates pré-criados que o cliente pode ativar com 1 clique (ex: "Resposta a Ransomware", "Remediação de Vulnerabilidade Crítica", "Onboarding Seguro de Novo Endpoint")
- [ ] **Visual playbook builder**: Editor drag-and-drop para criar playbooks (atualmente é via formulário)

---

### 1️⃣1️⃣ Backup Resilience Monitor ✅ 80%

**O que existe:**
- Edge Function: `submit-backup-status` (recebe telemetria de backup)
- Agente: Monitora Windows Backup, VSS, Veeam, Acronis, Cloud Sync
- Alertas automáticos: Dispara quando backup excede threshold de idade
- Dashboard: `BackupAwarenessCard` no admin dashboard

**O que falta (20%):**
- [ ] **Detecção de sabotagem**: Alertar quando:
  - Shadow copies são deletadas (indicador de ransomware)
  - Serviço de backup é desabilitado
  - Backup storage é inacessível
  - Tamanho do backup diminui drasticamente (possível exclusão de dados)
- [ ] **Dashboard dedicado**: `BackupResilience.tsx` com: status de todos os agentes, timeline de backups, alertas de sabotagem, recomendações

---

### 1️⃣2️⃣ CyberShield AI Copilot ✅ 85%

**O que existe:**
- Edge Function: `ai-security-copilot` com streaming SSE
- Contexto dinâmico: Carrega agentes, alertas, vulnerabilidades e insights do tenant
- Modelo: Gemini 3 Flash via Lovable AI Gateway
- Integração com dados reais do tenant

**O que falta (15%):**
- [ ] **Deep-dive em agente específico**: Quando perguntam "por que essa máquina está em risco?", o copilot deve carregar métricas específicas do agente (disco, processos, certificados, file integrity) além do contexto geral
- [ ] **Ações executáveis**: O copilot deve poder executar ações (ex: "isole essa máquina" → aciona `quarantine-agent`)
- [ ] **Histórico de conversas**: Persistir chats para referência futura

---

## Features Extras

### Evidence Blockchain ✅ 90%

**O que existe:**
- Tabela `agent_execution_chain`: Mini-blockchain por endpoint
- Tabela `agent_evidence_logs`: Logs com hash chain
- Edge Functions: `submit-agent-evidence`, `verify-log-integrity`, `export-evidence-bundle`
- Verificação pública: `VerificarLaudo.tsx`

**O que falta:**
- [ ] **Dashboard forense**: Visualização da cadeia de custódia com verificação de integridade inline

---

### Security Graph ❌ 0%

**Não existe nenhuma implementação.**

**O que precisa ser criado:**
- [ ] **Tabela `security_graph_nodes`**: id, tenant_id, node_type (process, ip, domain, hash, user, agent), node_value, metadata, first_seen, last_seen
- [ ] **Tabela `security_graph_edges`**: id, tenant_id, source_node_id, target_node_id, relationship (connects_to, spawned_by, downloaded_from, logged_in_as, has_hash), confidence, created_at
- [ ] **Edge Function `build-security-graph`**: Constrói grafo a partir de:
  - Process lineage (processos → parent processes)
  - Network connections (agente → IPs → domínios)
  - Threat matches (hashes → IoCs → feeds)
  - User sessions (usuários → agentes → IPs)
- [ ] **Dashboard `SecurityGraph.tsx`**: Visualização interativa do grafo com D3.js/react-force-graph
- [ ] **Correlação de ataques**: Ao clicar em um nó, mostra todas as conexões e permite investigar cadeias de ataque

**Estimativa**: 5-7 dias (feature mais complexa — requer visualização de grafo)

---

### AI Security Engine (ML Behavior) ⚠️ 40%

**O que existe:**
- `ai-behavioral-anomaly-detector`: Detecta anomalias via Lovable AI
- `agent_behavioral_baseline`: Baselines por agente
- `calculate-behavioral-baselines`: Cálculo de médias e desvios

**O que falta:**
- [ ] **Modelo de scoring de anomalia**: Ao invés de usar IA generativa para cada análise, criar um scoring engine local que:
  - Calcula z-scores de métricas (CPU, RAM, processos, conexões)
  - Gera anomaly score 0-100 por agente
  - Usa IA generativa apenas para explicar anomalias detectadas
- [ ] **Aprendizado contínuo**: Feedback loop onde o admin marca falsos positivos e o baseline se ajusta

---

### Compliance Automation (SOC2/ISO) ⚠️ 50%

**O que existe:**
- SOC2 Dashboard: `SOC2Dashboard.tsx`
- Compliance score com 6 categorias ponderadas
- Relatórios LGPD automáticos

**O que falta:**
- [ ] **Matriz de controles ISO 27001**: 114 controles mapeados
- [ ] **Evidence mapping automático**: Para cada controle, apontar automaticamente as evidências do CyberShield que satisfazem (ex: "A.12.6.1 Gestão de Vulnerabilidades" → dados de `vulnerability_findings`)
- [ ] **Relatório de gaps**: O que o cliente precisa fazer fora do CyberShield para ficar compliant

---

## 🚀 Priorização para Investidores

### Impacto Máximo com Mínimo Esforço (Quick Wins)

| Prioridade | Feature | Esforço | Impacto |
|------------|---------|---------|---------|
| P0 | Security Score Benchmark | 2 dias | 🔥🔥🔥 Efeito de rede visível |
| P0 | Shadow IT Discovery | 3 dias | 🔥🔥🔥 Dados já existem! |
| P1 | Attack Simulation (EICAR) | 3 dias | 🔥🔥🔥 Diferencial único |
| P1 | Identity Security (HIBP) | 4 dias | 🔥🔥 Credenciais vazadas |
| P2 | Security Graph | 5-7 dias | 🔥🔥🔥 Visual impressionante |
| P2 | Ransomware Kill Switch Dashboard | 2 dias | 🔥🔥 Já funciona, precisa de UI |

### Total estimado para 100% das features: ~20-25 dias de desenvolvimento

---

## Resumo para Pitch de Investidores

### ✅ JÁ TEMOS (8/12 core):
1. **Threat Cloud** — Inteligência compartilhada entre clientes
2. **SOC Automático** — 15+ modelos de IA investigando
3. **Ransomware Detection** — Detecção + isolamento automático
4. **Compliance Autopilot** — Relatórios LGPD gerados automaticamente
5. **Threat Sharing** — IoCs globais via Abuse.ch + rede interna
6. **Automation Engine** — SOAR com blast radius e governance
7. **Backup Monitor** — Telemetria proativa de backups
8. **AI Copilot** — Assistente de segurança com dados reais

### ✅ JÁ TEMOS (extras):
9. **Evidence Blockchain** — Cadeia de custódia criptográfica (Ed25519)
10. **Behavioral Baselines** — Detecção de anomalias por desvio

### ❌ FALTAM IMPLEMENTAR (4 features):
11. **Attack Simulation** — Precisa criar do zero
12. **Shadow IT Discovery** — Dados existem, precisa classificação
13. **Identity Security** — Precisa integração HIBP
14. **Security Graph** — Precisa visualização de grafo

### ⚠️ PRECISAM UPGRADE (para pitch):
15. **Security Score Benchmark** — Precisa comparação cross-tenant
16. **Ransomware Kill Switch** — Precisa dashboard dedicado de incidente
