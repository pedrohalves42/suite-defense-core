# 📄 Documentação do Banco de Dados — CyberShield Audit

📌 **Projeto**: CyberShield Audit  
📅 **Data da Organização**: 2026-02-21  
🏗️ **Plataforma**: CyberShield Cloud (Supabase)  
🔒 **Arquitetura**: Multi-tenant com RLS + HMAC  

---

## 📊 Resumo Executivo

| Métrica | Valor |
|---------|-------|
| Total de tabelas | ~161 |
| Tabelas removidas | 6 |
| Dados mockados encontrados | 0 |
| Colunas removidas | 0 |
| Triggers updated_at configurados | ~62 |
| Indexes criados (tenant_id/agent_id) | Automático via DO block |
| Comentários em tabelas | ~155 |
| Comentários em colunas (tabelas críticas) | ~90+ |

---

## 🗑️ Tabelas Removidas

| Tabela | Motivo |
|--------|--------|
| `_audit_orphan_profiles` | Tabela órfã de auditoria, sem referência no código |
| `agent_system_metrics` | Tabela pai obsoleta, substituída por `agent_system_metrics_partitioned` |
| `agent_system_metrics_2025_12` | Partição expirada (dez/2025), vazia |
| `agent_system_metrics_2026_01` | Partição expirada (jan/2026), vazia |
| `agent_system_metrics_2026_03` | Partição futura vazia, sem uso |
| `system_liveness` | Tabela de liveness sem referência no código |

---

## 🏗️ Organização por Domínio

### 🔐 Autenticação & Sessões
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `active_sessions` | 11 | Sessões ativas dos usuários autenticados |
| `admin_ip_whitelist` | 8 | IPs permitidos para acesso administrativo |
| `profiles` | 6 | Perfil estendido de cada usuário (1:1 com auth.users) |
| `invites` | ~10 | Convites para novos usuários |
| `onboarding_progress` | ~8 | Progresso do onboarding |
| `failed_login_attempts` | 8 | Tentativas de login falhadas (anti brute-force) |
| `user_roles` | ~5 | Atribuição de roles por tenant |

### 🏢 Tenants & Assinaturas
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `tenants` | ~10 | Registro principal de cada organização |
| `tenant_settings` | ~6 | Configurações por tenant |
| `tenant_features` | ~6 | Feature flags por tenant |
| `tenant_branding` | ~8 | Personalização visual por tenant |
| `tenant_subscriptions` | ~12 | Assinatura vinculada ao plano |
| `tenant_action_policies` | ~8 | Políticas de ação por tenant |
| `tenant_job_quotas` | ~6 | Limites de jobs |
| `tenant_suspension_config` | ~6 | Suspensão automática |
| `subscription_plans` | ~10 | Planos disponíveis (free, pro, enterprise) |
| `stripe_plan_mapping` | ~6 | Mapeamento Stripe ↔ planos internos |
| `subscription_events` | ~8 | Eventos de ciclo de vida das assinaturas |
| `custom_trials` | 13 | Períodos de teste personalizados |

### 🖥️ Agentes (Endpoints)
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `agents` | 53 | Tabela principal de endpoints monitorados |
| `agent_tokens` | 11 | Tokens de autenticação dos agentes |
| `enrollment_keys` | 20 | Chaves de enrollment para registro |
| `agent_groups` | 6 | Grupos lógicos de agentes |
| `agents_groups` | 2 | Associativa N:N agentes ↔ grupos |
| `agent_tags` | 7 | Tags customizáveis |
| `agent_tag_assignments` | 5 | Atribuição de tags (N:N) |
| `agent_group_policies` | 5 | Políticas por grupo |
| `agent_versions` | 13 | Versões dos agentes |
| `agent_releases` | 13 | Releases para distribuição |
| `agent_builds` | 24 | Builds compilados com hash |
| `agent_signing_keys` | 12 | Chaves criptográficas de assinatura |

### 📈 Métricas & Monitoramento
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `agent_system_metrics_partitioned` | 20 | Métricas de CPU/RAM (particionada) |
| `agent_system_metrics_2026_02` | 20 | Partição fev/2026 |
| `agent_disk_metrics` | 13 | Métricas de disco |
| `agent_network_info` | 16 | Informações de rede |
| `agent_network_metrics` | 14 | Métricas de rede |
| `agent_metrics_daily` | 15 | Agregações diárias |
| `agent_processes` | 13 | Processos em execução |
| `agent_usb_devices` | 15 | Dispositivos USB |
| `agent_certificates` | 14 | Certificados digitais |
| `agent_web_activity` | 15 | Atividade de navegação |
| `performance_metrics` | ~8 | Performance geral |
| `edge_function_metrics` | 9 | Métricas de edge functions |

### 🛡️ Segurança & Compliance
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `security_policies` | ~10 | Políticas de segurança |
| `policy_rules` | ~8 | Regras das políticas |
| `policy_assignments` | ~6 | Atribuição de políticas |
| `policy_enforcement_logs` | ~10 | Logs de enforcement |
| `compliance_policies` | 16 | Políticas de compliance |
| `compliance_snapshots` | 7 | Snapshots de compliance |
| `soc2_controls` | ~10 | Controles SOC2 |
| `soc2_criteria` | ~8 | Critérios SOC2 TSC |
| `security_events` | ~12 | Eventos de segurança |
| `security_logs` | ~10 | Logs de segurança |
| `security_reports` | ~8 | Relatórios de segurança |
| `antivirus_status` | 11 | Estado do antivírus |
| `quarantined_files` | ~10 | Arquivos em quarentena |
| `virus_scans` | ~8 | Varreduras de vírus |
| `blocked_websites` | 9 | Sites bloqueados |
| `blocked_access_attempts` | 11 | Tentativas bloqueadas |
| `web_access_policies` | ~8 | Políticas de acesso web |
| `ip_blocklist` | ~6 | IPs bloqueados |
| `segregation_rules` | ~8 | Segregação de duties |
| `vuln_findings` | ~12 | Achados de vulnerabilidade |
| `agent_vulnerabilities` | 12 | Vulnerabilidades por agente |
| `agent_vulnerability_scans` | 15 | Varreduras de vulnerabilidade |
| `cve_database` | 18 | Base de CVEs |
| `cve_sync_status` | 8 | Sincronização de CVEs |
| `software_inventory` | ~12 | Inventário de software |
| `software_knowledge_base` | ~10 | Base de conhecimento de software |
| `software_vulnerability_baseline` | ~8 | Baseline de vulnerabilidades |

### ⚙️ Jobs & Automação
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `jobs` | ~15 | Jobs remotos para agentes |
| `job_executions` | ~12 | Execuções (trilha imutável) |
| `scheduled_jobs` | ~12 | Jobs agendados |
| `scheduled_job_runs` | ~10 | Execuções de agendados |
| `scheduled_job_heartbeat` | ~6 | Heartbeat dos agendados |
| `tasks` | ~10 | Tarefas operacionais |
| `failed_jobs_dlq` | 32 | Dead Letter Queue |
| `automation_rules` | 18 | Regras de automação |
| `automation_executions` | 12 | Execuções de automação |
| `playbooks` | ~10 | Playbooks SOAR |
| `playbook_actions` | ~8 | Ações dos playbooks |
| `playbook_executions` | ~10 | Execuções de playbooks |
| `runbooks` | ~8 | Runbooks operacionais |

### 🤖 IA & Decisões
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `ai_actions` | 35 | Ações de IA disponíveis |
| `ai_action_configs` | 14 | Configurações por tenant |
| `ai_action_executions` | 9 | Execuções de ações |
| `ai_action_logs` | 8 | Logs de auditoria de IA |
| `ai_action_validations` | 11 | Validações humanas (HITL) |
| `ai_insights` | 36 | Insights gerados pela IA |
| `ai_insight_feedback` | 7 | Feedback sobre insights |
| `ai_anomalies` | 11 | Anomalias detectadas |
| `ai_decision_reports` | 9 | Relatórios de decisão |
| `ai_inference_metrics` | 16 | Métricas de inferência |
| `ai_learned_patterns` | 9 | Padrões aprendidos |
| `ai_rejected_decisions` | 9 | Decisões rejeitadas |
| `ai_response_cache` | 16 | Cache de respostas |
| `anomaly_events` | 9 | Eventos de anomalia |
| `decision_events` | 15 | Eventos de decisão |
| `decision_rules` | 9 | Regras do motor |

### 📋 Auditoria & Evidências
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `audit_logs` | 17 | Log de auditoria imutável |
| `audit_confidence_gaps` | 14 | Lacunas de confiança |
| `audit_integrity_checks` | 9 | Verificações de integridade |
| `audit_reason_trees` | 7 | Árvores de razão |
| `audit_report_verifications` | 11 | Verificação de relatórios |
| `agent_evidence_logs` | 12 | Logs de evidência com hash |
| `agent_execution_chain` | 4 | Cadeia de execução (PoE) |
| `evidence_bundles` | 15 | Pacotes de evidência |
| `forensic_snapshots` | 12 | Snapshots forenses |
| `poe_chain_breaks` | ~6 | Quebras na cadeia PoE |

### 🚨 Incidentes & SLO
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `system_alerts` | ~10 | Alertas operacionais |
| `incident_timelines` | ~10 | Timeline de incidentes |
| `incident_slo_state` | ~8 | Estado SLO por incidente |
| `job_slo_state` | ~6 | Estado SLO por job |
| `slo_definitions` | ~8 | Definições de SLOs |
| `persistent_failure_alerts` | ~8 | Alertas de falhas persistentes |
| `failure_fingerprints` | 17 | Fingerprints de falhas |
| `failure_occurrences` | 9 | Ocorrências por fingerprint |
| `circuit_breaker_events` | 9 | Circuit breaker |
| `network_anomalies` | ~8 | Anomalias de rede |

### 🔄 Atualizações & Rollback
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `agent_updates` | 12 | Atualizações de agentes |
| `agent_update_decisions` | 10 | Decisões de atualização |
| `agent_update_policies` | 9 | Políticas de atualização |
| `agent_rollback_events` | 11 | Eventos de rollback |
| `agent_safe_mode_events` | 11 | Ativações de safe mode |
| `agent_quarantine` | 15 | Agentes em quarentena |
| `agent_recovery_authorizations` | 12 | Autorizações de recuperação |
| `agent_light_mode_configs` | 19 | Configuração modo leve |
| `agent_archive_events` | 7 | Arquivamento de agentes |
| `update_packages` | ~12 | Pacotes OTA |

### 🔑 Integridade & HMAC
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `agent_file_integrity` | 13 | FIM (File Integrity Monitoring) |
| `agent_behavioral_baseline` | 13 | Baseline comportamental |
| `agent_hmac_format_cache` | 6 | Cache de formato HMAC |
| `hmac_signatures` | 4 | Assinaturas HMAC (particionada) |
| `hmac_signatures_2026_02..07` | 4 | Partições mensais |

### 🔔 Notificações
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `notification_channels` | ~8 | Canais configurados |
| `notification_preferences` | ~8 | Preferências por usuário |
| `notification_queue` | ~10 | Fila de envio |
| `notification_log` | ~8 | Log de envios |
| `notification_deliveries` | ~8 | Estado de entrega |

### 📊 Relatórios
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `reports` | ~10 | Definições de relatórios |
| `report_executions` | ~8 | Execuções |
| `scheduled_reports` | ~8 | Agendamento |
| `generated_reports` | 28 | Relatórios gerados |

### ✅ Aprovações
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `approval_requests` | 18 | Solicitações |
| `approval_chains` | 12 | Cadeias multi-nível |
| `approvals` | 6 | Registros individuais |

### 🔑 API & Rate Limiting
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `api_keys` | 13 | Chaves de API |
| `api_request_logs` | 10 | Logs de requisições |
| `rate_limits` | ~6 | Configurações de rate limit |

### 💼 Comercial & Marketing
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `sales_contacts` | ~8 | Contatos comerciais |
| `sales_pipeline` | ~10 | Pipeline de vendas |
| `marketing_costs` | ~8 | Custos de marketing |
| `installation_analytics` | ~8 | Analíticas de instalação |

### ⚙️ Infraestrutura
| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `cron_health` | 13 | Saúde dos cron jobs |
| `cron_health_checks` | 8 | Verificações individuais |
| `chaos_test_results` | 10 | Testes de caos |
| `rollback_test_results` | ~8 | Testes de rollback |
| `rls_test_results` | ~6 | Testes de RLS |
| `domain_events` | 9 | Eventos de domínio (CQRS) |
| `platform_configs` | ~6 | Configurações globais |
| `feature_flags` | 6 | Feature flags globais |
| `system_kill_switch` | ~6 | Kill switch emergencial |
| `system_state` | ~6 | Estado global |
| `operational_calendar` | ~8 | Calendário operacional |

---

## 🔧 Alterações Realizadas

### Triggers `updated_at` Configurados
Todos as ~62 tabelas com coluna `updated_at` agora possuem trigger `set_updated_at` que atualiza automaticamente o campo antes de cada UPDATE.

### Indexes Criados
Indexes automáticos criados via DO block para todas as tabelas com:
- `tenant_id` sem index existente → `idx_<tabela>_tenant_id`
- `agent_id` sem index existente → `idx_<tabela>_agent_id`

### Correções de Código
- **`src/hooks/useAgentTimeline.tsx`**: Corrigida referência para view inexistente `agent_timeline_events`, agora usando `agent_evidence_logs` com mapeamento de dados.

---

## ✅ Checklist Final

- [x] Todas as tabelas desnecessárias foram removidas (6 tabelas)
- [x] Todas as colunas desnecessárias foram removidas (nenhuma encontrada)
- [x] Todos os dados mockados/falsos foram removidos (nenhum encontrado)
- [x] Todas as tabelas têm comentário em português (~155 tabelas)
- [x] Tabelas críticas têm comentários em colunas (~90+ colunas)
- [x] Nomenclatura padronizada em snake_case (já estava)
- [x] Trigger de updated_at configurado em todas as tabelas com a coluna (~62)
- [x] Indexes criados em tenant_id e agent_id faltantes
- [x] Foreign keys já declaradas formalmente (verificado)
- [x] Projeto continua funcionando normalmente
- [x] Documentação final gerada e entregue

---

*Documentação gerada automaticamente em 2026-02-21.*
