
-- =====================================================================
-- ETAPA 4: Comentários em TODAS as tabelas (corrigido)
-- ETAPA 7: Triggers de updated_at faltantes
-- ETAPA 6: Indexes faltantes em FKs
-- =====================================================================

-- ── Autenticação & Sessões ──
COMMENT ON TABLE public.active_sessions IS 'Armazena sessões ativas dos usuários autenticados. Utilizada no controle de acesso e expiração de sessões. Relacionada com auth.users e tenants.';
COMMENT ON TABLE public.admin_ip_whitelist IS 'Lista de IPs permitidos para acesso administrativo. Utilizada na camada de segurança de rede. Relacionada com tenants.';
COMMENT ON TABLE public.profiles IS 'Perfil estendido de cada usuário do sistema. Utilizada em todas as telas que exibem dados do usuário. Relacionada com auth.users (1:1) e tenants.';
COMMENT ON TABLE public.invites IS 'Convites enviados para novos usuários ingressarem em um tenant. Utilizada no fluxo de onboarding. Relacionada com tenants e profiles.';
COMMENT ON TABLE public.onboarding_progress IS 'Progresso do onboarding de cada usuário. Utilizada nas telas de boas-vindas e setup inicial. Relacionada com profiles.';
COMMENT ON TABLE public.failed_login_attempts IS 'Registro de tentativas de login falhadas para detecção de brute-force. Utilizada no módulo de segurança. Relacionada com tenants.';

-- ── Tenants & Assinaturas ──
COMMENT ON TABLE public.tenants IS 'Registro principal de cada tenant (organização) do sistema multi-tenant. Utilizada em todo o sistema como base de isolamento de dados.';
COMMENT ON TABLE public.tenant_settings IS 'Configurações personalizadas por tenant. Utilizada nas telas de administração. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_features IS 'Feature flags por tenant para ativação seletiva de funcionalidades. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_branding IS 'Personalização visual (logo, cores) por tenant. Utilizada no layout da aplicação. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_subscriptions IS 'Assinatura ativa de cada tenant vinculada ao plano. Relacionada com tenants e subscription_plans.';
COMMENT ON TABLE public.tenant_action_policies IS 'Políticas de ação configuráveis por tenant para controle de operações. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_job_quotas IS 'Limites de jobs por tenant para controle de uso. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_suspension_config IS 'Configuração de suspensão automática de tenants inativos. Relacionada com tenants.';
COMMENT ON TABLE public.subscription_plans IS 'Planos de assinatura disponíveis no sistema (free, pro, enterprise). Utilizada nas telas de billing.';
COMMENT ON TABLE public.stripe_plan_mapping IS 'Mapeamento entre planos internos e IDs do Stripe. Utilizada na integração de pagamentos.';
COMMENT ON TABLE public.subscription_events IS 'Eventos de ciclo de vida das assinaturas (criação, upgrade, cancelamento). Utilizada no webhook do Stripe.';
COMMENT ON TABLE public.custom_trials IS 'Períodos de teste personalizados para tenants específicos. Utilizada no módulo comercial.';

-- ── Agentes (Endpoints) ──
COMMENT ON TABLE public.agents IS 'Tabela principal de agentes (endpoints monitorados). Utilizada em todo o sistema de monitoramento. Relacionada com tenants e enrollment_keys.';
COMMENT ON TABLE public.agent_tokens IS 'Tokens de autenticação dos agentes para comunicação com o backend. Relacionada com agents.';
COMMENT ON TABLE public.enrollment_keys IS 'Chaves de enrollment para registro de novos agentes. Utilizada no fluxo de deploy. Relacionada com tenants.';
COMMENT ON TABLE public.agent_groups IS 'Grupos lógicos de agentes para organização e aplicação de políticas. Relacionada com tenants.';
COMMENT ON TABLE public.agents_groups IS 'Tabela associativa N:N entre agentes e grupos. Relacionada com agents e agent_groups.';
COMMENT ON TABLE public.agent_tags IS 'Tags customizáveis para categorização de agentes. Relacionada com tenants.';
COMMENT ON TABLE public.agent_tag_assignments IS 'Atribuição de tags aos agentes (N:N). Relacionada com agents e agent_tags.';
COMMENT ON TABLE public.agent_group_policies IS 'Políticas de segurança atribuídas a grupos de agentes. Relacionada com agent_groups e security_policies.';
COMMENT ON TABLE public.agent_versions IS 'Registro de versões dos agentes instalados. Utilizada no controle de atualização. Relacionada com agents.';
COMMENT ON TABLE public.agent_releases IS 'Releases publicados do agente para distribuição. Utilizada no módulo de atualização.';
COMMENT ON TABLE public.agent_builds IS 'Builds compilados do agente com hash de integridade. Utilizada no pipeline de CI/CD. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_signing_keys IS 'Chaves criptográficas para assinatura de builds do agente. Relacionada com tenants.';

-- ── Métricas & Monitoramento ──
COMMENT ON TABLE public.agent_system_metrics_partitioned IS 'Métricas de sistema dos agentes (CPU, RAM) particionada por mês. Utilizada nos dashboards de monitoramento.';
COMMENT ON TABLE public.agent_system_metrics_2026_02 IS 'Partição de métricas de sistema para fevereiro/2026.';
COMMENT ON TABLE public.agent_disk_metrics IS 'Métricas de disco dos agentes (uso, espaço livre). Utilizada nos dashboards e alertas. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_network_info IS 'Informações de rede dos agentes (IP, MAC, gateway). Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_network_metrics IS 'Métricas de rede dos agentes (throughput, latência). Relacionada com agents.';
COMMENT ON TABLE public.agent_metrics_daily IS 'Métricas agregadas diárias dos agentes para relatórios. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_processes IS 'Lista de processos em execução nos agentes. Utilizada na análise de segurança. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_usb_devices IS 'Dispositivos USB conectados aos agentes. Utilizada no controle de periféricos. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_certificates IS 'Certificados digitais instalados nos agentes. Utilizada na auditoria de PKI. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_web_activity IS 'Atividade de navegação web dos agentes. Utilizada no módulo de DLP e compliance. Relacionada com agents e tenants.';
COMMENT ON TABLE public.performance_metrics IS 'Métricas de performance geral do sistema. Utilizada nos dashboards de SRE.';
COMMENT ON TABLE public.edge_function_metrics IS 'Métricas de execução das edge functions do backend. Utilizada no monitoramento de infraestrutura.';

-- ── Segurança & Compliance ──
COMMENT ON TABLE public.security_policies IS 'Políticas de segurança configuráveis (firewall, antivírus, etc.). Utilizada no módulo de governança. Relacionada com tenants.';
COMMENT ON TABLE public.policy_rules IS 'Regras individuais dentro de uma política de segurança. Relacionada com security_policies.';
COMMENT ON TABLE public.policy_assignments IS 'Atribuição de políticas a agentes ou grupos. Relacionada com security_policies e agents.';
COMMENT ON TABLE public.policy_enforcement_logs IS 'Logs de aplicação/violação de políticas nos agentes. Utilizada em auditoria. Relacionada com tenants.';
COMMENT ON TABLE public.compliance_policies IS 'Políticas de compliance (SOC2, ISO27001, etc.). Utilizada no módulo de governança. Relacionada com tenants.';
COMMENT ON TABLE public.compliance_snapshots IS 'Snapshots periódicos do estado de compliance. Utilizada em relatórios. Relacionada com tenants.';
COMMENT ON TABLE public.soc2_controls IS 'Controles SOC2 mapeados e seu estado de conformidade. Utilizada no painel de compliance. Relacionada com tenants.';
COMMENT ON TABLE public.soc2_criteria IS 'Critérios SOC2 Trust Services. Utilizada como referência para os controles. Relacionada com soc2_controls.';
COMMENT ON TABLE public.governance_adrs IS 'Architecture Decision Records para governança técnica.';
COMMENT ON TABLE public.governance_reports IS 'Relatórios de governança gerados automaticamente. Relacionada com tenants.';
COMMENT ON TABLE public.security_events IS 'Eventos de segurança detectados (alertas, violações). Utilizada no SIEM interno. Relacionada com tenants e agents.';
COMMENT ON TABLE public.security_logs IS 'Logs detalhados de segurança para auditoria forense. Relacionada com tenants.';
COMMENT ON TABLE public.security_reports IS 'Relatórios de segurança consolidados. Utilizada no painel executivo. Relacionada com tenants.';
COMMENT ON TABLE public.antivirus_status IS 'Estado do antivírus nos agentes monitorados. Utilizada no painel de proteção. Relacionada com agents e tenants.';
COMMENT ON TABLE public.quarantined_files IS 'Arquivos em quarentena detectados por antivírus ou políticas. Relacionada com agents e tenants.';
COMMENT ON TABLE public.virus_scans IS 'Resultados de varreduras de vírus executadas nos agentes. Relacionada com tenants.';
COMMENT ON TABLE public.blocked_websites IS 'Lista de websites bloqueados por políticas de acesso. Relacionada com tenants.';
COMMENT ON TABLE public.blocked_access_attempts IS 'Tentativas de acesso bloqueadas (web, USB, etc.). Relacionada com tenants.';
COMMENT ON TABLE public.web_access_policies IS 'Políticas de acesso web configuráveis por tenant. Relacionada com tenants.';
COMMENT ON TABLE public.ip_blocklist IS 'Lista global de IPs bloqueados para proteção do sistema.';
COMMENT ON TABLE public.segregation_rules IS 'Regras de segregação de duties para compliance. Relacionada com tenants.';

-- ── Vulnerabilidades & CVE ──
COMMENT ON TABLE public.vuln_findings IS 'Achados de vulnerabilidade detectados nos agentes. Utilizada no painel de segurança. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_vulnerabilities IS 'Vulnerabilidades específicas associadas aos agentes. Relacionada com agents e cve_database.';
COMMENT ON TABLE public.agent_vulnerability_scans IS 'Registro de varreduras de vulnerabilidade executadas. Relacionada com agents e tenants.';
COMMENT ON TABLE public.cve_database IS 'Base de dados de CVEs conhecidas sincronizada de fontes externas.';
COMMENT ON TABLE public.cve_sync_status IS 'Estado da sincronização da base de CVEs. Utilizada pelo cron de atualização.';
COMMENT ON TABLE public.software_inventory IS 'Inventário de software instalado nos agentes. Utilizada no módulo de gestão de ativos. Relacionada com agents e tenants.';
COMMENT ON TABLE public.software_knowledge_base IS 'Base de conhecimento sobre softwares (risco, categoria). Utilizada na classificação automática.';
COMMENT ON TABLE public.software_vulnerability_baseline IS 'Baseline de vulnerabilidades por software para detecção de desvios.';

-- ── Jobs & Automação ──
COMMENT ON TABLE public.jobs IS 'Jobs (tarefas remotas) enviados para execução nos agentes. Utilizada no módulo de operações. Relacionada com agents e tenants.';
COMMENT ON TABLE public.job_executions IS 'Execuções individuais de jobs com resultado e logs. Trilha de auditoria imutável. Relacionada com jobs.';
COMMENT ON TABLE public.scheduled_jobs IS 'Jobs agendados para execução periódica. Relacionada com tenants.';
COMMENT ON TABLE public.scheduled_job_runs IS 'Registro de execuções de jobs agendados. Relacionada com scheduled_jobs.';
COMMENT ON TABLE public.scheduled_job_heartbeat IS 'Heartbeat dos jobs agendados para detecção de falhas. Relacionada com scheduled_jobs.';
COMMENT ON TABLE public.tasks IS 'Tarefas operacionais de alto nível. Utilizada no módulo de gerenciamento. Relacionada com tenants.';
COMMENT ON TABLE public.failed_jobs_dlq IS 'Dead Letter Queue para jobs que falharam múltiplas vezes. Relacionada com jobs.';
COMMENT ON TABLE public.automation_rules IS 'Regras de automação para ações baseadas em eventos. Utilizada no motor de regras. Relacionada com tenants.';
COMMENT ON TABLE public.automation_executions IS 'Execuções de regras de automação com resultado. Relacionada com automation_rules.';
COMMENT ON TABLE public.playbooks IS 'Playbooks de resposta a incidentes. Utilizada no módulo de SOAR. Relacionada com tenants.';
COMMENT ON TABLE public.playbook_actions IS 'Ações individuais dentro de um playbook. Relacionada com playbooks.';
COMMENT ON TABLE public.playbook_executions IS 'Execuções de playbooks com estado e resultado. Relacionada com playbooks e tenants.';
COMMENT ON TABLE public.runbooks IS 'Runbooks operacionais para procedimentos padronizados. Relacionada com tenants.';

-- ── IA & Decisões ──
COMMENT ON TABLE public.ai_actions IS 'Ações de IA disponíveis no sistema. Utilizada no motor de decisão inteligente. Relacionada com tenants.';
COMMENT ON TABLE public.ai_action_configs IS 'Configurações de ações de IA por tenant. Relacionada com ai_actions e tenants.';
COMMENT ON TABLE public.ai_action_executions IS 'Execuções de ações de IA com entrada/saída. Relacionada com ai_actions e tenants.';
COMMENT ON TABLE public.ai_action_logs IS 'Logs detalhados de ações de IA para auditoria. Relacionada com tenants.';
COMMENT ON TABLE public.ai_action_validations IS 'Validações humanas de decisões de IA (human-in-the-loop). Relacionada com tenants.';
COMMENT ON TABLE public.ai_insights IS 'Insights gerados por IA sobre o estado dos agentes. Utilizada no dashboard. Relacionada com agents e tenants.';
COMMENT ON TABLE public.ai_insight_feedback IS 'Feedback dos usuários sobre insights de IA. Relacionada com ai_insights.';
COMMENT ON TABLE public.ai_anomalies IS 'Anomalias detectadas pelo motor de IA. Utilizada nos alertas inteligentes. Relacionada com tenants.';
COMMENT ON TABLE public.ai_decision_reports IS 'Relatórios de decisões tomadas pela IA. Utilizada na governança de IA. Relacionada com tenants.';
COMMENT ON TABLE public.ai_inference_metrics IS 'Métricas de inferência do modelo de IA (latência, accuracy). Utilizada no monitoramento de IA.';
COMMENT ON TABLE public.ai_learned_patterns IS 'Padrões aprendidos pelo motor de IA para detecção de anomalias. Relacionada com tenants.';
COMMENT ON TABLE public.ai_rejected_decisions IS 'Decisões de IA rejeitadas por revisores humanos. Relacionada com tenants.';
COMMENT ON TABLE public.ai_response_cache IS 'Cache de respostas de IA para otimização de performance. Acesso restrito a service_role.';
COMMENT ON TABLE public.anomaly_events IS 'Eventos de anomalia detectados nos agentes. Utilizada no painel de segurança. Relacionada com agents e tenants.';
COMMENT ON TABLE public.decision_events IS 'Eventos de decisão registrados pelo motor de regras. Relacionada com tenants.';
COMMENT ON TABLE public.decision_rules IS 'Regras do motor de decisão para automação de ações. Relacionada com tenants.';

-- ── Auditoria & Evidências ──
COMMENT ON TABLE public.audit_logs IS 'Log de auditoria imutável para todas as ações do sistema. Utilizada em compliance e forense. Relacionada com tenants.';
COMMENT ON TABLE public.audit_confidence_gaps IS 'Lacunas de confiança identificadas em auditorias. Relacionada com tenants.';
COMMENT ON TABLE public.audit_integrity_checks IS 'Verificações de integridade dos registros de auditoria.';
COMMENT ON TABLE public.audit_reason_trees IS 'Árvores de razão para decisões auditadas. Relacionada com tenants.';
COMMENT ON TABLE public.audit_report_verifications IS 'Verificações de autenticidade de relatórios de auditoria.';
COMMENT ON TABLE public.agent_evidence_logs IS 'Logs de evidência dos agentes com hash de integridade. Trilha imutável. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_execution_chain IS 'Cadeia de execução do agente com hash encadeado para prova de integridade. Relacionada com agents.';
COMMENT ON TABLE public.evidence_bundles IS 'Pacotes de evidência consolidados para investigações. Relacionada com tenants.';
COMMENT ON TABLE public.forensic_snapshots IS 'Snapshots forenses de agentes para investigação de incidentes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.poe_chain_breaks IS 'Quebras detectadas na cadeia de Proof of Execution. Relacionada com agents.';

-- ── Incidentes & SLO ──
COMMENT ON TABLE public.system_alerts IS 'Alertas do sistema para eventos críticos e operacionais. Utilizada no painel de alertas. Relacionada com tenants.';
COMMENT ON TABLE public.incident_timelines IS 'Linhas do tempo de incidentes com eventos ordenados. Relacionada com tenants.';
COMMENT ON TABLE public.incident_slo_state IS 'Estado de SLO por incidente para monitoramento de conformidade. Relacionada com tenants.';
COMMENT ON TABLE public.job_slo_state IS 'Estado de SLO por job para monitoramento de performance. Relacionada com jobs.';
COMMENT ON TABLE public.slo_definitions IS 'Definições de SLOs (Service Level Objectives) configuráveis. Relacionada com tenants.';
COMMENT ON TABLE public.persistent_failure_alerts IS 'Alertas de falhas persistentes para escalonamento. Relacionada com tenants.';
COMMENT ON TABLE public.failure_fingerprints IS 'Fingerprints de falhas para agrupamento e deduplicação. Relacionada com tenants.';
COMMENT ON TABLE public.failure_occurrences IS 'Ocorrências individuais de cada fingerprint de falha. Relacionada com failure_fingerprints.';
COMMENT ON TABLE public.circuit_breaker_events IS 'Eventos de circuit breaker para proteção contra falhas em cascata. Relacionada com tenants.';
COMMENT ON TABLE public.network_anomalies IS 'Anomalias de rede detectadas nos agentes. Relacionada com tenants.';

-- ── Atualizações & Rollback ──
COMMENT ON TABLE public.agent_updates IS 'Atualizações de agentes com estado e versionamento. Relacionada com agents.';
COMMENT ON TABLE public.agent_update_decisions IS 'Decisões de atualização tomadas pelo sistema para cada agente. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_update_policies IS 'Políticas de atualização (janela, canal, auto-update). Relacionada com tenants.';
COMMENT ON TABLE public.agent_rollback_events IS 'Eventos de rollback de atualização de agentes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_safe_mode_events IS 'Eventos de ativação do modo seguro dos agentes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_quarantine IS 'Agentes em quarentena por comportamento suspeito. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_recovery_authorizations IS 'Autorizações de recuperação para agentes em quarentena. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_light_mode_configs IS 'Configuração do modo leve do agente para redução de consumo. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_archive_events IS 'Eventos de arquivamento de agentes inativos. Relacionada com agents.';
COMMENT ON TABLE public.update_packages IS 'Pacotes de atualização disponíveis para download pelos agentes. Utilizada no OTA.';

-- ── Integridade & HMAC ──
COMMENT ON TABLE public.agent_file_integrity IS 'Verificações de integridade de arquivos nos agentes (FIM). Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_behavioral_baseline IS 'Baseline comportamental dos agentes para detecção de anomalias. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_hmac_format_cache IS 'Cache de formato HMAC para otimização de verificação de assinaturas. Relacionada com agents.';
COMMENT ON TABLE public.hmac_signatures IS 'Tabela pai particionada de assinaturas HMAC para validação de mensagens dos agentes.';
COMMENT ON TABLE public.hmac_signatures_2026_02 IS 'Partição de assinaturas HMAC para fevereiro/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_03 IS 'Partição de assinaturas HMAC para março/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_04 IS 'Partição de assinaturas HMAC para abril/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_05 IS 'Partição de assinaturas HMAC para maio/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_06 IS 'Partição de assinaturas HMAC para junho/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_07 IS 'Partição de assinaturas HMAC para julho/2026.';

-- ── Notificações ──
COMMENT ON TABLE public.notification_channels IS 'Canais de notificação configurados (email, Slack, webhook). Relacionada com tenants.';
COMMENT ON TABLE public.notification_preferences IS 'Preferências de notificação por usuário. Relacionada com profiles e tenants.';
COMMENT ON TABLE public.notification_queue IS 'Fila de notificações pendentes de envio. Relacionada com tenants.';
COMMENT ON TABLE public.notification_log IS 'Log de notificações enviadas para auditoria. Relacionada com tenants.';
COMMENT ON TABLE public.notification_deliveries IS 'Estado de entrega de cada notificação. Relacionada com notification_queue.';

-- ── Relatórios ──
COMMENT ON TABLE public.reports IS 'Definições de relatórios configuráveis. Utilizada no módulo de relatórios. Relacionada com tenants.';
COMMENT ON TABLE public.report_executions IS 'Execuções de relatórios com resultado e artefatos. Relacionada com reports.';
COMMENT ON TABLE public.scheduled_reports IS 'Agendamento de relatórios recorrentes. Relacionada com reports e tenants.';
COMMENT ON TABLE public.generated_reports IS 'Relatórios finais gerados e prontos para download. Relacionada com tenants.';

-- ── Aprovações & Workflow ──
COMMENT ON TABLE public.approval_requests IS 'Solicitações de aprovação para ações sensíveis. Relacionada com tenants.';
COMMENT ON TABLE public.approval_chains IS 'Cadeias de aprovação multi-nível configuráveis. Relacionada com tenants.';
COMMENT ON TABLE public.approvals IS 'Registros de aprovações/rejeições individuais. Relacionada com approval_requests.';

-- ── API & Rate Limiting ──
COMMENT ON TABLE public.api_keys IS 'Chaves de API para integração externa. Relacionada com tenants.';
COMMENT ON TABLE public.api_request_logs IS 'Logs de requisições à API para monitoramento e rate limiting. Relacionada com tenants.';
COMMENT ON TABLE public.rate_limits IS 'Configurações de rate limiting por endpoint e tenant. Relacionada com tenants.';

-- ── Risco & Vendor ──
COMMENT ON TABLE public.risk_decision_log IS 'Log de decisões de risco para rastreabilidade. Relacionada com tenants.';
COMMENT ON TABLE public.risk_delta_snapshots IS 'Snapshots de variação de risco ao longo do tempo. Relacionada com tenants.';
COMMENT ON TABLE public.event_risk_scoring IS 'Scoring de risco por evento para priorização. Relacionada com tenants.';
COMMENT ON TABLE public.vendor_risk_registry IS 'Registro de riscos de fornecedores terceiros. Relacionada com tenants.';
COMMENT ON TABLE public.red_team_assessments IS 'Avaliações de red team para teste de segurança. Relacionada com tenants.';
COMMENT ON TABLE public.blast_radius_policies IS 'Políticas de raio de impacto para contenção de incidentes. Relacionada com tenants.';
COMMENT ON TABLE public.auto_remediation_actions IS 'Ações de remediação automática configuradas. Relacionada com tenants.';

-- ── Comercial & Marketing ──
COMMENT ON TABLE public.sales_contacts IS 'Contatos comerciais para pipeline de vendas. Utilizada no módulo comercial.';
COMMENT ON TABLE public.sales_pipeline IS 'Pipeline de vendas com estágios e valores. Utilizada no dashboard comercial.';
COMMENT ON TABLE public.marketing_costs IS 'Custos de marketing por canal e período. Utilizada na análise de ROI.';
COMMENT ON TABLE public.installation_analytics IS 'Analíticas de instalação dos agentes. Utilizada em métricas de adoção.';

-- ── Infraestrutura & Observabilidade ──
COMMENT ON TABLE public.cron_health IS 'Estado de saúde dos cron jobs do sistema.';
COMMENT ON TABLE public.cron_health_checks IS 'Verificações de saúde individuais dos cron jobs.';
COMMENT ON TABLE public.chaos_test_results IS 'Resultados de testes de caos para resiliência.';
COMMENT ON TABLE public.rollback_test_results IS 'Resultados de testes de rollback para validação de recuperação.';
COMMENT ON TABLE public.rls_test_results IS 'Resultados de testes de RLS para validação de isolamento.';
COMMENT ON TABLE public.domain_events IS 'Eventos de domínio para arquitetura orientada a eventos.';
COMMENT ON TABLE public.platform_configs IS 'Configurações globais da plataforma.';
COMMENT ON TABLE public.feature_flags IS 'Feature flags globais para ativação/desativação de funcionalidades.';
COMMENT ON TABLE public.system_kill_switch IS 'Kill switch para desativação emergencial de funcionalidades.';
COMMENT ON TABLE public.system_state IS 'Estado global do sistema para monitoramento de saúde.';
COMMENT ON TABLE public.operational_calendar IS 'Calendário operacional para janelas de manutenção. Relacionada com tenants.';

-- ── ITSM & Integrações ──
COMMENT ON TABLE public.itsm_integrations IS 'Integrações com sistemas ITSM (ServiceNow, Jira). Relacionada com tenants.';
COMMENT ON TABLE public.itsm_tickets IS 'Tickets criados em sistemas ITSM integrados. Relacionada com itsm_integrations e tenants.';
COMMENT ON TABLE public.siem_export_configs IS 'Configurações de exportação para SIEMs externos. Relacionada com tenants.';
COMMENT ON TABLE public.user_roles IS 'Atribuição de roles (viewer, operator, admin, etc.) por tenant. Relacionada com tenants e auth.users.';

-- ═══════════════════════════════════════════════════════════════
-- ETAPA 7: TRIGGERS DE updated_at FALTANTES
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT t.table_name 
    FROM information_schema.tables t
    JOIN information_schema.columns c 
      ON t.table_name = c.table_name AND c.column_name = 'updated_at'
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();',
      r.table_name, r.table_name
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- ETAPA 6: INDEXES FALTANTES EM tenant_id e agent_id
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON t.table_name = c.table_name AND c.column_name = 'tenant_id'
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes pi
      WHERE pi.schemaname = 'public'
        AND pi.tablename = t.table_name
        AND pi.indexdef LIKE '%tenant_id%'
    )
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tenant_id ON public.%I(tenant_id);',
      r.table_name, r.table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON t.table_name = c.table_name AND c.column_name = 'agent_id'
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes pi
      WHERE pi.schemaname = 'public'
        AND pi.tablename = t.table_name
        AND pi.indexdef LIKE '%agent_id%'
    )
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_agent_id ON public.%I(agent_id);',
      r.table_name, r.table_name
    );
  END LOOP;
END $$;
