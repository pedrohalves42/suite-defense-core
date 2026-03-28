
-- =====================================================================
-- ETAPA 4: Comentarios em TODAS as tabelas (corrigido)
-- ETAPA 7: Triggers de updated_at faltantes
-- ETAPA 6: Indexes faltantes em FKs
-- =====================================================================

-- ?? Autenticacao & Sessoes ??
COMMENT ON TABLE public.active_sessions IS 'Armazena sessoes ativas dos usuarios autenticados. Utilizada no controle de acesso e expiracao de sessoes. Relacionada com auth.users e tenants.';
COMMENT ON TABLE public.admin_ip_whitelist IS 'Lista de IPs permitidos para acesso administrativo. Utilizada na camada de seguranca de rede. Relacionada com tenants.';
COMMENT ON TABLE public.profiles IS 'Perfil estendido de cada usuario do sistema. Utilizada em todas as telas que exibem dados do usuario. Relacionada com auth.users (1:1) e tenants.';
COMMENT ON TABLE public.invites IS 'Convites enviados para novos usuarios ingressarem em um tenant. Utilizada no fluxo de onboarding. Relacionada com tenants e profiles.';
COMMENT ON TABLE public.onboarding_progress IS 'Progresso do onboarding de cada usuario. Utilizada nas telas de boas-vindas e setup inicial. Relacionada com profiles.';
COMMENT ON TABLE public.failed_login_attempts IS 'Registro de tentativas de login falhadas para deteccao de brute-force. Utilizada no modulo de seguranca. Relacionada com tenants.';

-- ?? Tenants & Assinaturas ??
COMMENT ON TABLE public.tenants IS 'Registro principal de cada tenant (organizacao) do sistema multi-tenant. Utilizada em todo o sistema como base de isolamento de dados.';
COMMENT ON TABLE public.tenant_settings IS 'Configuracoes personalizadas por tenant. Utilizada nas telas de administracao. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_features IS 'Feature flags por tenant para ativacao seletiva de funcionalidades. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_branding IS 'Personalizacao visual (logo, cores) por tenant. Utilizada no layout da aplicacao. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_subscriptions IS 'Assinatura ativa de cada tenant vinculada ao plano. Relacionada com tenants e subscription_plans.';
COMMENT ON TABLE public.tenant_action_policies IS 'Politicas de acao configuraveis por tenant para controle de operacoes. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_job_quotas IS 'Limites de jobs por tenant para controle de uso. Relacionada com tenants.';
COMMENT ON TABLE public.tenant_suspension_config IS 'Configuracao de suspensao automatica de tenants inativos. Relacionada com tenants.';
COMMENT ON TABLE public.subscription_plans IS 'Planos de assinatura disponiveis no sistema (free, pro, enterprise). Utilizada nas telas de billing.';
COMMENT ON TABLE public.stripe_plan_mapping IS 'Mapeamento entre planos internos e IDs do Stripe. Utilizada na integracao de pagamentos.';
COMMENT ON TABLE public.subscription_events IS 'Eventos de ciclo de vida das assinaturas (criacao, upgrade, cancelamento). Utilizada no webhook do Stripe.';
COMMENT ON TABLE public.custom_trials IS 'Periodos de teste personalizados para tenants especificos. Utilizada no modulo comercial.';

-- ?? Agentes (Endpoints) ??
COMMENT ON TABLE public.agents IS 'Tabela principal de agentes (endpoints monitorados). Utilizada em todo o sistema de monitoramento. Relacionada com tenants e enrollment_keys.';
COMMENT ON TABLE public.agent_tokens IS 'Tokens de autenticacao dos agentes para comunicacao com o backend. Relacionada com agents.';
COMMENT ON TABLE public.enrollment_keys IS 'Chaves de enrollment para registro de novos agentes. Utilizada no fluxo de deploy. Relacionada com tenants.';
COMMENT ON TABLE public.agent_groups IS 'Grupos logicos de agentes para organizacao e aplicacao de politicas. Relacionada com tenants.';
COMMENT ON TABLE public.agents_groups IS 'Tabela associativa N:N entre agentes e grupos. Relacionada com agents e agent_groups.';
COMMENT ON TABLE public.agent_tags IS 'Tags customizaveis para categorizacao de agentes. Relacionada com tenants.';
COMMENT ON TABLE public.agent_tag_assignments IS 'Atribuicao de tags aos agentes (N:N). Relacionada com agents e agent_tags.';
COMMENT ON TABLE public.agent_group_policies IS 'Politicas de seguranca atribuidas a grupos de agentes. Relacionada com agent_groups e security_policies.';
COMMENT ON TABLE public.agent_versions IS 'Registro de versoes dos agentes instalados. Utilizada no controle de atualizacao. Relacionada com agents.';
COMMENT ON TABLE public.agent_releases IS 'Releases publicados do agente para distribuicao. Utilizada no modulo de atualizacao.';
COMMENT ON TABLE public.agent_builds IS 'Builds compilados do agente com hash de integridade. Utilizada no pipeline de CI/CD. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_signing_keys IS 'Chaves criptograficas para assinatura de builds do agente. Relacionada com tenants.';

-- ?? Metricas & Monitoramento ??
COMMENT ON TABLE public.agent_system_metrics_partitioned IS 'Metricas de sistema dos agentes (CPU, RAM) particionada por mes. Utilizada nos dashboards de monitoramento.';
COMMENT ON TABLE public.agent_system_metrics_2026_02 IS 'Particao de metricas de sistema para fevereiro/2026.';
COMMENT ON TABLE public.agent_disk_metrics IS 'Metricas de disco dos agentes (uso, espaco livre). Utilizada nos dashboards e alertas. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_network_info IS 'Informacoes de rede dos agentes (IP, MAC, gateway). Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_network_metrics IS 'Metricas de rede dos agentes (throughput, latencia). Relacionada com agents.';
COMMENT ON TABLE public.agent_metrics_daily IS 'Metricas agregadas diarias dos agentes para relatorios. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_processes IS 'Lista de processos em execucao nos agentes. Utilizada na analise de seguranca. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_usb_devices IS 'Dispositivos USB conectados aos agentes. Utilizada no controle de perifericos. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_certificates IS 'Certificados digitais instalados nos agentes. Utilizada na auditoria de PKI. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_web_activity IS 'Atividade de navegacao web dos agentes. Utilizada no modulo de DLP e compliance. Relacionada com agents e tenants.';
COMMENT ON TABLE public.performance_metrics IS 'Metricas de performance geral do sistema. Utilizada nos dashboards de SRE.';
COMMENT ON TABLE public.edge_function_metrics IS 'Metricas de execucao das edge functions do backend. Utilizada no monitoramento de infraestrutura.';

-- ?? Seguranca & Compliance ??
COMMENT ON TABLE public.security_policies IS 'Politicas de seguranca configuraveis (firewall, antivirus, etc.). Utilizada no modulo de governanca. Relacionada com tenants.';
COMMENT ON TABLE public.policy_rules IS 'Regras individuais dentro de uma politica de seguranca. Relacionada com security_policies.';
COMMENT ON TABLE public.policy_assignments IS 'Atribuicao de politicas a agentes ou grupos. Relacionada com security_policies e agents.';
COMMENT ON TABLE public.policy_enforcement_logs IS 'Logs de aplicacao/violacao de politicas nos agentes. Utilizada em auditoria. Relacionada com tenants.';
COMMENT ON TABLE public.compliance_policies IS 'Politicas de compliance (SOC2, ISO27001, etc.). Utilizada no modulo de governanca. Relacionada com tenants.';
COMMENT ON TABLE public.compliance_snapshots IS 'Snapshots periodicos do estado de compliance. Utilizada em relatorios. Relacionada com tenants.';
COMMENT ON TABLE public.soc2_controls IS 'Controles SOC2 mapeados e seu estado de conformidade. Utilizada no painel de compliance. Relacionada com tenants.';
COMMENT ON TABLE public.soc2_criteria IS 'Criterios SOC2 Trust Services. Utilizada como referencia para os controles. Relacionada com soc2_controls.';
COMMENT ON TABLE public.governance_adrs IS 'Architecture Decision Records para governanca tecnica.';
COMMENT ON TABLE public.governance_reports IS 'Relatorios de governanca gerados automaticamente. Relacionada com tenants.';
COMMENT ON TABLE public.security_events IS 'Eventos de seguranca detectados (alertas, violacoes). Utilizada no SIEM interno. Relacionada com tenants e agents.';
COMMENT ON TABLE public.security_logs IS 'Logs detalhados de seguranca para auditoria forense. Relacionada com tenants.';
COMMENT ON TABLE public.security_reports IS 'Relatorios de seguranca consolidados. Utilizada no painel executivo. Relacionada com tenants.';
COMMENT ON TABLE public.antivirus_status IS 'Estado do antivirus nos agentes monitorados. Utilizada no painel de protecao. Relacionada com agents e tenants.';
COMMENT ON TABLE public.quarantined_files IS 'Arquivos em quarentena detectados por antivirus ou politicas. Relacionada com agents e tenants.';
COMMENT ON TABLE public.virus_scans IS 'Resultados de varreduras de virus executadas nos agentes. Relacionada com tenants.';
COMMENT ON TABLE public.blocked_websites IS 'Lista de websites bloqueados por politicas de acesso. Relacionada com tenants.';
COMMENT ON TABLE public.blocked_access_attempts IS 'Tentativas de acesso bloqueadas (web, USB, etc.). Relacionada com tenants.';
COMMENT ON TABLE public.web_access_policies IS 'Politicas de acesso web configuraveis por tenant. Relacionada com tenants.';
COMMENT ON TABLE public.ip_blocklist IS 'Lista global de IPs bloqueados para protecao do sistema.';
COMMENT ON TABLE public.segregation_rules IS 'Regras de segregacao de duties para compliance. Relacionada com tenants.';

-- ?? Vulnerabilidades & CVE ??
COMMENT ON TABLE public.vuln_findings IS 'Achados de vulnerabilidade detectados nos agentes. Utilizada no painel de seguranca. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_vulnerabilities IS 'Vulnerabilidades especificas associadas aos agentes. Relacionada com agents e cve_database.';
COMMENT ON TABLE public.agent_vulnerability_scans IS 'Registro de varreduras de vulnerabilidade executadas. Relacionada com agents e tenants.';
COMMENT ON TABLE public.cve_database IS 'Base de dados de CVEs conhecidas sincronizada de fontes externas.';
COMMENT ON TABLE public.cve_sync_status IS 'Estado da sincronizacao da base de CVEs. Utilizada pelo cron de atualizacao.';
COMMENT ON TABLE public.software_inventory IS 'Inventario de software instalado nos agentes. Utilizada no modulo de gestao de ativos. Relacionada com agents e tenants.';
COMMENT ON TABLE public.software_knowledge_base IS 'Base de conhecimento sobre softwares (risco, categoria). Utilizada na classificacao automatica.';
COMMENT ON TABLE public.software_vulnerability_baseline IS 'Baseline de vulnerabilidades por software para deteccao de desvios.';

-- ?? Jobs & Automacao ??
COMMENT ON TABLE public.jobs IS 'Jobs (tarefas remotas) enviados para execucao nos agentes. Utilizada no modulo de operacoes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.job_executions IS 'Execucoes individuais de jobs com resultado e logs. Trilha de auditoria imutavel. Relacionada com jobs.';
COMMENT ON TABLE public.scheduled_jobs IS 'Jobs agendados para execucao periodica. Relacionada com tenants.';
COMMENT ON TABLE public.scheduled_job_runs IS 'Registro de execucoes de jobs agendados. Relacionada com scheduled_jobs.';
COMMENT ON TABLE public.scheduled_job_heartbeat IS 'Heartbeat dos jobs agendados para deteccao de falhas. Relacionada com scheduled_jobs.';
COMMENT ON TABLE public.tasks IS 'Tarefas operacionais de alto nivel. Utilizada no modulo de gerenciamento. Relacionada com tenants.';
COMMENT ON TABLE public.failed_jobs_dlq IS 'Dead Letter Queue para jobs que falharam multiplas vezes. Relacionada com jobs.';
COMMENT ON TABLE public.automation_rules IS 'Regras de automacao para acoes baseadas em eventos. Utilizada no motor de regras. Relacionada com tenants.';
COMMENT ON TABLE public.automation_executions IS 'Execucoes de regras de automacao com resultado. Relacionada com automation_rules.';
COMMENT ON TABLE public.playbooks IS 'Playbooks de resposta a incidentes. Utilizada no modulo de SOAR. Relacionada com tenants.';
COMMENT ON TABLE public.playbook_actions IS 'Acoes individuais dentro de um playbook. Relacionada com playbooks.';
COMMENT ON TABLE public.playbook_executions IS 'Execucoes de playbooks com estado e resultado. Relacionada com playbooks e tenants.';
COMMENT ON TABLE public.runbooks IS 'Runbooks operacionais para procedimentos padronizados. Relacionada com tenants.';

-- ?? IA & Decisoes ??
COMMENT ON TABLE public.ai_actions IS 'Acoes de IA disponiveis no sistema. Utilizada no motor de decisao inteligente. Relacionada com tenants.';
COMMENT ON TABLE public.ai_action_configs IS 'Configuracoes de acoes de IA por tenant. Relacionada com ai_actions e tenants.';
COMMENT ON TABLE public.ai_action_executions IS 'Execucoes de acoes de IA com entrada/saida. Relacionada com ai_actions e tenants.';
COMMENT ON TABLE public.ai_action_logs IS 'Logs detalhados de acoes de IA para auditoria. Relacionada com tenants.';
COMMENT ON TABLE public.ai_action_validations IS 'Validacoes humanas de decisoes de IA (human-in-the-loop). Relacionada com tenants.';
COMMENT ON TABLE public.ai_insights IS 'Insights gerados por IA sobre o estado dos agentes. Utilizada no dashboard. Relacionada com agents e tenants.';
COMMENT ON TABLE public.ai_insight_feedback IS 'Feedback dos usuarios sobre insights de IA. Relacionada com ai_insights.';
COMMENT ON TABLE public.ai_anomalies IS 'Anomalias detectadas pelo motor de IA. Utilizada nos alertas inteligentes. Relacionada com tenants.';
COMMENT ON TABLE public.ai_decision_reports IS 'Relatorios de decisoes tomadas pela IA. Utilizada na governanca de IA. Relacionada com tenants.';
COMMENT ON TABLE public.ai_inference_metrics IS 'Metricas de inferencia do modelo de IA (latencia, accuracy). Utilizada no monitoramento de IA.';
COMMENT ON TABLE public.ai_learned_patterns IS 'Padroes aprendidos pelo motor de IA para deteccao de anomalias. Relacionada com tenants.';
COMMENT ON TABLE public.ai_rejected_decisions IS 'Decisoes de IA rejeitadas por revisores humanos. Relacionada com tenants.';
COMMENT ON TABLE public.ai_response_cache IS 'Cache de respostas de IA para otimizacao de performance. Acesso restrito a service_role.';
COMMENT ON TABLE public.anomaly_events IS 'Eventos de anomalia detectados nos agentes. Utilizada no painel de seguranca. Relacionada com agents e tenants.';
COMMENT ON TABLE public.decision_events IS 'Eventos de decisao registrados pelo motor de regras. Relacionada com tenants.';
COMMENT ON TABLE public.decision_rules IS 'Regras do motor de decisao para automacao de acoes. Relacionada com tenants.';

-- ?? Auditoria & Evidencias ??
COMMENT ON TABLE public.audit_logs IS 'Log de auditoria imutavel para todas as acoes do sistema. Utilizada em compliance e forense. Relacionada com tenants.';
COMMENT ON TABLE public.audit_confidence_gaps IS 'Lacunas de confianca identificadas em auditorias. Relacionada com tenants.';
COMMENT ON TABLE public.audit_integrity_checks IS 'Verificacoes de integridade dos registros de auditoria.';
COMMENT ON TABLE public.audit_reason_trees IS 'Arvores de razao para decisoes auditadas. Relacionada com tenants.';
COMMENT ON TABLE public.audit_report_verifications IS 'Verificacoes de autenticidade de relatorios de auditoria.';
COMMENT ON TABLE public.agent_evidence_logs IS 'Logs de evidencia dos agentes com hash de integridade. Trilha imutavel. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_execution_chain IS 'Cadeia de execucao do agente com hash encadeado para prova de integridade. Relacionada com agents.';
COMMENT ON TABLE public.evidence_bundles IS 'Pacotes de evidencia consolidados para investigacoes. Relacionada com tenants.';
COMMENT ON TABLE public.forensic_snapshots IS 'Snapshots forenses de agentes para investigacao de incidentes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.poe_chain_breaks IS 'Quebras detectadas na cadeia de Proof of Execution. Relacionada com agents.';

-- ?? Incidentes & SLO ??
COMMENT ON TABLE public.system_alerts IS 'Alertas do sistema para eventos criticos e operacionais. Utilizada no painel de alertas. Relacionada com tenants.';
COMMENT ON TABLE public.incident_timelines IS 'Linhas do tempo de incidentes com eventos ordenados. Relacionada com tenants.';
COMMENT ON TABLE public.incident_slo_state IS 'Estado de SLO por incidente para monitoramento de conformidade. Relacionada com tenants.';
COMMENT ON TABLE public.job_slo_state IS 'Estado de SLO por job para monitoramento de performance. Relacionada com jobs.';
COMMENT ON TABLE public.slo_definitions IS 'Definicoes de SLOs (Service Level Objectives) configuraveis. Relacionada com tenants.';
COMMENT ON TABLE public.persistent_failure_alerts IS 'Alertas de falhas persistentes para escalonamento. Relacionada com tenants.';
COMMENT ON TABLE public.failure_fingerprints IS 'Fingerprints de falhas para agrupamento e deduplicacao. Relacionada com tenants.';
COMMENT ON TABLE public.failure_occurrences IS 'Ocorrencias individuais de cada fingerprint de falha. Relacionada com failure_fingerprints.';
COMMENT ON TABLE public.circuit_breaker_events IS 'Eventos de circuit breaker para protecao contra falhas em cascata. Relacionada com tenants.';
COMMENT ON TABLE public.network_anomalies IS 'Anomalias de rede detectadas nos agentes. Relacionada com tenants.';

-- ?? Atualizacoes & Rollback ??
COMMENT ON TABLE public.agent_updates IS 'Atualizacoes de agentes com estado e versionamento. Relacionada com agents.';
COMMENT ON TABLE public.agent_update_decisions IS 'Decisoes de atualizacao tomadas pelo sistema para cada agente. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_update_policies IS 'Politicas de atualizacao (janela, canal, auto-update). Relacionada com tenants.';
COMMENT ON TABLE public.agent_rollback_events IS 'Eventos de rollback de atualizacao de agentes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_safe_mode_events IS 'Eventos de ativacao do modo seguro dos agentes. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_quarantine IS 'Agentes em quarentena por comportamento suspeito. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_recovery_authorizations IS 'Autorizacoes de recuperacao para agentes em quarentena. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_light_mode_configs IS 'Configuracao do modo leve do agente para reducao de consumo. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_archive_events IS 'Eventos de arquivamento de agentes inativos. Relacionada com agents.';
COMMENT ON TABLE public.update_packages IS 'Pacotes de atualizacao disponiveis para download pelos agentes. Utilizada no OTA.';

-- ?? Integridade & HMAC ??
COMMENT ON TABLE public.agent_file_integrity IS 'Verificacoes de integridade de arquivos nos agentes (FIM). Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_behavioral_baseline IS 'Baseline comportamental dos agentes para deteccao de anomalias. Relacionada com agents e tenants.';
COMMENT ON TABLE public.agent_hmac_format_cache IS 'Cache de formato HMAC para otimizacao de verificacao de assinaturas. Relacionada com agents.';
COMMENT ON TABLE public.hmac_signatures IS 'Tabela pai particionada de assinaturas HMAC para validacao de mensagens dos agentes.';
COMMENT ON TABLE public.hmac_signatures_2026_02 IS 'Particao de assinaturas HMAC para fevereiro/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_03 IS 'Particao de assinaturas HMAC para marco/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_04 IS 'Particao de assinaturas HMAC para abril/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_05 IS 'Particao de assinaturas HMAC para maio/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_06 IS 'Particao de assinaturas HMAC para junho/2026.';
COMMENT ON TABLE public.hmac_signatures_2026_07 IS 'Particao de assinaturas HMAC para julho/2026.';

-- ?? Notificacoes ??
COMMENT ON TABLE public.notification_channels IS 'Canais de notificacao configurados (email, Slack, webhook). Relacionada com tenants.';
COMMENT ON TABLE public.notification_preferences IS 'Preferencias de notificacao por usuario. Relacionada com profiles e tenants.';
COMMENT ON TABLE public.notification_queue IS 'Fila de notificacoes pendentes de envio. Relacionada com tenants.';
COMMENT ON TABLE public.notification_log IS 'Log de notificacoes enviadas para auditoria. Relacionada com tenants.';
COMMENT ON TABLE public.notification_deliveries IS 'Estado de entrega de cada notificacao. Relacionada com notification_queue.';

-- ?? Relatorios ??
COMMENT ON TABLE public.reports IS 'Definicoes de relatorios configuraveis. Utilizada no modulo de relatorios. Relacionada com tenants.';
COMMENT ON TABLE public.report_executions IS 'Execucoes de relatorios com resultado e artefatos. Relacionada com reports.';
COMMENT ON TABLE public.scheduled_reports IS 'Agendamento de relatorios recorrentes. Relacionada com reports e tenants.';
COMMENT ON TABLE public.generated_reports IS 'Relatorios finais gerados e prontos para download. Relacionada com tenants.';

-- ?? Aprovacoes & Workflow ??
COMMENT ON TABLE public.approval_requests IS 'Solicitacoes de aprovacao para acoes sensiveis. Relacionada com tenants.';
COMMENT ON TABLE public.approval_chains IS 'Cadeias de aprovacao multi-nivel configuraveis. Relacionada com tenants.';
COMMENT ON TABLE public.approvals IS 'Registros de aprovacoes/rejeicoes individuais. Relacionada com approval_requests.';

-- ?? API & Rate Limiting ??
COMMENT ON TABLE public.api_keys IS 'Chaves de API para integracao externa. Relacionada com tenants.';
COMMENT ON TABLE public.api_request_logs IS 'Logs de requisicoes a API para monitoramento e rate limiting. Relacionada com tenants.';
COMMENT ON TABLE public.rate_limits IS 'Configuracoes de rate limiting por endpoint e tenant. Relacionada com tenants.';

-- ?? Risco & Vendor ??
COMMENT ON TABLE public.risk_decision_log IS 'Log de decisoes de risco para rastreabilidade. Relacionada com tenants.';
COMMENT ON TABLE public.risk_delta_snapshots IS 'Snapshots de variacao de risco ao longo do tempo. Relacionada com tenants.';
COMMENT ON TABLE public.event_risk_scoring IS 'Scoring de risco por evento para priorizacao. Relacionada com tenants.';
COMMENT ON TABLE public.vendor_risk_registry IS 'Registro de riscos de fornecedores terceiros. Relacionada com tenants.';
COMMENT ON TABLE public.red_team_assessments IS 'Avaliacoes de red team para teste de seguranca. Relacionada com tenants.';
COMMENT ON TABLE public.blast_radius_policies IS 'Politicas de raio de impacto para contencao de incidentes. Relacionada com tenants.';
COMMENT ON TABLE public.auto_remediation_actions IS 'Acoes de remediacao automatica configuradas. Relacionada com tenants.';

-- ?? Comercial & Marketing ??
COMMENT ON TABLE public.sales_contacts IS 'Contatos comerciais para pipeline de vendas. Utilizada no modulo comercial.';
COMMENT ON TABLE public.sales_pipeline IS 'Pipeline de vendas com estagios e valores. Utilizada no dashboard comercial.';
COMMENT ON TABLE public.marketing_costs IS 'Custos de marketing por canal e periodo. Utilizada na analise de ROI.';
COMMENT ON TABLE public.installation_analytics IS 'Analiticas de instalacao dos agentes. Utilizada em metricas de adocao.';

-- ?? Infraestrutura & Observabilidade ??
COMMENT ON TABLE public.cron_health IS 'Estado de saude dos cron jobs do sistema.';
COMMENT ON TABLE public.cron_health_checks IS 'Verificacoes de saude individuais dos cron jobs.';
COMMENT ON TABLE public.chaos_test_results IS 'Resultados de testes de caos para resiliencia.';
COMMENT ON TABLE public.rollback_test_results IS 'Resultados de testes de rollback para validacao de recuperacao.';
COMMENT ON TABLE public.rls_test_results IS 'Resultados de testes de RLS para validacao de isolamento.';
COMMENT ON TABLE public.domain_events IS 'Eventos de dominio para arquitetura orientada a eventos.';
COMMENT ON TABLE public.platform_configs IS 'Configuracoes globais da plataforma.';
COMMENT ON TABLE public.feature_flags IS 'Feature flags globais para ativacao/desativacao de funcionalidades.';
COMMENT ON TABLE public.system_kill_switch IS 'Kill switch para desativacao emergencial de funcionalidades.';
COMMENT ON TABLE public.system_state IS 'Estado global do sistema para monitoramento de saude.';
COMMENT ON TABLE public.operational_calendar IS 'Calendario operacional para janelas de manutencao. Relacionada com tenants.';

-- ?? ITSM & Integracoes ??
COMMENT ON TABLE public.itsm_integrations IS 'Integracoes com sistemas ITSM (ServiceNow, Jira). Relacionada com tenants.';
COMMENT ON TABLE public.itsm_tickets IS 'Tickets criados em sistemas ITSM integrados. Relacionada com itsm_integrations e tenants.';
COMMENT ON TABLE public.siem_export_configs IS 'Configuracoes de exportacao para SIEMs externos. Relacionada com tenants.';
COMMENT ON TABLE public.user_roles IS 'Atribuicao de roles (viewer, operator, admin, etc.) por tenant. Relacionada com tenants e auth.users.';

-- ???????????????????????????????????????????????????????????????
-- ETAPA 7: TRIGGERS DE updated_at FALTANTES
-- ???????????????????????????????????????????????????????????????

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

-- ???????????????????????????????????????????????????????????????
-- ETAPA 6: INDEXES FALTANTES EM tenant_id e agent_id
-- ???????????????????????????????????????????????????????????????

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
